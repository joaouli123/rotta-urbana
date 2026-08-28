import {
  MercadoPagoError,
  cancelPreapproval,
  createSplitPreference,
  createRecurringSubscription,
  exchangeMercadoPagoCode,
  getAuthorizedPayment,
  getPayment,
  getPaymentWithToken,
  getPreapproval,
  mercadopagoConfigured,
  mercadopagoAuthorizationUrl,
  mercadopagoOAuthConfigured,
  mercadopagoRequest,
  mercadopagoSplitConfigured,
  mercadopagoWebhookConfigured,
  refreshMercadoPagoToken,
  refundPaymentWithToken,
  safeProviderMetadata,
  verifyWebhookSignature,
  webhookDataId,
  webhookTopic,
} from './mercadoPago.js';
import { decryptSecret, encryptSecret, secretBoxConfigured } from './secretBox.js';
import crypto from 'node:crypto';

const PLAN_DAYS = { daily: 1, weekly: 7, monthly: 30 };
const FIXED_PLANS = new Set(Object.keys(PLAN_DAYS));
const RIDE_PAYMENT_METHOD = 'mercadopago';

const localStatusFromProvider = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'authorized' || normalized === 'active') return 'active';
  if (['pending', 'paused_pending', 'in_process'].includes(normalized)) return 'pending';
  if (normalized === 'paused') return 'suspended';
  return 'expired';
};

const providerPaymentStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'accredited', 'processed'].includes(normalized)) return 'approved';
  if (['rejected', 'cancelled', 'canceled', 'cancelled_by_user'].includes(normalized)) return 'rejected';
  return 'pending';
};

const ridePaymentStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'refunded') return 'refunded';
  return providerPaymentStatus(normalized);
};

const providerPaymentMethod = (provider) => {
  const method = String(provider?.payment_method_id || provider?.payment_method?.id || '').toLowerCase();
  const type = String(provider?.payment_type_id || provider?.payment_method?.type || '').toLowerCase();
  if (!method && !type) return 'other';
  if (method === 'pix' || type === 'bank_transfer') return 'pix';
  if (type === 'ticket' || method.includes('ticket') || method.includes('boleto') || method === 'bolbradesco') return 'boleto';
  if (type === 'account_money' || method === 'account_money') return 'other';
  if (type === 'credit_card' || type === 'debit_card' || method) return 'card';
  return 'other';
};

const isAllowedPaymentMethod = (method) => method === 'pix' || method === 'card';

function dateOnly(value, fallbackDays = 30) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return new Date(Date.now() + fallbackDays * 864e5).toISOString().slice(0, 10);
}

function dateOnlyOrNull(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function planDays(plan) { return PLAN_DAYS[plan] || 30; }

function dueDateForProvider(provider, existing, plan, providerStatus) {
  const normalized = String(providerStatus || '').toLowerCase();
  const providerDue = dateOnlyOrNull(provider?.next_payment_date);
  const existingDue = dateOnlyOrNull(existing?.due_date);
  if (normalized === 'authorized' || normalized === 'active') {
    return providerDue || existingDue || dateOnly(null, planDays(plan));
  }
  // Pending/cancelled/paused subscriptions never grant access. Keeping a
  // historical due date is useful for the admin ledger, but the status itself
  // is what blocks access in the database.
  return existingDue || new Date().toISOString().slice(0, 10);
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

function amountFromSettings(settings, plan, segment = 'economy') {
  if (segment === 'moto') {
    if (plan === 'daily') return Number(settings.moto_daily_price ?? settings.subscription_daily_amount ?? 0);
    if (plan === 'weekly') return Number(settings.moto_weekly_price ?? settings.plan_weekly_price ?? 0);
    if (plan === 'monthly') return Number(settings.moto_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  }
  if (plan === 'monthly' && segment === 'economy') return Number(settings.car_economy_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'monthly' && segment === 'comfort') return Number(settings.car_comfort_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'monthly' && segment === 'premium') return Number(settings.car_premium_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'daily') return Number(settings.subscription_daily_amount ?? 0);
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
    admin.from('drivers').select('id,plan_type,plan_segment').eq('id', data.user.id).maybeSingle(),
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
    .select('subscription_daily_amount,subscription_monthly_amount,plan_weekly_price,commission_pct,moto_commission_pct,moto_daily_price,moto_weekly_price,moto_monthly_price,car_economy_monthly_price,car_comfort_monthly_price,car_premium_monthly_price,updated_at')
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

async function syncSubscription(admin, provider, existing, driverId, segment = existing?.plan_segment || null) {
  const plan = planFromProvider(provider, existing?.plan);
  const amount = Number(provider?.auto_recurring?.transaction_amount ?? existing?.amount ?? 0);
  const providerStatus = String(provider?.status || 'pending');
  const { data, error } = await admin.from('subscriptions').upsert({
    driver_id: driverId,
    plan,
    plan_segment: segment,
    amount: Number.isFinite(amount) ? amount : Number(existing?.amount || 0),
    status: localStatusFromProvider(providerStatus),
    due_date: dueDateForProvider(provider, existing, plan, providerStatus),
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
    paid_at: existing?.paid_at || null,
  }, { onConflict: 'driver_id' }).select('*').single();
  if (error) throw error;
  return data;
}

export async function syncSubscriptionForDriver(admin, driverId) {
  const local = await getSubscription(admin, driverId);
  if (!local?.provider_subscription_id) return local;
  const provider = await getPreapproval(local.provider_subscription_id);
  return syncSubscription(admin, provider, local, driverId);
}

export async function expireOverdueSubscriptions(admin) {
  const { error } = await admin.rpc('expire_overdue_subscriptions');
  if (error) throw error;
}

async function saveProviderPayment(admin, row, lookupColumn, lookupValue) {
  const { data: existing } = await admin.from('payments').select('id,status,paid_at')
    .eq('provider', 'mercadopago').eq(lookupColumn, String(lookupValue)).maybeSingle();
  const nextRow = {
    ...row,
    paid_at: row.status === 'approved' ? (existing?.paid_at || new Date().toISOString()) : (existing?.paid_at || null),
  };
  if (existing?.id) {
    const { error } = await admin.from('payments').update(nextRow).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, wasApproved: existing.status === 'approved' };
  }
  const { data: inserted, error } = await admin.from('payments').insert(nextRow).select('id,status').single();
  if (error) throw error;
  return { id: inserted.id, wasApproved: false };
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
  const method = providerPaymentMethod(payment);
  if (method && !isAllowedPaymentMethod(method)) {
    console.warn('[MercadoPago] cobrança ignorada: método não permitido', { driverId, method, paymentId: payment.id });
    return { driverId, paymentStatus: 'ignored', reason: 'payment_method_not_allowed' };
  }
  const row = {
    driver_id: driverId,
    subscription_id: local.id,
    amount: Number(provider.transaction_amount ?? payment.transaction_amount ?? local.amount),
    method,
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
  const saved = await saveProviderPayment(admin, row, 'provider_authorized_payment_id', provider.id);

  if (status === 'approved' && !saved.wasApproved) {
    const providerNextDate = dateOnlyOrNull(local.next_payment_at);
    if (providerNextDate && providerNextDate >= new Date().toISOString().slice(0, 10)) {
      const { error } = await admin.from('subscriptions').update({
        status: 'active', due_date: providerNextDate, paid_at: row.paid_at,
        provider_last_synced_at: new Date().toISOString(),
      }).eq('id', local.id);
      if (error) throw error;
    } else {
      const { error } = await admin.rpc('confirm_payment', {
        p_payment_id: saved.id,
        p_provider_payment_id: payment.id ? String(payment.id) : null,
      });
      if (error) throw error;
    }
  }
  return { driverId, paymentStatus: status };
}

async function applyPaymentWebhook(admin, provider) {
  const driverId = provider?.external_reference;
  if (!driverId) return null;
  const local = await getSubscription(admin, driverId);
  const status = providerPaymentStatus(provider.status);
  const method = providerPaymentMethod(provider);
  if (method && !isAllowedPaymentMethod(method)) {
    console.warn('[MercadoPago] pagamento ignorado: método não permitido', { driverId, method, paymentId: provider.id });
    return { driverId, paymentStatus: 'ignored', reason: 'payment_method_not_allowed' };
  }
  const row = {
    driver_id: driverId,
    subscription_id: local?.id || null,
    amount: Number(provider.transaction_amount || 0),
    method,
    status,
    provider: 'mercadopago',
    provider_payment_id: String(provider.id),
    provider_status: String(provider.status || 'pending'),
    provider_subscription_id: provider.preapproval_id || null,
    external_reference: driverId,
    paid_at: status === 'approved' ? new Date().toISOString() : null,
    provider_metadata: safeProviderMetadata(provider),
  };
  const saved = await saveProviderPayment(admin, row, 'provider_payment_id', provider.id);
  if (status === 'approved' && local && !saved.wasApproved) {
    const { error } = await admin.rpc('confirm_payment', {
      p_payment_id: saved.id,
      p_provider_payment_id: String(provider.id),
    });
    if (error) throw error;
  }
  return { driverId, paymentStatus: status };
}

export async function syncPaymentForAdmin(admin, paymentId) {
  const { data: row, error } = await admin.from('payments').select('provider_payment_id,provider_authorized_payment_id').eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!row) throw new MercadoPagoError('Pagamento não encontrado.', 404);
  if (row.provider_authorized_payment_id) {
    return applyAuthorizedPaymentWebhook(admin, await getAuthorizedPayment(row.provider_authorized_payment_id));
  }
  if (row.provider_payment_id) {
    return applyPaymentWebhook(admin, await getPayment(row.provider_payment_id));
  }
  throw new MercadoPagoError('Este pagamento não possui identificador do Mercado Pago.', 400);
}

function publicHost(req) {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return `${forwardedProto || req.protocol}://${req.get('host')}`;
}

function splitRedirectUri(req) {
  return String(process.env.MERCADOPAGO_SPLIT_REDIRECT_URI || `${publicHost(req)}/api/mercadopago/oauth/callback`).trim();
}

function stateHash(state) {
  return crypto.createHash('sha256').update(String(state)).digest('hex');
}

async function userFromBearer(req, admin) {
  const match = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw new MercadoPagoError('Sessão ausente ou expirada.', 401);
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) throw new MercadoPagoError('Sessão inválida ou expirada.', 401);
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id,full_name,email,role,is_active').eq('id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.is_active === false) throw new MercadoPagoError('Usuário não autorizado.', 403);
  return { user: data.user, profile };
}

function userMiddleware(admin, role) {
  return async (req, res, next) => {
    try {
      const auth = await userFromBearer(req, admin);
      if (role && auth.profile.role !== role) throw new MercadoPagoError('Usuário não autorizado para esta operação.', 403);
      req.userAuth = auth;
      next();
    } catch (error) {
      const status = error instanceof MercadoPagoError ? error.status : 401;
      res.status(status).json({ error: error.message || 'Não autorizado.' });
    }
  };
}

async function getMercadoPagoAccount(admin, driverId) {
  const { data, error } = await admin.from('mercadopago_driver_accounts')
    .select('*').eq('driver_id', driverId).maybeSingle();
  if (error) throw error;
  return data;
}

async function sellerAccessToken(admin, driverId) {
  const account = await getMercadoPagoAccount(admin, driverId);
  if (!account || account.status !== 'connected') {
    throw new MercadoPagoError('O motorista ainda não conectou a conta do Mercado Pago.', 409);
  }

  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at).getTime() : 0;
  const validForMs = expiresAt - Date.now();
  if (validForMs > 10 * 60 * 1000) {
    try {
      return { account, token: decryptSecret(account.access_token_ciphertext) };
    } catch (error) {
      await admin.from('mercadopago_driver_accounts').update({ status: 'error', last_error: 'Token criptografado inválido.' }).eq('driver_id', driverId);
      throw new MercadoPagoError('Não foi possível acessar a conta Mercado Pago do motorista.', 503, { cause: error?.message });
    }
  }

  if (!account.refresh_token_ciphertext) {
    await admin.from('mercadopago_driver_accounts').update({ status: 'error', last_error: 'Refresh token ausente ou expirado.' }).eq('driver_id', driverId);
    throw new MercadoPagoError('A conexão do Mercado Pago expirou. O motorista precisa conectar novamente.', 409);
  }

  let refreshToken;
  try { refreshToken = decryptSecret(account.refresh_token_ciphertext); }
  catch (error) {
    await admin.from('mercadopago_driver_accounts').update({ status: 'error', last_error: 'Refresh token criptografado inválido.' }).eq('driver_id', driverId);
    throw new MercadoPagoError('A conexão do Mercado Pago expirou. O motorista precisa conectar novamente.', 409, { cause: error?.message });
  }

  try {
    const refreshed = await refreshMercadoPagoToken(refreshToken);
    if (!refreshed?.access_token) throw new MercadoPagoError('O Mercado Pago não retornou um novo token.', 502, refreshed);
    const nextExpires = new Date(Date.now() + Number(refreshed.expires_in || 15552000) * 1000).toISOString();
    const nextRefresh = refreshed.refresh_token || refreshToken;
    const { data: saved, error } = await admin.from('mercadopago_driver_accounts').update({
      access_token_ciphertext: encryptSecret(refreshed.access_token),
      refresh_token_ciphertext: encryptSecret(nextRefresh),
      access_token_expires_at: nextExpires,
      status: 'connected',
      last_error: null,
    }).eq('driver_id', driverId).select('*').single();
    if (error) throw error;
    return { account: saved, token: refreshed.access_token };
  } catch (error) {
    await admin.from('mercadopago_driver_accounts').update({ status: 'error', last_error: 'Falha ao renovar o token do Mercado Pago.' }).eq('driver_id', driverId);
    if (error instanceof MercadoPagoError) throw error;
    throw new MercadoPagoError('Não foi possível renovar a conexão do Mercado Pago.', 503, { cause: error?.message });
  }
}

function calculateMarketplaceFee(settings, driver, grossAmount) {
  const plan = String(driver?.plan_type || '').toLowerCase();
  if (plan !== 'commission') return { pct: 0, fee: 0 };
  const segment = String(driver?.plan_segment || '').toLowerCase();
  const configuredPct = segment === 'moto' ? settings?.moto_commission_pct : settings?.commission_pct;
  const pct = Math.max(0, Math.min(100, Number(configuredPct ?? 15)));
  const fee = Number((Number(grossAmount) * pct / 100).toFixed(2));
  return { pct, fee };
}

async function getRideForPassenger(admin, rideId, passengerId) {
  const { data, error } = await admin.from('rides').select('id,passenger_id,driver_id,status,ride_type,price,payment_method,fare_paid,completed_at')
    .eq('id', rideId).eq('passenger_id', passengerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new MercadoPagoError('Corrida não encontrada para este passageiro.', 404);
  return data;
}

async function getRidePayment(admin, rideId) {
  const { data, error } = await admin.from('ride_payments').select('*').eq('ride_id', rideId).maybeSingle();
  if (error) throw error;
  return data;
}

function publicRidePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    ride_id: row.ride_id,
    gross_amount: Number(row.gross_amount),
    commission_pct: Number(row.commission_pct),
    marketplace_fee: Number(row.marketplace_fee),
    driver_amount: Number(row.driver_amount),
    currency: row.currency,
    method: row.method,
    status: row.status,
    provider_status: row.provider_status,
    provider_status_detail: row.provider_status_detail,
    provider_preference_id: row.provider_preference_id,
    provider_payment_id: row.provider_payment_id,
    checkout_url: row.checkout_url,
    paid_at: row.paid_at,
    refunded_at: row.refunded_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createRideCheckout(admin, req, ride) {
  if (ride.payment_method !== RIDE_PAYMENT_METHOD) {
    throw new MercadoPagoError('Esta corrida não foi configurada para pagamento pelo Mercado Pago.', 400);
  }
  if (ride.status !== 'completed') throw new MercadoPagoError('O pagamento só pode ser iniciado após a conclusão da corrida.', 409);
  if (!ride.driver_id || !Number.isFinite(Number(ride.price)) || Number(ride.price) <= 0) {
    throw new MercadoPagoError('A corrida não possui motorista ou valor válido para cobrança.', 409);
  }
  if (!mercadopagoSplitConfigured() || !secretBoxConfigured()) {
    throw new MercadoPagoError('O repasse automático ainda não está configurado no servidor.', 503);
  }

  const existing = await getRidePayment(admin, ride.id);
  if (existing?.status === 'approved') return existing;
  if (existing?.checkout_url && existing?.status === 'pending') return existing;

  const [{ data: driver, error: driverError }, settings, seller] = await Promise.all([
    admin.from('drivers').select('id,plan_type,plan_segment').eq('id', ride.driver_id).maybeSingle(),
    getSettings(admin),
    sellerAccessToken(admin, ride.driver_id),
  ]);
  if (driverError) throw driverError;
  if (!driver) throw new MercadoPagoError('Motorista não encontrado.', 404);

  const grossAmount = Number(Number(ride.price).toFixed(2));
  const { pct, fee } = calculateMarketplaceFee(settings, driver, grossAmount);
  if (existing && (Number(existing.gross_amount) !== grossAmount || existing.driver_id !== ride.driver_id)) {
    throw new MercadoPagoError('O valor desta cobrança mudou e precisa ser revisado pelo suporte.', 409);
  }

  const host = publicHost(req);
  const notificationUrl = `${host}/api/mercadopago/webhook?ride_id=${encodeURIComponent(ride.id)}`;
  const backUrl = `${host}/pagamento/retorno?ride_id=${encodeURIComponent(ride.id)}`;
  const preference = await createSplitPreference({
    sellerAccessToken: seller.token,
    rideId: ride.id,
    amount: grossAmount,
    marketplaceFee: fee,
    payerEmail: req.userAuth?.profile?.email || req.userAuth?.user?.email,
    notificationUrl,
    backUrls: { success: backUrl, pending: backUrl, failure: backUrl },
    idempotencyKey: `ride-checkout:${ride.id}`,
  });
  const checkoutUrl = preference?.init_point || preference?.sandbox_init_point;
  if (!preference?.id || !checkoutUrl) throw new MercadoPagoError('O Mercado Pago não retornou o link da corrida.', 502, preference);

  const row = {
    ride_id: ride.id,
    passenger_id: ride.passenger_id,
    driver_id: ride.driver_id,
    gross_amount: grossAmount,
    commission_pct: pct,
    marketplace_fee: fee,
    driver_amount: Number((grossAmount - fee).toFixed(2)),
    currency: 'BRL',
    provider: 'mercadopago',
    method: RIDE_PAYMENT_METHOD,
    status: 'pending',
    provider_status: preference.status || 'pending',
    provider_preference_id: String(preference.id),
    external_reference: ride.id,
    checkout_url: checkoutUrl,
    provider_metadata: safeProviderMetadata(preference),
  };
  const { data: saved, error } = await admin.from('ride_payments').upsert(row, { onConflict: 'ride_id' }).select('*').single();
  if (error) throw error;
  return saved;
}

async function applyRidePaymentWebhook(admin, provider, hintedRideId = null) {
  const providerPaymentId = provider?.id ? String(provider.id) : null;
  const externalReference = provider?.external_reference ? String(provider.external_reference) : null;
  let query = admin.from('ride_payments').select('*');
  if (providerPaymentId) query = query.eq('provider_payment_id', providerPaymentId);
  else if (externalReference) query = query.eq('external_reference', externalReference);
  else if (hintedRideId) query = query.eq('ride_id', hintedRideId);
  else return null;
  let { data: local, error } = await query.maybeSingle();
  if (error) throw error;
  if (!local && hintedRideId) {
    const result = await admin.from('ride_payments').select('*').eq('ride_id', hintedRideId).maybeSingle();
    local = result.data;
    error = result.error;
    if (error) throw error;
  }
  if (!local) return null;

  const amount = Number(provider?.transaction_amount || 0);
  if (amount > 0 && Math.abs(amount - Number(local.gross_amount)) > 0.01) {
    throw new MercadoPagoError('Valor do pagamento do Mercado Pago não confere com a corrida.', 409, { rideId: local.ride_id });
  }
  const status = ridePaymentStatus(provider?.status);
  const patch = {
    status,
    provider_status: String(provider?.status || 'pending'),
    provider_status_detail: provider?.status_detail || null,
    provider_payment_id: providerPaymentId || local.provider_payment_id,
    provider_metadata: safeProviderMetadata(provider),
    paid_at: status === 'approved' ? (local.paid_at || new Date().toISOString()) : local.paid_at,
    refunded_at: status === 'refunded' ? (local.refunded_at || new Date().toISOString()) : local.refunded_at,
  };
  const { data: saved, error: updateError } = await admin.from('ride_payments').update(patch).eq('id', local.id).select('*').single();
  if (updateError) throw updateError;

  if (status === 'approved') {
    const { error: rideError } = await admin.from('rides').update({ fare_paid: true }).eq('id', local.ride_id).eq('status', 'completed');
    if (rideError) throw rideError;
  } else if (status === 'refunded') {
    const { error: rideError } = await admin.from('rides').update({ fare_paid: false }).eq('id', local.ride_id);
    if (rideError) throw rideError;
  }
  return { rideId: local.ride_id, paymentStatus: status, driverAmount: Number(local.driver_amount) };
}

async function providerPaymentForRide(admin, paymentId, rideId) {
  const local = rideId ? await getRidePayment(admin, rideId) : null;
  if (local?.driver_id) {
    const seller = await sellerAccessToken(admin, local.driver_id);
    return getPaymentWithToken(seller.token, paymentId);
  }
  return getPayment(paymentId);
}

export function registerMercadoPagoRoutes({ app, admin, isProd }) {
  const requireDriver = bearerMiddleware(admin);
  const requirePassenger = userMiddleware(admin, 'passenger');
  const requireUser = userMiddleware(admin);

  // Reconcile rows left overdue while the service was asleep. This is best
  // effort at boot; every payment/status webhook also remains idempotent.
  void expireOverdueSubscriptions(admin).catch((error) => console.warn('[MercadoPago] overdue reconciliation:', error.message));

  app.get('/pagamento/retorno', (_req, res) => res.status(200).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Pagamento Rotta Urbana</title><body style="font-family:Arial,sans-serif;padding:40px;max-width:680px;margin:auto"><h1>Pagamento recebido</h1><p>Volte ao aplicativo para acompanhar a confirmação. A assinatura é atualizada automaticamente pelo Mercado Pago.</p></body></html>`));

  app.get('/api/mercadopago/connect/start', requireDriver, async (req, res) => {
    if (!mercadopagoOAuthConfigured() || !secretBoxConfigured()) {
      return res.status(503).json({ error: 'A conexão Mercado Pago ainda não está configurada no servidor.' });
    }
    try {
      const state = crypto.randomBytes(32).toString('hex');
      const { error } = await admin.from('mercadopago_oauth_states').insert({
        state_hash: stateHash(state),
        driver_id: req.driverAuth.driver.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      const authorizationUrl = mercadopagoAuthorizationUrl({ state, redirectUri: splitRedirectUri(req) });
      return res.json({ authorization_url: authorizationUrl, expires_in: 600 });
    } catch (error) {
      console.error('[MercadoPago OAuth start]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível iniciar a conexão Mercado Pago.' });
    }
  });

  app.get('/api/mercadopago/oauth/callback', async (req, res) => {
    const finish = (ok, message) => {
      const title = ok ? 'Mercado Pago conectado' : 'Não foi possível conectar';
      const color = ok ? '#166534' : '#991b1b';
      const appUrl = ok ? 'rottaurbana://mercadopago/connected?status=success' : 'rottaurbana://mercadopago/connected?status=error';
      const safeMessage = String(message).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      return res.status(ok ? 200 : 400).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Arial,sans-serif;padding:32px;max-width:620px;margin:auto;color:#1f2937"><h1 style="color:${color}">${title}</h1><p>${safeMessage}</p><p><a href="${appUrl}">Voltar ao aplicativo</a></p></body></html>`);
    };
    const rawState = String(req.query?.state || '').trim();
    if (!rawState) return finish(false, 'A autorização não retornou um estado válido. Inicie a conexão novamente pelo app.');
    try {
      const { data: oauthState, error } = await admin.from('mercadopago_oauth_states').select('*')
        .eq('state_hash', stateHash(rawState)).maybeSingle();
      if (error) throw error;
      if (!oauthState || oauthState.used_at || new Date(oauthState.expires_at).getTime() <= Date.now()) {
        return finish(false, 'Esta autorização expirou ou já foi utilizada. Inicie uma nova conexão pelo app.');
      }
      await admin.from('mercadopago_oauth_states').update({ used_at: new Date().toISOString() }).eq('state_hash', oauthState.state_hash);
      if (req.query?.error) return finish(false, 'A autorização foi cancelada no Mercado Pago.');
      const code = String(req.query?.code || '').trim();
      if (!code) return finish(false, 'O Mercado Pago não retornou o código de autorização.');
      if (!mercadopagoOAuthConfigured() || !secretBoxConfigured()) return finish(false, 'A conexão Mercado Pago não está configurada no servidor.');

      const tokenData = await exchangeMercadoPagoCode({ code, redirectUri: splitRedirectUri(req) });
      if (!tokenData?.access_token || !tokenData?.user_id) throw new MercadoPagoError('O Mercado Pago não retornou os dados da conta autorizada.', 502);
      const { error: saveError } = await admin.from('mercadopago_driver_accounts').upsert({
        driver_id: oauthState.driver_id,
        provider_user_id: String(tokenData.user_id),
        access_token_ciphertext: encryptSecret(tokenData.access_token),
        refresh_token_ciphertext: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : null,
        access_token_expires_at: new Date(Date.now() + Number(tokenData.expires_in || 15552000) * 1000).toISOString(),
        live_mode: tokenData.live_mode !== false,
        status: 'connected',
        last_error: null,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' });
      if (saveError) throw saveError;
      return finish(true, 'A conta do motorista foi vinculada. Os próximos pagamentos de corridas serão divididos automaticamente conforme o plano.');
    } catch (error) {
      console.error('[MercadoPago OAuth callback]', error);
      return finish(false, error instanceof MercadoPagoError ? error.message : 'Falha ao salvar a autorização. Tente novamente.');
    }
  });

  app.get('/api/mercadopago/connect/status', requireDriver, async (req, res) => {
    try {
      const account = await getMercadoPagoAccount(admin, req.driverAuth.driver.id);
      return res.json({
        connected: account?.status === 'connected',
        status: account?.status || 'disconnected',
        provider_user_id: account?.provider_user_id || null,
        live_mode: account?.live_mode ?? null,
        access_token_expires_at: account?.access_token_expires_at || null,
      });
    } catch (error) {
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível consultar a conexão Mercado Pago.' });
    }
  });

  app.post('/api/mercadopago/connect/disconnect', requireDriver, async (req, res) => {
    try {
      const { error } = await admin.from('mercadopago_driver_accounts').delete().eq('driver_id', req.driverAuth.driver.id);
      if (error) throw error;
      return res.json({ ok: true });
    } catch (error) {
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível desconectar a conta Mercado Pago.' });
    }
  });

  app.post('/api/rides/:id/payment/checkout', requirePassenger, async (req, res) => {
    try {
      const ride = await getRideForPassenger(admin, req.params.id, req.userAuth.user.id);
      const payment = await createRideCheckout(admin, req, ride);
      return res.json({ payment: publicRidePayment(payment) });
    } catch (error) {
      console.error('[MercadoPago ride checkout]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível criar o pagamento da corrida.' });
    }
  });

  app.get('/api/rides/:id/payment', requireUser, async (req, res) => {
    try {
      const { data: ride, error: rideError } = await admin.from('rides').select('id,passenger_id,driver_id').eq('id', req.params.id).maybeSingle();
      if (rideError) throw rideError;
      if (!ride || (ride.passenger_id !== req.userAuth.user.id && ride.driver_id !== req.userAuth.user.id && req.userAuth.profile.role !== 'admin')) {
        throw new MercadoPagoError('Pagamento não encontrado.', 404);
      }
      const payment = await getRidePayment(admin, req.params.id);
      return res.json({ payment: publicRidePayment(payment) });
    } catch (error) {
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível consultar o pagamento da corrida.' });
    }
  });

  app.post('/api/subscriptions/create-checkout', requireDriver, async (req, res) => {
    const plan = String(req.body?.plan || '').toLowerCase();
    const segment = String(req.body?.segment || req.driverAuth.driver.plan_segment || 'economy').toLowerCase();
    const validSegments = new Set(['moto', 'economy', 'comfort', 'premium']);
    if (!FIXED_PLANS.has(plan)) return res.status(400).json({ error: 'Plano recorrente inválido.' });
    if (!validSegments.has(segment)) return res.status(400).json({ error: 'Categoria de plano inválida.' });
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });

    try {
      const { profile, user, driver } = req.driverAuth;
      const settings = await getSettings(admin);
      const amount = amountFromSettings(settings, plan, segment);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'O valor do plano não está configurado no painel.' });

      let local = await getSubscription(admin, driver.id);
      if (local?.provider_subscription_id) {
        let current = null;
        try { current = await getPreapproval(local.provider_subscription_id); }
        catch (error) { console.warn('[MercadoPago] consulta da assinatura atual:', error.message); }
        const currentPlan = local.plan || plan;
        const currentSegment = local.plan_segment || segment;
        const currentStatus = String(current?.status || local.provider_status || '').toLowerCase();
        if (current && currentPlan === plan && currentSegment === segment && ['pending', 'authorized', 'active'].includes(currentStatus)) {
          const checkoutUrl = current.init_point || current.sandbox_init_point || local.provider_metadata?.init_point || null;
          local = await syncSubscription(admin, current, local, driver.id, segment);
          return res.json({ provider: 'mercadopago', subscription_id: String(current.id), status: current.status, plan, plan_segment: segment, amount, init_point: checkoutUrl, local_subscription_id: local.id });
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
        idempotencyKey: `subscription:${driver.id}:${plan}:${segment}:${settings.updated_at || 'current'}:${local?.provider_subscription_id || 'new'}`,
      });
      const initPoint = checkout?.init_point || checkout?.sandbox_init_point;
      if (!checkout?.id || !initPoint) throw new MercadoPagoError('O Mercado Pago não retornou o link de checkout.', 502, checkout);

      local = await syncSubscription(admin, checkout, local, driver.id, segment);
      return res.json({
        provider: 'mercadopago', subscription_id: String(checkout.id), status: checkout.status || 'pending',
        plan, plan_segment: segment, amount, init_point: initPoint, sandbox_init_point: checkout.sandbox_init_point || null,
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
      else if (topic === 'payment' || topic.includes('payment')) {
        const hintedRideId = String(req.query?.ride_id || '').trim() || null;
        const hintedRidePayment = hintedRideId ? await getRidePayment(admin, hintedRideId) : null;
        let provider;
        if (hintedRidePayment?.driver_id) {
          provider = await providerPaymentForRide(admin, dataId, hintedRideId);
          result = await applyRidePaymentWebhook(admin, provider, hintedRideId);
        } else {
          // The platform token remains the fallback for legacy subscription
          // payments and for notifications that arrive without ride_id.
          provider = await getPayment(dataId);
          result = await applyRidePaymentWebhook(admin, provider) || await applyPaymentWebhook(admin, provider);
        }
      }
      console.log(`[MercadoPago webhook] ${topic || 'unknown'} ${dataId}`, result || 'ignored');
      return res.status(200).send('OK');
    } catch (error) {
      console.error('[MercadoPago webhook]', error);
      return res.status(500).send('Retry');
    }
  });
}
