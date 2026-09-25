// Daily commission paid by Pix. The database closes each day's commissions
// into an invoice due the next morning at 10:00; an invoice past due blocks
// the driver until this Pix is confirmed.
import {
  MercadoPagoError,
  cancelPaymentQuietly,
  createPlanPixPayment,
  getPayment,
  mercadopagoConfigured,
} from './mercadoPago.js';
import crypto from 'node:crypto';

// Mercado Pago refuses a Pix that expires in less than 30 minutes.
const PIX_TTL_MS = 40 * 60e3;
// A code with less than this left is replaced instead of handed back.
const PIX_REUSE_MIN_MS = 8 * 60e3;
const REFERENCE_PREFIX = 'ru_comm:';
const TZ = 'America/Sao_Paulo';

const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

function paymentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'accredited', 'processed'].includes(normalized)) return 'approved';
  if (['rejected', 'cancelled', 'canceled', 'refunded', 'charged_back'].includes(normalized)) return 'rejected';
  return 'pending';
}

function localHour(now = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

function publicPayment(row) {
  return {
    id: row.id,
    status: row.status,
    amount: Number(row.amount),
    invoice_ids: row.invoice_ids,
    qr_code: row.pix_qr_code || null,
    qr_code_base64: row.pix_qr_code_base64 || null,
    ticket_url: row.pix_ticket_url || null,
    expires_at: row.expires_at || null,
    paid_at: row.paid_at || null,
  };
}

async function approve(admin, row, providerPaymentId) {
  const { error } = await admin.rpc('commission_payment_approve', {
    p_payment_id: row.id,
    p_provider_payment_id: providerPaymentId ? String(providerPaymentId) : null,
  });
  if (error) throw error;
  console.log('[Comissão] Pix aprovado', { driverId: row.driver_id, paymentId: row.id, amount: row.amount });
}

// Brings a local payment in line with Mercado Pago. Returns the fresh row.
async function reconcile(admin, row, provider = null) {
  if (row.status !== 'pending' || !row.provider_payment_id) return row;
  const remote = provider || await getPayment(row.provider_payment_id);
  const status = paymentStatus(remote?.status);
  if (status === 'approved') {
    const amount = Number(remote?.transaction_amount || 0);
    if (amount > 0 && amount + 0.01 < Number(row.amount)) {
      throw new MercadoPagoError('Valor do Pix da comissão não confere.', 409, { paymentId: row.id });
    }
    await approve(admin, row, remote.id);
  } else if (status === 'rejected') {
    await admin.from('commission_payments').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending');
  } else {
    return row;
  }
  const { data } = await admin.from('commission_payments').select('*').eq('id', row.id).single();
  return data || row;
}

export async function applyCommissionPaymentWebhook(admin, provider) {
  const reference = String(provider?.external_reference || '');
  if (!reference.startsWith(REFERENCE_PREFIX)) return null;
  const id = reference.slice(REFERENCE_PREFIX.length);
  const { data: row, error } = await admin.from('commission_payments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) return { commissionPayment: id, status: 'unknown' };
  if (!row.provider_payment_id && provider?.id) {
    await admin.from('commission_payments').update({ provider_payment_id: String(provider.id) }).eq('id', row.id);
    row.provider_payment_id = String(provider.id);
  }
  const fresh = await reconcile(admin, row, provider);
  return { commissionPayment: id, status: fresh.status };
}

async function openInvoices(admin, driverId) {
  const { data, error } = await admin.from('commission_invoices').select('id, amount, ref_date, due_at')
    .eq('driver_id', driverId).eq('status', 'open').order('ref_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createCommissionPix(admin, { driver, email, name, cpf, host }) {
  const now = Date.now();
  // Codes already out there: one paid meanwhile settles the invoices first.
  const { data: pending, error: pendingError } = await admin.from('commission_payments').select('*')
    .eq('driver_id', driver.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(10);
  if (pendingError) throw pendingError;
  const live = [];
  for (const row of pending || []) {
    try {
      const fresh = await reconcile(admin, row);
      if (fresh.status === 'pending') live.push(fresh);
    } catch (error) {
      console.warn('[Comissão] conferência do Pix', row.id, error.message);
      live.push(row);
    }
  }

  const invoices = await openInvoices(admin, driver.id);
  if (!invoices.length) return { status: 'nothing_due' };
  const ids = invoices.map((i) => i.id).sort();
  const amount = Number(invoices.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2));
  if (amount <= 0) return { status: 'nothing_due' };

  const same = live.find((row) => Math.abs(Number(row.amount) - amount) < 0.01
    && [...(row.invoice_ids || [])].sort().join(',') === ids.join(',')
    && row.pix_qr_code
    && new Date(row.expires_at || 0).getTime() - now > PIX_REUSE_MIN_MS);
  if (same) return publicPayment(same);

  // Only one payable code: older ones would pay for the wrong days.
  for (const row of live) {
    await cancelPaymentQuietly(row.provider_payment_id);
    await admin.from('commission_payments').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending');
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(now + PIX_TTL_MS).toISOString();
  const { error: insertError } = await admin.from('commission_payments').insert({
    id, driver_id: driver.id, amount, invoice_ids: ids, status: 'pending', expires_at: expiresAt,
  });
  if (insertError) throw insertError;
  let payment = null;
  try {
    payment = await createPlanPixPayment({
      amount,
      description: 'Rotta Urbana - comissão das corridas',
      externalReference: `${REFERENCE_PREFIX}${id}`,
      notificationUrl: `${host}/api/mercadopago/webhook`,
      payer: { email, name, cpf },
      expiresAt,
      idempotencyKey: `commission-pix:${id}`,
    });
    const data = payment?.point_of_interaction?.transaction_data || {};
    if (!payment?.id || !data.qr_code) throw new MercadoPagoError('O Mercado Pago não retornou o código Pix.', 502, payment);
    const { data: saved, error } = await admin.from('commission_payments').update({
      provider_payment_id: String(payment.id),
      pix_qr_code: data.qr_code,
      pix_qr_code_base64: data.qr_code_base64 || null,
      pix_ticket_url: data.ticket_url || null,
      expires_at: payment.date_of_expiration ? new Date(payment.date_of_expiration).toISOString() : expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error) throw error;
    console.log('[Comissão] Pix criado', { driverId: driver.id, amount, paymentId: String(payment.id) });
    return publicPayment(saved);
  } catch (error) {
    if (payment?.id) await cancelPaymentQuietly(String(payment.id));
    await admin.from('commission_payments').update({ status: 'cancelled' }).eq('id', id);
    throw error;
  }
}

export function registerCommissionRoutes({ app, admin, requireDriver, publicHost }) {
  const fail = (res, error, fallback) => {
    console.error('[Comissão]', error.message);
    const status = error instanceof MercadoPagoError ? error.status : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: error.message || fallback });
  };

  // Pix for every open day at once.
  app.post('/api/commissions/pix', requireDriver, async (req, res) => {
    if (!mercadopagoConfigured()) {
      return res.status(503).json({ error: 'Pagamento por Pix indisponível no momento. Fale com o suporte.', code: 'pix_unavailable' });
    }
    try {
      const { profile, user, driver } = req.driverAuth;
      const result = await createCommissionPix(admin, {
        driver,
        email: String(profile?.email || user.email || '').trim().toLowerCase(),
        name: profile?.full_name || '',
        cpf: profile?.cpf || '',
        host: publicHost(req),
      });
      if (result.status === 'nothing_due') return res.status(409).json({ error: 'Nenhuma comissão em aberto.', code: 'nothing_due' });
      return res.json(result);
    } catch (error) {
      return fail(res, error, 'Não foi possível gerar o Pix.');
    }
  });

  // Polled by the app while the code is on screen; the webhook is the main path.
  app.get('/api/commissions/pix/:id', requireDriver, async (req, res) => {
    try {
      const { data: row, error } = await admin.from('commission_payments').select('*')
        .eq('id', String(req.params.id)).eq('driver_id', req.driverAuth.driver.id).maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'Pagamento não encontrado.' });
      let fresh = row;
      if (mercadopagoConfigured()) {
        try {
          fresh = await reconcile(admin, row);
        } catch (checkError) {
          console.warn('[Comissão] conferência', row.id, checkError.message);
        }
      }
      return res.json(publicPayment(fresh));
    } catch (error) {
      return fail(res, error, 'Não foi possível conferir o pagamento.');
    }
  });
}

// Claims the column on the rows still unset; true when this run got them.
async function claim(admin, ids, column) {
  const { data, error } = await admin.from('commission_invoices')
    .update({ [column]: new Date().toISOString() })
    .in('id', ids).is(column, null).select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

async function release(admin, ids, column) {
  await admin.from('commission_invoices').update({ [column]: null }).in('id', ids);
}

function dueLabel(dueAt) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(dueAt));
}

// Every maintenance run: closes past days, checks pending Pix codes, and sends
// the pushes (new invoice after 7:00, reminder in the last hour, blocked).
export async function runCommissionMaintenance(admin, { sendPush }) {
  const { error: closeError } = await admin.rpc('close_commission_days');
  if (closeError) throw closeError;

  if (mercadopagoConfigured()) {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data: pending } = await admin.from('commission_payments').select('*')
      .eq('status', 'pending').not('provider_payment_id', 'is', null).gte('created_at', since).limit(50);
    for (const row of pending || []) {
      try {
        await reconcile(admin, row);
      } catch (error) {
        console.warn('[Comissão] conferência', row.id, error.message);
      }
    }
    await admin.from('commission_payments').update({ status: 'expired' })
      .eq('status', 'pending').lt('expires_at', new Date(Date.now() - 3600e3).toISOString());
  }

  const { data: invoices, error } = await admin.from('commission_invoices')
    .select('id, driver_id, amount, due_at, notified_at, reminded_at, overdue_notified_at')
    .eq('status', 'open').limit(1000);
  if (error) throw error;
  const byDriver = new Map();
  for (const invoice of invoices || []) {
    if (!byDriver.has(invoice.driver_id)) byDriver.set(invoice.driver_id, []);
    byDriver.get(invoice.driver_id).push(invoice);
  }
  if (!byDriver.size) return 0;

  const { data: profiles } = await admin.from('profiles').select('id, push_token').in('id', [...byDriver.keys()]);
  const tokens = new Map((profiles || []).map((p) => [p.id, p.push_token]));
  const now = Date.now();
  const hour = localHour(now);
  let sent = 0;

  for (const [driverId, list] of byDriver) {
    const token = tokens.get(driverId);
    if (!token) continue;
    const total = list.reduce((sum, i) => sum + Number(i.amount), 0);
    const ids = list.map((i) => i.id);
    const dueAt = list.map((i) => i.due_at).sort()[0];
    const dueMs = new Date(dueAt).getTime();
    let kind = null;
    let column = null;
    if (dueMs <= now && list.some((i) => !i.overdue_notified_at)) {
      kind = 'overdue'; column = 'overdue_notified_at';
    } else if (dueMs > now && dueMs - now <= 3600e3 && list.some((i) => !i.reminded_at)) {
      kind = 'reminder'; column = 'reminded_at';
    } else if (dueMs > now && hour >= 7 && list.some((i) => !i.notified_at)) {
      kind = 'new'; column = 'notified_at';
    }
    if (!kind) continue;
    const pending = list.filter((i) => !i[column]).map((i) => i.id);
    try {
      if (!(await claim(admin, pending, column))) continue;
    } catch (claimError) {
      console.warn('[Comissão] aviso', driverId, claimError.message);
      continue;
    }
    const message = kind === 'overdue'
      ? { title: 'Comissão em atraso', body: `Pague ${brl(total)} por Pix para voltar a receber corridas.` }
      : kind === 'reminder'
        ? { title: 'A comissão vence às ' + dueLabel(dueAt), body: `Pague ${brl(total)} por Pix para não ser bloqueado.` }
        : { title: 'Comissão de ontem', body: `${brl(total)} — pague por Pix até as ${dueLabel(dueAt)} de hoje.` };
    try {
      await sendPush({
        to: token,
        ...message,
        sound: 'default',
        priority: 'high',
        channelId: 'support',
        data: { type: 'commission_due', kind, invoice_ids: ids },
      });
      sent += 1;
    } catch (pushError) {
      console.warn('[Comissão] push', driverId, pushError.message);
      await release(admin, pending, column);
    }
  }
  return sent;
}
