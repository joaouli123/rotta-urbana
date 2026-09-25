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

// The public key only loads the card form (Card Payment Brick) in the app.
export const mercadoPagoPublicKey = () => String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();

export function mercadopagoConfigured() {
  return accessToken().length >= 20;
}

// Card typed inside the app. Without the public key the card goes through
// Checkout Pro instead.
export function mercadopagoCardConfigured() {
  const key = mercadoPagoPublicKey();
  return mercadopagoConfigured() && key.length >= 20 && /^[\w-]+$/.test(key);
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

export async function mercadopagoRequest(path, { method = 'GET', body, idempotencyKey, headers } = {}) {
  const token = accessToken();
  if (!token) throw new MercadoPagoError('MERCADOPAGO_ACCESS_TOKEN não configurado.', 503);

  return mercadopagoRequestWithToken(token, path, { method, body, idempotencyKey, headers });
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

export async function mercadopagoRequestWithToken(token, path, { method = 'GET', body, idempotencyKey, headers: extraHeaders = {} } = {}) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new MercadoPagoError('Token do Mercado Pago ausente.', 503);

  const headers = {
    ...extraHeaders,
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
  const url = new URL('https://auth.mercadopago.com.br/authorization');
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

const PASS_COPY = {
  daily: { title: 'Plano Diário Rotta Urbana', description: 'Acesso ao app por 1 dia; renovação manual.' },
  weekly: { title: 'Plano Semanal Rotta Urbana', description: 'Acesso ao app por 7 dias; renovação manual.' },
};

// Mercado Pago wants yyyy-MM-ddTHH:mm:ss.SSS with an offset. Brasília has had
// no daylight saving time since 2019, so -03:00 is always right.
export function mercadopagoDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new MercadoPagoError('Data de expiração inválida.', 500);
  return `${new Date(date.getTime() - 3 * 3600e3).toISOString().slice(0, 23)}-03:00`;
}

// A pass (daily or weekly) is a one-time charge. Unlike /preapproval it does
// not create a recurring authorization or require a Mercado Pago account.
// The link stops working at expiresAt, so an old tab cannot be paid again.
export function createPlanPassPreference({ plan = 'daily', driverId, amount, externalReference, notificationUrl, backUrls, idempotencyKey, expiresAt }) {
  const safeAmount = Number(Number(amount).toFixed(2));
  const copy = PASS_COPY[plan] || PASS_COPY.daily;
  const expiry = expiresAt ? {
    expires: true,
    expiration_date_from: mercadopagoDateTime(Date.now() - 60e3),
    expiration_date_to: mercadopagoDateTime(expiresAt),
    // Also ends a Pix generated inside Checkout Pro at the same time.
    date_of_expiration: mercadopagoDateTime(expiresAt),
  } : {};
  return mercadopagoRequest('/checkout/preferences', {
    method: 'POST',
    idempotencyKey,
    body: {
      items: [{
        id: `${plan}-pass-${driverId}`,
        title: copy.title,
        description: copy.description,
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
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      },
      ...expiry,
      // No payer is pre-filled so Checkout Pro can offer its guest flow.
    },
  });
}

// Pix paid inside the app: Mercado Pago returns the copy-and-paste code and
// the QR image. Needs a Pix key registered on the platform's account.
export function createPlanPixPayment({ plan = 'daily', amount, externalReference, notificationUrl, payer = {}, expiresAt, idempotencyKey }) {
  const copy = PASS_COPY[plan] || PASS_COPY.daily;
  const cpf = String(payer.cpf || '').replace(/\D/g, '');
  const names = String(payer.name || '').trim().split(/\s+/).filter(Boolean);
  return mercadopagoRequest('/v1/payments', {
    method: 'POST',
    idempotencyKey,
    body: {
      transaction_amount: Number(Number(amount).toFixed(2)),
      description: copy.title,
      payment_method_id: 'pix',
      payer: {
        email: String(payer.email || '').trim().toLowerCase(),
        ...(names.length ? { first_name: names[0] } : {}),
        ...(names.length > 1 ? { last_name: names.slice(1).join(' ') } : {}),
        ...(cpf.length === 11 ? { identification: { type: 'CPF', number: cpf } } : {}),
      },
      external_reference: String(externalReference),
      notification_url: notificationUrl,
      date_of_expiration: mercadopagoDateTime(expiresAt),
    },
  });
}

// Card typed into the app's form (Card Payment Brick). The card data goes from
// the form straight to Mercado Pago, which hands back a one-use token; only the
// token reaches this server. binary_mode asks for an answer right away
// (approved or rejected) instead of a manual review that could take days.
export function createPlanCardPayment({ plan = 'daily', amount, externalReference, notificationUrl, token, paymentMethodId, issuerId, payer = {}, deviceId, idempotencyKey }) {
  const copy = PASS_COPY[plan] || PASS_COPY.daily;
  const safeAmount = Number(Number(amount).toFixed(2));
  const names = String(payer.name || '').trim().split(/\s+/).filter(Boolean);
  const nameParts = {
    ...(names.length ? { first_name: names[0] } : {}),
    ...(names.length > 1 ? { last_name: names.slice(1).join(' ') } : {}),
  };
  const docType = String(payer.identification?.type || '').toUpperCase();
  const docNumber = String(payer.identification?.number || '').replace(/\D/g, '');
  const identification = (docType === 'CPF' && docNumber.length === 11) || (docType === 'CNPJ' && docNumber.length === 14)
    ? { type: docType, number: docNumber }
    : null;
  const issuer = /^\d{1,12}$/.test(String(issuerId ?? '')) ? String(issuerId) : null;
  // The device fingerprint of the form helps Mercado Pago approve the card.
  const session = /^[\w:.-]{1,128}$/.test(String(deviceId || '')) ? String(deviceId) : null;
  return mercadopagoRequest('/v1/payments', {
    method: 'POST',
    idempotencyKey,
    headers: session ? { 'X-meli-session-id': session } : {},
    body: {
      transaction_amount: safeAmount,
      token: String(token),
      description: copy.title,
      installments: 1,
      payment_method_id: String(paymentMethodId),
      ...(issuer ? { issuer_id: issuer } : {}),
      payer: {
        email: String(payer.email || '').trim().toLowerCase(),
        ...nameParts,
        ...(identification ? { identification } : {}),
      },
      external_reference: String(externalReference),
      notification_url: notificationUrl,
      statement_descriptor: 'ROTTA URBANA',
      binary_mode: true,
      additional_info: {
        items: [{
          id: `${plan}-pass`,
          title: copy.title,
          description: copy.description,
          category_id: 'services',
          quantity: 1,
          unit_price: safeAmount,
        }],
        ...(names.length ? { payer: nameParts } : {}),
      },
    },
  });
}

// A Pix code the driver will not use anymore. Cancelling fails when it was
// just paid; the webhook then credits it like any other payment, so a failure
// here is only logged.
export async function cancelPaymentQuietly(id) {
  if (!id) return true;
  try {
    await mercadopagoRequest(`/v1/payments/${encodeURIComponent(id)}`, { method: 'PUT', body: { status: 'cancelled' } });
    return true;
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) return true;
    console.warn('[MercadoPago] não foi possível cancelar o Pix', id, error.message);
    return false;
  }
}

export function refundPaymentWithToken(sellerAccessToken, paymentId, amount, idempotencyKey) {
  const body = amount == null ? {} : { amount: Number(Number(amount).toFixed(2)) };
  return mercadopagoRequestWithToken(sellerAccessToken, `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: 'POST', body, idempotencyKey,
  });
}

// A charge the platform account received and must give back in full.
export function refundPayment(paymentId, idempotencyKey) {
  return mercadopagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: 'POST', body: {}, idempotencyKey,
  });
}

const PLAN_LABELS = { weekly: 'Semanal', monthly: 'Mensal' };

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
      reason: `Rotta Urbana — Plano ${PLAN_LABELS[plan] || plan}`,
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
export const searchPaymentsByReference = (externalReference) => mercadopagoRequest(
  `/v1/payments/search?sort=date_created&criteria=desc&limit=10&external_reference=${encodeURIComponent(externalReference)}`,
);

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
    cardForm: mercadopagoCardConfigured(),
    api: API_BASE,
  };
}

export { safeJson };
