import {
  MercadoPagoError,
  cancelPreapproval,
  createRecurringSubscription,
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  mercadopagoConfigured,
  mercadopagoRequest,
  mercadopagoWebhookConfigured,
  safeProviderMetadata,
  verifyWebhookSignature,
  webhookDataId,
  webhookTopic,
} from './mercadoPago.js';

const PLAN_DAYS = { daily: 1, weekly: 7, monthly: 30 };
const FIXED_PLANS = new Set(Object.keys(PLAN_DAYS));

const localStatusFromProvider = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'authorized' || normalized === 'active') return 'active';
  if (normalized === 'paused') return 'suspended';
  return 'expired';
};

const providerPaymentStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'accredited', 'processed'].includes(normalized)) return 'approved';
  if (['rejected', 'cancelled', 'canceled', 'cancelled_by_user'].includes(normalized)) return 'rejected';
  return 'pending';
};

const providerPaymentMethod = (provider) => {
  const method = String(provider?.payment_method_id || provider?.payment_method?.id || '').toLowerCase();
  if (method === 'pix') return 'pix';
  if (method.includes('ticket') || method.includes('boleto')) return 'boleto';
  return 'card';
};

function dateOnly(value, fallbackDays = 30) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return new Date(Date.now() + fallbackDays * 864e5).toISOString().slice(0, 10);
}

function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function planFromProvider(provider, fallback = 'monthly') {
  const frequency = Number(provider?.auto_recurring?.frequency);
  const frequencyType = provider?.auto_recurring?.frequency_type;
  if (frequencyType === 'days' && frequency === 1) return 'daily';
  if (frequencyType === 'days' && frequency === 7) return 'weekly';
  return FIXED_PLANS.has(fallback) ? fallback : 'monthly';
}

function amountFromSettings(settings, plan) {
  if (plan === 'daily') return Number(settings.plan_daily_price ?? settings.subscription_daily_amount ?? 0);
  if (plan === 'weekly') return Number(settings.plan_weekly_price ?? (Number(settings.subscription_monthly_amount || 0) / 4));
  if (plan === 'monthly') return Number(settings.subscription_monthly_amount || 0);
  return 0;
}

async function driverFromBearer(req, admin) {
  const match = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw new MercadoPagoError('Sessão do motorista ausente ou expirada.', 401);
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) throw new MercadoPagoError('Sessão do motorista inválida.', 401);

  const [{ data: profile }, { data: driver }] = await Promise.all([
    admin.from('profiles').select('id,full_name,email,role,is_active').eq('id', data.user.id).maybeSingle(),
    admin.from('drivers').select('id,plan_type').eq('id', data.user.id).maybeSingle(),
  ]);
  if (!driver || profile?.role !== 'driver' || profile?.is_active === false) {
    throw new MercadoPagoError('Apenas motoristas podem contratar uma assinatura.', 403);
  }
  return { user: data.user, profile, driver };
}

function bearerMiddleware(admin) {
  return async (req, res, next) => {
    try {
      req.driverAuth = await driverFromBearer(req, admin);
      next();
    } catch (error) {
      const status = error instanceof MercadoPagoError ? error.status : 401;
      res.status(status).json({ error: error.message || 'Não autorizado.' });
    }
  };
}

async function getSettings(admin) {
  const { data, error } = await admin.from('app_settings')
    .select('subscription_daily_amount,subscription_monthly_amount,plan_daily_price,plan_weekly_price,updated_at')
    .eq('id', 1).single();
  if (error) throw error;
  return data || {};
}

async function getSubscription(admin, driverId) {
  const { data, error } = await admin.from('subscriptions').select('*').eq('driver_id', driverId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getSubscriptionByProviderId(admin, providerId) {
  const { data } = await admin.from('subscriptions').select('*')
    .eq('provider_subscription_id', String(providerId)).maybeSingle();
  return data;
}

async function syncSubscription(admin, provider, existing, driverId) {
  const plan = planFromProvider(provider, existing?.plan);
  const amount = Number(provider?.auto_recurring?.transaction_amount ?? existing?.amount ?? 0);
  const providerStatus = String(provider?.status || 'pending');
  const { data, error } = await admin.from('subscriptions').upsert({
    driver_id: driverId,
    plan,
    amount: Number.isFinite(amount) ? amount : Number(existing?.amount || 0),
    status: localStatusFromProvider(providerStatus),
    due_date: dateOnly(provider?.next_payment_date, PLAN_DAYS[plan]),
    provider: 'mercadopago',
    provider_subscription_id: String(provider.id),
    provider_status: providerStatus,
    provider_payment_method_id: provider.payment_method_id || null,
    next_payment_at: dateTime(provider.next_payment_date),
    provider_last_synced_at: new Date().toISOString(),
    provider_cancelled_at: ['cancelled', 'canceled'].includes(providerStatus.toLowerCase()) ? new Date().toISOString() : null,
    provider_metadata: {
      ...safeProviderMetadata(provider),
      init_point: provider.init_point || existing?.provider_metadata?.init_point || null,
      sandbox_init_point: provider.sandbox_init_point || existing?.provider_metadata?.sandbox_init_point || null,
    },
  }, { onConflict: 'driver_id' }).select('*').single();
  if (error) throw error;
  return data;
}

async function applyPreapprovalWebhook(admin, provider) {
  const driverId = provider?.external_reference;
  let local = await getSubscriptionByProviderId(admin, provider?.id);
  if (!local && driverId) local = await getSubscription(admin, driverId);
  if (!local && !driverId) return null;
  return syncSubscription(admin, provider, local, driverId || local.driver_id);
}

async function applyAuthorizedPaymentWebhook(admin, provider) {
  const payment = provider?.payment || {};
  const providerSubscriptionId = provider?.preapproval_id || null;
  let local = providerSubscriptionId ? await getSubscriptionByProviderId(admin, providerSubscriptionId) : null;
  const driverId = provider?.external_reference || local?.driver_id;
  if (!local && driverId) local = await getSubscription(admin, driverId);
  if (!local || !driverId) return null;

  const providerStatus = payment.status || provider.status;
  const status = providerPaymentStatus(providerStatus);
  const row = {
    driver_id: driverId,
    subscription_id: local.id,
    amount: Number(provider.transaction_amount ?? payment.transaction_amount ?? local.amount),
    method: providerPaymentMethod(payment),
    status,
    provider: 'mercadopago',
    provider_payment_id: payment.id ? String(payment.id) : null,
    provider_status: String(providerStatus || 'pending'),
    provider_subscription_id: providerSubscriptionId,
    provider_authorized_payment_id: String(provider.id),
    external_reference: driverId,
    paid_at: status === 'approved' ? new Date().toISOString() : null,
    provider_metadata: {
      ...safeProviderMetadata(payment),
      debit_date: provider.debit_date || null,
      summarized: provider.summarized || null,
    },
  };
  const { data: existing } = await admin.from('payments').select('id').eq('provider', 'mercadopago')
    .eq('provider_authorized_payment_id', String(provider.id)).maybeSingle();
  if (existing?.id) await admin.from('payments').update(row).eq('id', existing.id);
  else await admin.from('payments').insert(row);

  if (status === 'approved') {
    const nextDate = local.next_payment_at && new Date(local.next_payment_at) > new Date()
      ? new Date(local.next_payment_at).toISOString().slice(0, 10)
      : dateOnly(null, PLAN_DAYS[local.plan] || 30);
    await admin.from('subscriptions').update({
      status: 'active', paid_at: row.paid_at, due_date: nextDate,
      provider_last_synced_at: new Date().toISOString(),
    }).eq('id', local.id);
  }
  return { driverId, paymentStatus: status };
}

async function applyPaymentWebhook(admin, provider) {
  const driverId = provider?.external_reference;
  if (!driverId) return null;
  const local = await getSubscription(admin, driverId);
  const status = providerPaymentStatus(provider.status);
  const row = {
    driver_id: driverId,
    subscription_id: local?.id || null,
    amount: Number(provider.transaction_amount || 0),
    method: providerPaymentMethod(provider),
    status,
    provider: 'mercadopago',
    provider_payment_id: String(provider.id),
    provider_status: String(provider.status || 'pending'),
    provider_subscription_id: provider.preapproval_id || null,
    external_reference: driverId,
    paid_at: status === 'approved' ? new Date().toISOString() : null,
    provider_metadata: safeProviderMetadata(provider),
  };
  const { data: existing } = await admin.from('payments').select('id').eq('provider', 'mercadopago')
    .eq('provider_payment_id', String(provider.id)).maybeSingle();
  if (existing?.id) await admin.from('payments').update(row).eq('id', existing.id);
  else await admin.from('payments').insert(row);
  if (status === 'approved' && local) {
    await admin.from('subscriptions').update({
      status: 'active', due_date: dateOnly(null, PLAN_DAYS[local.plan] || 30), paid_at: row.paid_at,
    }).eq('id', local.id);
  }
  return { driverId, paymentStatus: status };
}

export function registerMercadoPagoRoutes({ app, admin, isProd }) {
  const requireDriver = bearerMiddleware(admin);

  app.get('/pagamento/retorno', (_req, res) => res.status(200).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Pagamento Rotta Urbana</title><body style="font-family:Arial,sans-serif;padding:40px;max-width:680px;margin:auto"><h1>Pagamento recebido</h1><p>Volte ao aplicativo para acompanhar a confirmação. A assinatura é atualizada automaticamente pelo Mercado Pago.</p></body></html>`));

  app.post('/api/subscriptions/create-checkout', requireDriver, async (req, res) => {
    const plan = String(req.body?.plan || '').toLowerCase();
    if (!FIXED_PLANS.has(plan)) return res.status(400).json({ error: 'Plano recorrente inválido.' });
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });

    try {
      const { profile, user, driver } = req.driverAuth;
      const settings = await getSettings(admin);
      const amount = amountFromSettings(settings, plan);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'O valor do plano não está configurado no painel.' });

      let local = await getSubscription(admin, driver.id);
      if (local?.provider_subscription_id) {
        let current = null;
        try { current = await getPreapproval(local.provider_subscription_id); }
        catch (error) { console.warn('[MercadoPago] consulta da assinatura atual:', error.message); }
        const currentPlan = local.plan || plan;
        const currentStatus = String(current?.status || local.provider_status || '').toLowerCase();
        if (current && currentPlan === plan && ['pending', 'authorized', 'active'].includes(currentStatus)) {
          const checkoutUrl = current.init_point || current.sandbox_init_point || local.provider_metadata?.init_point || null;
          local = await syncSubscription(admin, current, local, driver.id);
          return res.json({ provider: 'mercadopago', subscription_id: String(current.id), status: current.status, plan, amount, init_point: checkoutUrl, local_subscription_id: local.id });
        }
        if (current && !['cancelled', 'canceled'].includes(currentStatus)) {
          await cancelPreapproval(local.provider_subscription_id);
          await admin.from('subscriptions').update({ status: 'expired', provider_status: 'cancelled', provider_cancelled_at: new Date().toISOString() }).eq('id', local.id);
        }
      }

      const host = String(process.env.PUBLIC_APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
      const checkout = await createRecurringSubscription({
        driverId: driver.id,
        email: String(profile?.email || user.email || '').trim().toLowerCase(),
        plan,
        amount,
        backUrl: `${host}/pagamento/retorno`,
        notificationUrl: `${host}/api/mercadopago/webhook`,
        idempotencyKey: `subscription:${driver.id}:${plan}:${settings.updated_at || 'current'}:${local?.provider_subscription_id || 'new'}`,
      });
      const initPoint = checkout?.init_point || checkout?.sandbox_init_point;
      if (!checkout?.id || !initPoint) throw new MercadoPagoError('O Mercado Pago não retornou o link de checkout.', 502, checkout);

      local = await syncSubscription(admin, checkout, local, driver.id);
      return res.json({
        provider: 'mercadopago', subscription_id: String(checkout.id), status: checkout.status || 'pending',
        plan, amount, init_point: initPoint, sandbox_init_point: checkout.sandbox_init_point || null,
        local_subscription_id: local.id,
      });
    } catch (error) {
      console.error('[MercadoPago create subscription]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível criar o checkout.' });
    }
  });

  app.get('/api/subscriptions/status', requireDriver, async (req, res) => {
    try {
      let local = await getSubscription(admin, req.driverAuth.driver.id);
      if (local?.provider_subscription_id) {
        const provider = await getPreapproval(local.provider_subscription_id);
        local = await syncSubscription(admin, provider, local, req.driverAuth.driver.id);
        return res.json({ subscription: local, provider: { id: provider.id, status: provider.status, next_payment_date: provider.next_payment_date || null } });
      }
      return res.json({ subscription: local, provider: null });
    } catch (error) {
      console.error('[MercadoPago subscription status]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível consultar a assinatura.' });
    }
  });

  app.post('/api/subscriptions/cancel', requireDriver, async (req, res) => {
    try {
      const local = await getSubscription(admin, req.driverAuth.driver.id);
      if (local?.provider_subscription_id && !['cancelled', 'canceled'].includes(String(local.provider_status || '').toLowerCase())) {
        await cancelPreapproval(local.provider_subscription_id);
      }
      if (local) await admin.from('subscriptions').update({ status: 'expired', provider_status: 'cancelled', provider_cancelled_at: new Date().toISOString() }).eq('id', local.id);
      return res.json({ ok: true });
    } catch (error) {
      console.error('[MercadoPago cancel subscription]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível cancelar a assinatura.' });
    }
  });

  // Kept for clients that still request a one-off PIX. It is authenticated,
  // price-locked to app_settings, writes provider_payment_id, and never
  // silently downgrades to an untracked manual PIX.
  app.post('/api/payments/create-pix', requireDriver, async (req, res) => {
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });
    const plan = String(req.body?.plan || '').toLowerCase();
    if (!FIXED_PLANS.has(plan)) return res.status(400).json({ error: 'Informe um plano válido para gerar o PIX.' });
    try {
      const settings = await getSettings(admin);
      const amount = amountFromSettings(settings, plan);
      const driverId = req.driverAuth.driver.id;
      const email = String(req.driverAuth.profile?.email || req.driverAuth.user.email || '').trim().toLowerCase();
      const data = await mercadopagoRequest('/v1/payments', {
        method: 'POST',
        idempotencyKey: `pix:${driverId}:${plan}:${new Date().toISOString().slice(0, 10)}`,
        body: { transaction_amount: Number(amount.toFixed(2)), description: `Rotta Urbana — Plano ${plan}`, payment_method_id: 'pix', payer: { email }, external_reference: driverId },
      });
      const pix = data.point_of_interaction?.transaction_data || {};
      const subscription = await getSubscription(admin, driverId);
      const { error } = await admin.from('payments').insert({
        driver_id: driverId, subscription_id: subscription?.id || null, amount: Number(amount.toFixed(2)), method: 'pix',
        provider: 'mercadopago', status: providerPaymentStatus(data.status), provider_payment_id: String(data.id),
        provider_status: String(data.status || 'pending'), external_reference: driverId,
        pix_qr_code: pix.qr_code || null, pix_qr_code_base64: pix.qr_code_base64 || null, pix_ticket_url: pix.ticket_url || null,
        expires_at: dateTime(data.date_of_expiration), provider_metadata: safeProviderMetadata(data),
      });
      if (error) throw error;
      return res.json({ provider: 'mercadopago', payment_id: data.id, status: data.status, qr_code: pix.qr_code, qr_code_base64: pix.qr_code_base64, ticket_url: pix.ticket_url, expires_at: data.date_of_expiration || null });
    } catch (error) {
      console.error('[MercadoPago PIX]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível gerar o PIX.' });
    }
  });

  app.post('/api/mercadopago/webhook', async (req, res) => {
    const dataId = webhookDataId(req);
    const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
    if (isProd && !mercadopagoWebhookConfigured()) {
      console.error('[MercadoPago webhook] MERCADOPAGO_WEBHOOK_SECRET ausente.');
      return res.status(503).send('Webhook secret not configured');
    }
    if (secret && !verifyWebhookSignature({ signature: req.get('x-signature'), requestId: req.get('x-request-id'), dataId, secret })) {
      return res.status(401).send('Invalid signature');
    }
    if (!dataId || !mercadopagoConfigured()) return res.status(200).send('Ignored');
    try {
      const topic = String(webhookTopic(req)).toLowerCase();
      let result = null;
      if (topic.includes('subscription_authorized_payment')) result = await applyAuthorizedPaymentWebhook(admin, await getAuthorizedPayment(dataId));
      else if (topic.includes('subscription_preapproval')) result = await applyPreapprovalWebhook(admin, await getPreapproval(dataId));
      else if (topic === 'payment' || topic.includes('payment')) result = await applyPaymentWebhook(admin, await getPayment(dataId));
      console.log(`[MercadoPago webhook] ${topic || 'unknown'} ${dataId}`, result || 'ignored');
      return res.status(200).send('OK');
    } catch (error) {
      console.error('[MercadoPago webhook]', error);
      return res.status(500).send('Retry');
    }
  });
}
