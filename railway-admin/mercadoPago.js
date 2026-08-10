import crypto from 'node:crypto';

const API_BASE = 'https://api.mercadopago.com';

export class MercadoPagoError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'MercadoPagoError';
    this.status = status;
    this.details = details;
  }
}

const accessToken = () => String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();

export function mercadopagoConfigured() {
  return accessToken().length >= 20;
}

export function mercadopagoWebhookConfigured() {
  return String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim().length >= 16;
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

export async function mercadopagoRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
  const token = accessToken();
  if (!token) throw new MercadoPagoError('MERCADOPAGO_ACCESS_TOKEN não configurado.', 503);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 500) }; }
  if (!response.ok) {
    const providerMessage = data?.message || data?.error || `HTTP ${response.status}`;
    throw new MercadoPagoError(`Mercado Pago: ${providerMessage}`, response.status, data);
  }
  return data;
}

export function buildRecurringSchedule(plan, amount) {
  const schedules = {
    daily: { frequency: 1, frequency_type: 'days', days: 1 },
    weekly: { frequency: 7, frequency_type: 'days', days: 7 },
    monthly: { frequency: 1, frequency_type: 'months', days: 30 },
  };
  const schedule = schedules[plan];
  if (!schedule) throw new MercadoPagoError('Plano não recorrente.', 400);
  return {
    frequency: schedule.frequency,
    frequency_type: schedule.frequency_type,
    transaction_amount: Number(Number(amount).toFixed(2)),
    currency_id: 'BRL',
    _days: schedule.days,
  };
}

export async function createRecurringSubscription({ driverId, email, plan, amount, backUrl, notificationUrl, idempotencyKey }) {
  const schedule = buildRecurringSchedule(plan, amount);
  const autoRecurring = {
    frequency: schedule.frequency,
    frequency_type: schedule.frequency_type,
    transaction_amount: schedule.transaction_amount,
    currency_id: schedule.currency_id,
  };
  return mercadopagoRequest('/preapproval', {
    method: 'POST',
    idempotencyKey,
    body: {
      reason: `Rotta Urbana — Plano ${plan}`,
      external_reference: driverId,
      payer_email: email,
      auto_recurring: autoRecurring,
      back_url: backUrl,
      notification_url: notificationUrl,
      status: 'pending',
    },
  });
}

export const getPreapproval = (id) => mercadopagoRequest(`/preapproval/${encodeURIComponent(id)}`);
export const getAuthorizedPayment = (id) => mercadopagoRequest(`/authorized_payments/${encodeURIComponent(id)}`);
export const getPayment = (id) => mercadopagoRequest(`/v1/payments/${encodeURIComponent(id)}`);

export const updatePreapproval = (id, body) => mercadopagoRequest(`/preapproval/${encodeURIComponent(id)}`, {
  method: 'PUT', body,
});

export const cancelPreapproval = (id) => updatePreapproval(id, { status: 'cancelled' });

function signaturePart(signature, key) {
  return String(signature || '').split(',').map((item) => item.trim().split('='))
    .find(([name]) => name === key)?.[1] || '';
}

export function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  if (!signature || !requestId || !dataId || !secret) return false;
  const ts = signaturePart(signature, 'ts');
  const v1 = signaturePart(signature, 'v1');
  if (!ts || !v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const received = Buffer.from(v1, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

export function webhookDataId(req) {
  return req.body?.data?.id || req.query?.['data.id'] || req.query?.data_id || req.query?.id || null;
}

export function webhookTopic(req) {
  return req.body?.type || req.body?.topic || req.query?.type || req.query?.topic || req.body?.action || '';
}

export function safeProviderMetadata(data = {}) {
  return {
    status_detail: data.status_detail ?? null,
    payment_method_id: data.payment_method_id ?? null,
    preapproval_id: data.preapproval_id ?? null,
    external_reference: data.external_reference ?? null,
    date_created: data.date_created ?? null,
  };
}

export function providerConfigSummary() {
  return {
    accessToken: mercadopagoConfigured(),
    webhookSecret: mercadopagoWebhookConfigured(),
    api: API_BASE,
  };
}

export { safeJson };
