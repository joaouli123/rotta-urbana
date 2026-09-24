import crypto from 'node:crypto';

const API_BASE = 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 20_000;

export class MercadoPagoError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'MercadoPagoError';
    this.status = status;
    this.details = details;
  }
}

const accessToken = () => String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
const clientId = () => String(process.env.MERCADOPAGO_CLIENT_ID || '').trim();
const clientSecret = () => String(process.env.MERCADOPAGO_CLIENT_SECRET || '').trim();

export function mercadopagoConfigured() {
  return accessToken().length >= 20;
}

export function mercadopagoWebhookConfigured() {
  return String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim().length >= 16;
}

export function mercadopagoOAuthConfigured() {
  return clientId().length >= 6 && clientSecret().length >= 12;
}

export function mercadopagoSplitConfigured() {
  return mercadopagoConfigured() && mercadopagoOAuthConfigured();
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

export async function mercadopagoRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
  const token = accessToken();
  if (!token) throw new MercadoPagoError('MERCADOPAGO_ACCESS_TOKEN não configurado.', 503);

  return mercadopagoRequestWithToken(token, path, { method, body, idempotencyKey });
}

async function parseResponse(response) {
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 500) }; }
  return data;
}

async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MercadoPagoError('Mercado Pago demorou demais para responder.', 504);
    }
    throw new MercadoPagoError('Não foi possível conectar ao Mercado Pago.', 502, { cause: error?.message });
  } finally {
    clearTimeout(timeout);
  }
}

export async function mercadopagoRequestWithToken(token, path, { method = 'GET', body, idempotencyKey } = {}) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new MercadoPagoError('Token do Mercado Pago ausente.', 503);

  const headers = {
    Authorization: `Bearer ${normalizedToken}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const response = await requestJson(`${API_BASE}${path}`, {
    method,
    headers,
    body,
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const providerMessage = data?.message || data?.error || `HTTP ${response.status}`;
    throw new MercadoPagoError(`Mercado Pago: ${providerMessage}`, response.status, data);
  }
  return data;
}

async function oauthTokenRequest(body) {
  if (!mercadopagoOAuthConfigured()) {
    throw new MercadoPagoError('OAuth do Mercado Pago não está configurado no servidor.', 503);
  }
  const response = await requestJson(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: { client_id: clientId(), client_secret: clientSecret(), ...body },
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const providerMessage = data?.message || data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new MercadoPagoError(`Mercado Pago OAuth: ${providerMessage}`, response.status, data);
  }
  return data;
}

export function mercadopagoAuthorizationUrl({ state, redirectUri }) {
  if (!mercadopagoOAuthConfigured()) {
    throw new MercadoPagoError('OAuth do Mercado Pago não está configurado no servidor.', 503);
  }
  const url = new URL('https://auth.mercadopago.com/authorization');
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('state', String(state));
  url.searchParams.set('redirect_uri', String(redirectUri));
  return url.toString();
}

export function exchangeMercadoPagoCode({ code, redirectUri }) {
  return oauthTokenRequest({ grant_type: 'authorization_code', code: String(code), redirect_uri: String(redirectUri) });
}

export function refreshMercadoPagoToken(refreshToken) {
  return oauthTokenRequest({ grant_type: 'refresh_token', refresh_token: String(refreshToken) });
}

export const getPaymentWithToken = (token, id) => mercadopagoRequestWithToken(token, `/v1/payments/${encodeURIComponent(id)}`);

export function createSplitPreference({ sellerAccessToken, rideId, amount, marketplaceFee, payerEmail, notificationUrl, backUrls, idempotencyKey }) {
  const safeAmount = Number(Number(amount).toFixed(2));
  const safeFee = Number(Number(marketplaceFee).toFixed(2));
  return mercadopagoRequestWithToken(sellerAccessToken, '/checkout/preferences', {
    method: 'POST',
    idempotencyKey,
    body: {
      items: [{
        id: `ride-${rideId}`,
        title: 'Corrida Rotta Urbana',
        description: 'Pagamento de corrida',
        currency_id: 'BRL',
        quantity: 1,
        unit_price: safeAmount,
      }],
      marketplace_fee: safeFee,
      payer: payerEmail ? { email: String(payerEmail).trim().toLowerCase() } : undefined,
      external_reference: String(rideId),
      notification_url: notificationUrl,
      back_urls: backUrls,
      auto_return: 'approved',
      statement_descriptor: 'ROTTA URBANA',
    },
  });
}

// A daily pass is a one-time charge. Unlike /preapproval it does not create a
// recurring authorization or require the driver to link a Mercado Pago account.
export function createDailyPlanPreference({ driverId, amount, externalReference, notificationUrl, backUrls, idempotencyKey }) {
  const safeAmount = Number(Number(amount).toFixed(2));
  return mercadopagoRequest('/checkout/preferences', {
    method: 'POST',
    idempotencyKey,
    body: {
      items: [{
        id: `daily-pass-${driverId}`,
        title: 'Plano Diário Rotta Urbana',
        description: 'Acesso ao app por um dia; renovação manual.',
        currency_id: 'BRL',
        quantity: 1,
        unit_price: safeAmount,
      }],
      external_reference: String(externalReference),
      notification_url: notificationUrl,
      back_urls: backUrls,
      auto_return: 'approved',
      statement_descriptor: 'ROTTA URBANA',
      // Remove boleto/offline payments; Pix, card and the provider's wallet
      // remain available where Mercado Pago supports them.
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: 'ticket' }],
      },
      // No payer is pre-filled so Checkout Pro can offer its guest flow.
    },
  });
}

export function refundPaymentWithToken(sellerAccessToken, paymentId, amount, idempotencyKey) {
  const body = amount == null ? {} : { amount: Number(Number(amount).toFixed(2)) };
  return mercadopagoRequestWithToken(sellerAccessToken, `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: 'POST', body, idempotencyKey,
  });
}

export function buildRecurringSchedule(plan, amount) {
  const schedules = {
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
    status: data.status ?? null,
    status_detail: data.status_detail ?? null,
    payment_method_id: data.payment_method_id ?? null,
    payment_type_id: data.payment_type_id ?? null,
    transaction_amount: data.transaction_amount ?? null,
    net_received_amount: data.transaction_details?.net_received_amount ?? data.net_received_amount ?? null,
    total_paid_amount: data.transaction_details?.total_paid_amount ?? data.total_paid_amount ?? null,
    fee_details: Array.isArray(data.fee_details) ? data.fee_details : [],
    collector_id: data.collector_id ?? null,
    preapproval_id: data.preapproval_id ?? null,
    external_reference: data.external_reference ?? null,
    date_created: data.date_created ?? null,
  };
}

export function providerConfigSummary() {
  return {
    accessToken: mercadopagoConfigured(),
    webhookSecret: mercadopagoWebhookConfigured(),
    oauth: mercadopagoOAuthConfigured(),
    split: mercadopagoSplitConfigured(),
    api: API_BASE,
  };
}

export { safeJson };
