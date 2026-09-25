import {
  MercadoPagoError,
  cancelPaymentQuietly,
  cancelPreapproval,
  createCardSubscription,
  createPlanCardPayment,
  createPlanPassPreference,
  createPlanPixPayment,
  createSplitPreference,
  createRecurringSubscription,
  exchangeMercadoPagoCode,
  getAuthorizedPayment,
  getPayment,
  getPaymentWithToken,
  getPreapproval,
  mercadoPagoPublicKey,
  mercadopagoCardConfigured,
  mercadopagoConfigured,
  mercadopagoAuthorizationUrl,
  mercadopagoOAuthConfigured,
  mercadopagoRequest,
  mercadopagoSplitConfigured,
  mercadopagoWebhookConfigured,
  refreshMercadoPagoToken,
  refundPayment,
  refundPaymentWithToken,
  safeProviderMetadata,
  searchPaymentsByReference,
  verifyWebhookSignature,
  webhookDataId,
  webhookTopic,
} from './mercadoPago.js';
import { decryptSecret, encryptSecret, secretBoxConfigured } from './secretBox.js';
import crypto from 'node:crypto';

const PLAN_DAYS = { daily: 1, weekly: 7, monthly: 30 };
const FIXED_PLANS = new Set(Object.keys(PLAN_DAYS));
// Paid once and renewed by the driver; only the monthly plan renews by itself.
const PASS_PLANS = new Set(['daily', 'weekly']);
const VALID_SEGMENTS = new Set(['moto', 'economy', 'comfort', 'premium']);
const RIDE_PAYMENT_METHOD = 'mercadopago';
const PASS_BILLING_MODELS = ['one_time_daily', 'one_time_pass'];
// Mercado Pago refuses a Pix that expires in less than 30 minutes, counted
// when the request arrives, so a margin is left for latency and clock drift.
const PIX_TTL_MS = 40 * 60e3;
const PIX_REUSE_MARGIN_MS = 3 * 60e3;
const CHECKOUT_TTL_MS = 60 * 60e3;
const CHECKOUT_REUSE_MS = 45 * 60e3;
// A checkout link lasts an hour; after that only a payment already under way
// can still be approved, and its webhook takes care of it.
const PASS_RECONCILE_WINDOW_MS = 3 * 3600e3;

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
  if (['refunded', 'charged_back'].includes(normalized)) return 'refunded';
  if (['rejected', 'cancelled', 'canceled', 'cancelled_by_user'].includes(normalized)) return 'rejected';
  return 'pending';
};

// Ledger status of a pass payment. A Pix that expired unpaid is cancelled,
// not rejected, so the admin can tell a declined card from an unused code.
export const oneTimeStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'accredited', 'processed'].includes(normalized)) return 'approved';
  if (['refunded', 'charged_back'].includes(normalized)) return 'refunded';
  if (normalized === 'rejected') return 'rejected';
  if (['cancelled', 'canceled', 'cancelled_by_user', 'expired'].includes(normalized)) return 'cancelled';
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

// The ledger enum has no "other": the Mercado Pago balance and anything
// unknown are recorded as mercadopago.
export const ledgerMethod = (provider) => {
  const method = providerPaymentMethod(provider);
  return ['pix', 'card', 'boleto'].includes(method) ? method : 'mercadopago';
};

// ru_plan:<plan>:<driverId>:<subscriptionId>:<attempt> for a pass, and the
// older ru_daily:<driverId>:<subscriptionId>:<attempt>. A duplicate charge's
// ledger row appends #<paymentId>, which is not part of the checkout.
export function parseOneTimeReference(value) {
  const reference = String(value || '').split('#')[0];
  const parts = reference.split(':');
  if (parts[0] === 'ru_plan' && parts.length === 5 && PASS_PLANS.has(parts[1]) && parts[2]) {
    return { reference, plan: parts[1], driverId: parts[2] };
  }
  if (parts[0] === 'ru_daily' && parts.length === 4 && parts[1]) {
    return { reference, plan: 'daily', driverId: parts[1] };
  }
  return null;
}

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

function dueDateForProvider(provider, existing, plan, providerStatus, { promote = false } = {}) {
  const normalized = String(providerStatus || '').toLowerCase();
  const providerDue = dateOnlyOrNull(provider?.next_payment_date);
  const existingDue = dateOnlyOrNull(existing?.due_date);
  if (normalized === 'authorized' || normalized === 'active') {
    // A newly promoted plan must not inherit the previous plan's due date.
    const keepExisting = !promote && existingDue && existingDue >= new Date().toISOString().slice(0, 10);
    return providerDue || (keepExisting ? existingDue : dateOnly(null, planDays(plan)));
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

export function planFromProvider(provider, fallback = 'monthly') {
  const frequency = Number(provider?.auto_recurring?.frequency);
  const frequencyType = provider?.auto_recurring?.frequency_type;
  if (frequencyType === 'days' && frequency === 1) return 'daily';
  if (frequencyType === 'days' && frequency === 7) return 'weekly';
  if (frequencyType === 'months' && frequency === 1) return 'monthly';
  return FIXED_PLANS.has(fallback) ? fallback : 'monthly';
}

const isCancelledStatus = (status) => ['cancelled', 'canceled'].includes(String(status || '').toLowerCase());
const isAuthorizedStatus = (status) => ['authorized', 'active'].includes(String(status || '').toLowerCase());
// An admin override that kept the preapproval renews through it only while
// Mercado Pago last reported it authorized. A checkout that was never paid,
// or a paused one, charges nothing. Rows without that status count as before.
export const keptPreapprovalRenews = (row) => row?.provider_status === 'manual_admin'
  && !row?.provider_cancelled_at
  && isAuthorizedStatus(row?.provider_metadata?.status ?? 'authorized');
const todayIso = () => new Date().toISOString().slice(0, 10);

// A checkout the driver opened but has not paid yet. It lives only in the
// metadata so an abandoned checkout never touches the plan they already have.
function pendingCheckoutOf(local) {
  const pending = local?.provider_metadata?.pending_checkout;
  return pending && pending.preapproval_id ? pending : null;
}

// What the app needs to offer "continue payment" without exposing ids.
export function publicPendingCheckout(local) {
  const pending = pendingCheckoutOf(local);
  if (!pending) return null;
  return {
    plan: pending.plan || null,
    plan_segment: pending.plan_segment || null,
    amount: Number(pending.amount || 0),
    init_point: pending.init_point || null,
    created_at: pending.created_at || null,
    provider_status: pending.provider_status || 'pending',
  };
}

function metadataList(metadata, key) {
  return Array.isArray(metadata?.[key]) ? metadata[key].map(String) : [];
}

// Preapprovals the driver moved away from. They must never become the current
// plan again, even if a late webhook reports them as authorized.
function retiredPreapprovalIds(local) {
  return new Set([
    ...metadataList(local?.provider_metadata, 'replaced_preapproval_ids'),
    ...metadataList(local?.provider_metadata, 'cancel_pending'),
  ]);
}

function withRetired(metadata, ids) {
  const extra = ids.filter(Boolean).map(String);
  if (!extra.length) return metadata;
  const replaced = [...new Set([...metadataList(metadata, 'replaced_preapproval_ids'), ...extra])].slice(-10);
  return { ...metadata, replaced_preapproval_ids: replaced };
}

function withoutPendingCheckout(metadata) {
  const { pending_checkout: _pending, ...rest } = metadata || {};
  return rest;
}

async function cancelPreapprovalQuietly(id) {
  if (!id) return true;
  try {
    const current = await getPreapproval(id);
    if (isCancelledStatus(current?.status)) return true;
    await cancelPreapproval(id);
    return true;
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) return true;
    console.warn('[MercadoPago] não foi possível cancelar a assinatura', id, error.message);
    return false;
  }
}

async function saveSubscriptionMetadata(admin, local, metadata) {
  const { data, error } = await admin.from('subscriptions').update({ provider_metadata: metadata })
    .eq('id', local.id).select('*').single();
  if (error) throw error;
  return data;
}

export function amountFromSettings(settings, plan, segment = 'economy') {
  if (segment === 'moto') {
    if (plan === 'daily') return Number(settings.moto_daily_price ?? settings.subscription_daily_amount ?? 0);
    if (plan === 'weekly') return Number(settings.moto_weekly_price ?? settings.plan_weekly_price ?? 0);
    if (plan === 'monthly') return Number(settings.moto_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  }
  if (plan === 'monthly' && segment === 'economy') return Number(settings.car_economy_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'monthly' && segment === 'comfort') return Number(settings.car_comfort_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'monthly' && segment === 'premium') return Number(settings.car_premium_monthly_price ?? settings.subscription_monthly_amount ?? 0);
  if (plan === 'daily') return Number(settings.subscription_daily_amount ?? 0);
  // No price derived from the monthly one: the admin sets the weekly price.
  if (plan === 'weekly') return Number(settings.plan_weekly_price ?? 0);
  if (plan === 'monthly') return Number(settings.subscription_monthly_amount || 0);
  return 0;
}

async function driverFromBearer(req, admin) {
  const match = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw new MercadoPagoError('Sessão do motorista ausente ou expirada.', 401);
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) throw new MercadoPagoError('Sessão do motorista inválida.', 401);

  const [{ data: profile }, { data: driver }] = await Promise.all([
    admin.from('profiles').select('id,full_name,email,cpf,role,is_active').eq('id', data.user.id).maybeSingle(),
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

async function syncSubscription(admin, provider, existing, driverId, segment = existing?.plan_segment || null, options = {}) {
  const { promote = false, planFallback = existing?.plan, replacedId = null } = options;
  const plan = planFromProvider(provider, planFallback);
  const amount = Number(provider?.auto_recurring?.transaction_amount ?? existing?.amount ?? 0);
  const providerStatus = String(provider?.status || 'pending');
  const previousMetadata = existing?.provider_metadata || {};
  // Bookkeeping that belongs to the driver, not to this preapproval.
  const pending = pendingCheckoutOf(existing);
  const kept = {};
  if (pending && !promote && String(pending.preapproval_id) !== String(provider.id)) kept.pending_checkout = pending;
  // A card subscription Mercado Pago did not answer (see subscribeMonthlyWithCard).
  if (!promote && previousMetadata.card_subscription_unknown) kept.card_subscription_unknown = previousMetadata.card_subscription_unknown;
  const cancelPending = metadataList(previousMetadata, 'cancel_pending').filter((id) => id !== String(provider.id));
  if (cancelPending.length) kept.cancel_pending = cancelPending;
  const metadata = withRetired({
    ...safeProviderMetadata(provider),
    init_point: provider.init_point || (promote ? null : previousMetadata.init_point) || null,
    sandbox_init_point: provider.sandbox_init_point || (promote ? null : previousMetadata.sandbox_init_point) || null,
    ...kept,
    ...(metadataList(previousMetadata, 'replaced_preapproval_ids').length
      ? { replaced_preapproval_ids: metadataList(previousMetadata, 'replaced_preapproval_ids').filter((id) => id !== String(provider.id)) }
      : {}),
  }, replacedId ? [replacedId] : []);
  const { data, error } = await admin.from('subscriptions').upsert({
    driver_id: driverId,
    plan,
    plan_segment: segment,
    amount: Number.isFinite(amount) ? amount : Number(existing?.amount || 0),
    status: localStatusFromProvider(providerStatus),
    due_date: dueDateForProvider(provider, existing, plan, providerStatus, { promote }),
    provider: 'mercadopago',
    provider_subscription_id: String(provider.id),
    provider_status: providerStatus,
    provider_payment_method_id: provider.payment_method_id || null,
    next_payment_at: dateTime(provider.next_payment_date),
    provider_last_synced_at: new Date().toISOString(),
    provider_cancelled_at: isCancelledStatus(providerStatus) ? new Date().toISOString() : null,
    provider_metadata: metadata,
    paid_at: existing?.paid_at || null,
  }, { onConflict: 'driver_id' }).select('*').single();
  if (error) throw error;
  return data;
}

// The driver paid for a new checkout: it becomes the current plan and the
// preapproval it replaces stops charging them.
async function promotePreapproval(admin, provider, local, segment) {
  const previousId = local?.provider_subscription_id && String(local.provider_subscription_id) !== String(provider.id)
    ? String(local.provider_subscription_id)
    : null;
  const pending = pendingCheckoutOf(local);
  const pendingIsOther = pending && String(pending.preapproval_id) !== String(provider.id) ? String(pending.preapproval_id) : null;
  let promoted = await syncSubscription(admin, provider, local, local.driver_id, segment || local.plan_segment || null, {
    promote: true,
    planFallback: pending?.plan || local.plan,
    replacedId: previousId,
  });
  const leftovers = [previousId, pendingIsOther].filter(Boolean);
  const failed = [];
  for (const id of leftovers) {
    if (!(await cancelPreapprovalQuietly(id))) failed.push(id);
  }
  if (pendingIsOther || failed.length) {
    const metadata = withRetired(promoted.provider_metadata || {}, leftovers);
    if (failed.length) metadata.cancel_pending = [...new Set([...metadataList(metadata, 'cancel_pending'), ...failed])];
    promoted = await saveSubscriptionMetadata(admin, promoted, metadata);
  }
  // A pass Pix or card form left open would switch the driver off the
  // monthly plan if paid.
  try {
    await retireOpenPassIntents(admin, local.driver_id);
  } catch (error) {
    console.warn('[MercadoPago] passe pendente ao ativar o mensal:', error.message);
  }
  console.log('[MercadoPago] plano promovido', { driverId: local.driver_id, preapproval: String(provider.id), plan: promoted.plan });
  return promoted;
}

// The ledger needs a row to point at. It grants nothing until the payment is
// confirmed, and never replaces a row created meanwhile.
async function ensureSubscriptionRow(admin, driverId, { plan, segment, amount }) {
  const existing = await getSubscription(admin, driverId);
  if (existing?.id) return existing;
  const { error } = await admin.from('subscriptions').upsert({
    driver_id: driverId,
    plan,
    plan_segment: segment,
    status: 'expired',
    amount,
    due_date: todayIso(),
    provider: 'mercadopago',
    provider_status: 'checkout_pending',
    provider_metadata: PASS_PLANS.has(plan) ? { billing_model: 'one_time_pass' } : {},
  }, { onConflict: 'driver_id', ignoreDuplicates: true });
  if (error) throw error;
  const local = await getSubscription(admin, driverId);
  if (!local?.id) throw new MercadoPagoError('Não foi possível preparar a assinatura do motorista.', 502);
  return local;
}

// The recurring plan asked for is already the one renewing, and paid up.
function recurringPlanActive(row, plan, segment) {
  return row?.plan === plan
    && row?.plan_segment === segment
    && row?.status === 'active'
    && Boolean(row?.provider_subscription_id)
    // An admin override that kept the preapproval still renews through it.
    && (isAuthorizedStatus(row?.provider_status) || keptPreapprovalRenews(row))
    && (dateOnlyOrNull(row?.due_date) || '') >= todayIso();
}

// Applies what Mercado Pago says about a preapproval without letting an
// unpaid checkout overwrite the plan the driver currently has.
async function reconcilePreapproval(admin, provider, local, driverId) {
  if (!provider?.id) return local;
  const providerId = String(provider.id);
  if (!local) return driverId ? syncSubscription(admin, provider, null, driverId) : null;

  if (local.provider_subscription_id && String(local.provider_subscription_id) === providerId) {
    // An admin override wins until the driver buys a new plan. What Mercado
    // Pago says about the preapproval is still noted, so the app and the
    // reminders count on it to renew only while it is authorized.
    if (local.provider_status === 'manual_admin') {
      const status = String(provider.status || 'pending');
      const cancelled = isCancelledStatus(status) && !local.provider_cancelled_at;
      if (!cancelled && String(local.provider_metadata?.status ?? '') === status) return local;
      const { data, error } = await admin.from('subscriptions')
        .update({
          provider_metadata: { ...(local.provider_metadata || {}), status },
          ...(cancelled ? { provider_cancelled_at: new Date().toISOString() } : {}),
        })
        .eq('id', local.id).select('*').single();
      if (error) throw error;
      return data;
    }
    return syncSubscription(admin, provider, local, local.driver_id);
  }

  const pending = pendingCheckoutOf(local);
  if (pending && String(pending.preapproval_id) === providerId) {
    if (isAuthorizedStatus(provider.status)) return promotePreapproval(admin, provider, local, pending.plan_segment);
    if (isCancelledStatus(provider.status)) {
      return saveSubscriptionMetadata(admin, local, withRetired(withoutPendingCheckout(local.provider_metadata), [providerId]));
    }
    if (String(pending.provider_status || '') === String(provider.status || '')) return local;
    return saveSubscriptionMetadata(admin, local, {
      ...local.provider_metadata,
      pending_checkout: { ...pending, provider_status: String(provider.status || 'pending') },
    });
  }

  if (isAuthorizedStatus(provider.status) && String(provider.external_reference || '') === String(local.driver_id)) {
    if (retiredPreapprovalIds(local).has(providerId)) {
      // The driver moved to another plan; this one must stop charging.
      await cancelPreapprovalQuietly(providerId);
      return local;
    }
    // An older checkout we were no longer tracking was paid. The driver is
    // being charged for it, so it is their plan now.
    return promotePreapproval(admin, provider, local, local.plan_segment);
  }
  return local;
}

async function retryPendingCancels(admin, local) {
  const ids = metadataList(local?.provider_metadata, 'cancel_pending');
  if (!ids.length) return local;
  const remaining = [];
  for (const id of ids) {
    if (id === String(local.provider_subscription_id || '')) continue;
    if (!(await cancelPreapprovalQuietly(id))) remaining.push(id);
  }
  if (remaining.length === ids.length) return local;
  const metadata = { ...local.provider_metadata };
  if (remaining.length) metadata.cancel_pending = remaining;
  else delete metadata.cancel_pending;
  return saveSubscriptionMetadata(admin, local, metadata);
}

// Same as retryPendingCancels, for callers that must not fail because of it.
export async function retryPendingCancelsQuietly(admin, driverId) {
  try {
    const local = await getSubscription(admin, driverId);
    if (local) await retryPendingCancels(admin, local);
  } catch (error) {
    console.warn('[MercadoPago] cancelamentos pendentes:', error.message);
  }
}

const passIntentsQuery = (admin, columns = '*') => admin.from('payments').select(columns)
  .eq('provider', 'mercadopago')
  .in('provider_metadata->>billing_model', PASS_BILLING_MODELS);

// pix: code shown in the app; card: card typed in the app's form;
// checkout: Checkout Pro link (also what older app builds get).
const passChannel = (intent) => {
  const channel = intent?.provider_metadata?.channel;
  return channel === 'pix' || channel === 'card' ? channel : 'checkout';
};

// Card charges being sent to Mercado Pago right now, by pass checkout id. The
// checkout is not closed under them, and a second tap waits for the answer.
const cardChargesInFlight = new Set();
// Monthly subscriptions being sent with a card right now, by driver id.
const cardSubscriptionsInFlight = new Set();

// A card payment under review, or a Pix or boleto made inside Checkout Pro and
// not paid yet. It clears on its own within a few days, so another payment
// meanwhile would be a second charge.
const PROCESSING_WINDOW_MS = 4 * 24 * 3600e3;

// A card charge Mercado Pago did not answer may exist without an id on the
// checkout yet. Until the search can show it, the checkout counts as a payment
// under review, and only the same card (same idempotency key) is sent again.
const CARD_UNKNOWN_MS = 15 * 60e3;
const cardUnknownRecent = (intent, now = Date.now()) => {
  const at = Date.parse(intent?.provider_metadata?.card_unknown?.at || '');
  return passChannel(intent) === 'card' && Number.isFinite(at) && now - at < CARD_UNKNOWN_MS;
};

// A declined card form stays 'rejected' while the next card typed on it gets
// no answer, and that charge may exist all the same.
const isProcessingPass = (intent, now = Date.now()) => passChannel(intent) !== 'pix' && (
  (intent?.status === 'pending' && Boolean(intent.provider_payment_id)
    && now - new Date(intent.created_at || 0).getTime() < PROCESSING_WINDOW_MS)
  || (['pending', 'rejected'].includes(intent?.status) && cardUnknownRecent(intent, now)));

// Closes an unpaid pass checkout without touching one that a notification
// has moved on in the meantime.
async function closePassIntent(admin, intent, providerStatus) {
  const { error } = await admin.from('payments')
    .update({ status: 'cancelled', provider_status: providerStatus })
    .eq('id', intent.id).in('status', ['pending', 'rejected']);
  if (error) throw error;
}

// A Pix code the driver no longer needs. It is closed only once Mercado Pago
// accepted the cancellation; a code paid meanwhile stays for its webhook.
async function supersedePixIntent(admin, intent) {
  if (intent.provider_payment_id && !(await cancelPaymentQuietly(intent.provider_payment_id))) return false;
  await closePassIntent(admin, intent, 'superseded');
  return true;
}

// A card form nobody is paying through right now; one with a charge under
// review is left for its notification.
const isIdleCardIntent = (intent) => passChannel(intent) === 'card'
  && !intent.provider_payment_id
  && !cardChargesInFlight.has(intent.id)
  && !cardUnknownRecent(intent);

// Merges fields into a checkout's metadata, read fresh so a concurrent write
// of another key is not lost. Best effort: callers go on without it.
async function mergePassMetadata(admin, intentId, change) {
  try {
    const { data: row, error } = await admin.from('payments').select('provider_metadata').eq('id', intentId).maybeSingle();
    if (error) throw error;
    const metadata = change({ ...(row?.provider_metadata || {}) });
    const { error: updateError } = await admin.from('payments').update({ provider_metadata: metadata }).eq('id', intentId);
    if (updateError) throw updateError;
  } catch (error) {
    console.warn('[MercadoPago] metadados do passe:', error.message);
  }
}

// Pass checkouts the driver can still pay but no longer needs: a Pix code is
// cancelled at Mercado Pago, an idle card form is closed.
async function retireOpenPassIntents(admin, driverId, exceptId = null) {
  const { data: open, error } = await passIntentsQuery(admin)
    .eq('driver_id', driverId).eq('status', 'pending').limit(10);
  if (error) throw error;
  for (const intent of open || []) {
    if (intent.id === exceptId) continue;
    try {
      if (passChannel(intent) === 'pix') await supersedePixIntent(admin, intent);
      else if (isIdleCardIntent(intent)) await closePassIntent(admin, intent, 'superseded');
    } catch (error) {
      console.warn('[MercadoPago] checkout de passe em aberto:', error.message);
    }
  }
}

// Looks a pass checkout up at Mercado Pago, for when its webhook is late or
// never arrives. A Pix has one payment; a Checkout Pro link can have several
// attempts (a declined card, then a Pix), so every approved one is applied.
async function reconcilePassIntent(admin, intent, { closeStale = false } = {}) {
  const parsed = parseOneTimeReference(intent.external_reference);
  if (!parsed) return;
  const reference = parsed.reference;
  const age = Date.now() - new Date(intent.created_at).getTime();
  if (passChannel(intent) === 'pix') {
    if (!intent.provider_payment_id) {
      if (closeStale && age > PIX_TTL_MS) await closePassIntent(admin, intent, 'pix_create_failed');
      return;
    }
    const payment = await getPayment(intent.provider_payment_id);
    await applyOneTimePlanPaymentWebhook(admin, payment);
    const expired = new Date(intent.expires_at || 0).getTime() + 3600e3 < Date.now();
    if (closeStale && expired && oneTimeStatus(payment?.status) === 'pending') {
      await supersedePixIntent(admin, intent);
    }
    return;
  }
  const found = await searchPaymentsByReference(reference);
  const results = (Array.isArray(found?.results) ? found.results : [])
    .filter((payment) => String(payment?.external_reference || '') === reference);
  // The search lags a few seconds behind a new charge, so the payments this
  // checkout knows by id (the card attempts made in the app) are read directly.
  const known = new Set(results.map((payment) => String(payment?.id)));
  const direct = [...new Set([
    ...(passChannel(intent) === 'card' ? metadataList(intent.provider_metadata, 'card_attempts').slice(-5) : []),
    ...(intent.provider_payment_id ? [String(intent.provider_payment_id)] : []),
  ])].filter((id) => !known.has(id));
  for (const id of direct) {
    try {
      const payment = await getPayment(id);
      if (String(payment?.external_reference || '') === reference) results.push(payment);
    } catch (error) {
      if (!(error instanceof MercadoPagoError) || error.status !== 404) throw error;
    }
  }
  for (const payment of results.filter((item) => oneTimeStatus(item?.status) === 'approved')) {
    await applyOneTimePlanPaymentWebhook(admin, payment);
  }
  // The payment the row waits on was declined and its notification never
  // came: the row stops showing a payment under review.
  const current = intent.status === 'pending' && intent.provider_payment_id
    ? results.find((item) => String(item?.id) === String(intent.provider_payment_id))
    : null;
  if (current && ['rejected', 'cancelled'].includes(oneTimeStatus(current.status))) {
    await applyOneTimePlanPaymentWebhook(admin, current);
  }
  const underWay = results.some((item) => ['approved', 'pending'].includes(oneTimeStatus(item?.status)));
  if (closeStale && !underWay && age > CHECKOUT_TTL_MS + 3600e3) {
    await closePassIntent(admin, intent, 'expired_unpaid');
  }
  return underWay;
}

const lastDriverReconcile = new Map();
// A round still running for a driver. Other requests wait for it instead of
// answering with the plan as it was before the payment was credited.
const runningDriverReconcile = new Map();

// The driver's recent pass checkouts, checked when the app asks for the plan.
// At most one round of Mercado Pago lookups every 5 s per driver.
async function reconcilePassPayments(admin, driverId) {
  const running = runningDriverReconcile.get(driverId);
  if (running) return running;
  const now = Date.now();
  if (now - (lastDriverReconcile.get(driverId) || 0) < 5000) return;
  lastDriverReconcile.set(driverId, now);
  if (lastDriverReconcile.size > 5000) {
    for (const [id, at] of lastDriverReconcile) if (now - at > 60e3) lastDriverReconcile.delete(id);
  }
  const run = reconcileDriverPassIntents(admin, driverId, now)
    .finally(() => runningDriverReconcile.delete(driverId));
  runningDriverReconcile.set(driverId, run);
  return run;
}

async function reconcileDriverPassIntents(admin, driverId, now) {
  const { data: intents, error } = await passIntentsQuery(admin)
    .eq('driver_id', driverId).in('status', ['pending', 'rejected'])
    .gte('created_at', new Date(now - PASS_RECONCILE_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false }).limit(5);
  if (error) throw error;
  for (const intent of intents || []) {
    try {
      await reconcilePassIntent(admin, intent);
    } catch (error) {
      console.warn('[MercadoPago] conferência do passe:', error.message);
    }
  }
}

// Brings the local row up to date with the pending checkout and the current
// preapproval. Mercado Pago being unavailable never fails the caller.
export async function refreshDriverSubscription(admin, driverId) {
  try {
    await reconcilePassPayments(admin, driverId);
  } catch (error) {
    console.warn('[MercadoPago] conferência do passe:', error.message);
  }
  let local = await getSubscription(admin, driverId);
  if (!local) return { local: null, provider: null };
  let providerSummary = null;
  let checkedId = null;

  const pending = pendingCheckoutOf(local);
  if (pending) {
    try {
      const attempt = await getPreapproval(pending.preapproval_id);
      checkedId = String(attempt.id);
      local = (await reconcilePreapproval(admin, attempt, local, driverId)) || local;
    } catch (error) {
      if (error instanceof MercadoPagoError && error.status === 404) {
        local = await saveSubscriptionMetadata(admin, local, withoutPendingCheckout(local.provider_metadata));
      } else {
        console.warn('[MercadoPago] consulta do checkout pendente:', error.message);
      }
    }
  }

  if (local?.provider_subscription_id && !(local.provider_status === 'manual_admin' && local.provider_cancelled_at)) {
    try {
      const provider = String(local.provider_subscription_id) === checkedId
        ? null
        : await getPreapproval(local.provider_subscription_id);
      if (provider) local = (await reconcilePreapproval(admin, provider, local, driverId)) || local;
      providerSummary = {
        id: String(local.provider_subscription_id),
        status: local.provider_status,
        next_payment_date: local.next_payment_at || null,
      };
    } catch (error) {
      console.warn('[MercadoPago] consulta da assinatura atual:', error.message);
    }
  }

  try {
    local = await retryPendingCancels(admin, local);
  } catch (error) {
    console.warn('[MercadoPago] cancelamentos pendentes:', error.message);
  }
  return { local, provider: providerSummary };
}

// Admin "sync" button: an explicit request, so it also replaces a manual override.
export async function syncSubscriptionForDriver(admin, driverId) {
  const current = await getSubscription(admin, driverId);
  if (current?.provider_status === 'manual_admin' && current.provider_subscription_id) {
    const provider = await getPreapproval(current.provider_subscription_id);
    return syncSubscription(admin, provider, current, driverId);
  }
  const { local } = await refreshDriverSubscription(admin, driverId);
  return local;
}

export async function expireOverdueSubscriptions(admin) {
  const { error } = await admin.rpc('expire_overdue_subscriptions');
  if (error) throw error;
}

async function findProviderPayment(admin, lookups) {
  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data } = await admin.from('payments').select('id,status,paid_at')
      .eq('provider', 'mercadopago').eq(column, String(value)).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

// A subscription charge arrives both as `payment` and as
// `subscription_authorized_payment`; both notifications share one ledger row.
async function saveProviderPayment(admin, row, lookupColumn, lookupValue, extraLookups = []) {
  const existing = await findProviderPayment(admin, [[lookupColumn, lookupValue], ...extraLookups]);
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

async function refundRetiredCharge(admin, ledgerId, providerPaymentId, context) {
  const { data: row, error: readError } = await admin.from('payments').select('provider_metadata').eq('id', ledgerId).maybeSingle();
  if (readError) throw readError;
  const metadata = { ...(row?.provider_metadata || {}), uncredited_reason: 'retired_subscription' };
  try {
    if (!providerPaymentId) throw new MercadoPagoError('Cobrança sem identificador do pagamento.', 502);
    // A notification repeated after the refund must not try it again.
    const current = await getPayment(String(providerPaymentId));
    if (!['refunded', 'charged_back'].includes(String(current?.status || '').toLowerCase())) {
      await refundPayment(String(providerPaymentId), `retired-${providerPaymentId}`);
    }
  } catch (error) {
    // Left approved and flagged for the admin; the notification is retried.
    await admin.from('payments').update({ provider_metadata: { ...metadata, refund_failed: error.message } }).eq('id', ledgerId);
    console.error('[MercadoPago] estorno de cobrança de assinatura substituída falhou', { ...context, paymentId: providerPaymentId, error: error.message });
    throw error;
  }
  const { error } = await admin.from('payments').update({
    status: 'refunded',
    provider_status: 'refunded',
    provider_metadata: { ...metadata, refund_failed: null, refunded_at: new Date().toISOString() },
  }).eq('id', ledgerId);
  if (error) throw error;
  console.warn('[MercadoPago] cobrança de assinatura substituída estornada', { ...context, paymentId: providerPaymentId });
}

async function applyPreapprovalWebhook(admin, provider) {
  const driverId = provider?.external_reference ? String(provider.external_reference) : null;
  let local = await getSubscriptionByProviderId(admin, provider?.id);
  if (!local && driverId) local = await getSubscription(admin, driverId);
  if (!local && !driverId) return null;
  const saved = await reconcilePreapproval(admin, provider, local, driverId || local.driver_id);
  return saved ? { driverId: saved.driver_id, plan: saved.plan, status: saved.status } : null;
}

export async function applyAuthorizedPaymentWebhook(admin, provider) {
  const payment = provider?.payment || {};
  const providerSubscriptionId = provider?.preapproval_id ? String(provider.preapproval_id) : null;
  let local = providerSubscriptionId ? await getSubscriptionByProviderId(admin, providerSubscriptionId) : null;
  const driverId = provider?.external_reference || local?.driver_id;
  if (!local && driverId) local = await getSubscription(admin, driverId);
  if (!local || !driverId) return null;

  // The charge may be notified before the preapproval itself: make sure the
  // checkout it belongs to has been promoted before crediting any days.
  if (providerSubscriptionId && String(local.provider_subscription_id || '') !== providerSubscriptionId) {
    local = (await reconcilePreapproval(admin, await getPreapproval(providerSubscriptionId), local, driverId)) || local;
  }
  const belongsToCurrentPlan = !providerSubscriptionId || String(local.provider_subscription_id || '') === providerSubscriptionId;

  const providerStatus = payment.status || provider.status;
  const status = providerPaymentStatus(providerStatus);
  // The authorized payment usually carries only the payment id and status.
  // A charge the driver already paid is recorded whatever paid it (card or
  // Mercado Pago balance), so the method only labels the ledger row.
  let methodSource = payment;
  if (payment.id && !payment.payment_method_id && !payment.payment_type_id) {
    try {
      methodSource = await getPayment(payment.id);
    } catch (error) {
      console.warn('[MercadoPago] método da cobrança recorrente:', error.message);
    }
  }
  const method = ledgerMethod(methodSource);
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
  const saved = await saveProviderPayment(admin, row, 'provider_authorized_payment_id', provider.id, [
    ['provider_payment_id', payment.id],
  ]);

  if (status === 'approved' && !belongsToCurrentPlan) {
    // A subscription the driver already left (a pass, another plan or the
    // per-ride plan) charged anyway, usually because its cancellation had
    // not gone through yet. It grants nothing, so the money goes back. Also
    // on a repeated notification, in case the first refund failed.
    await refundRetiredCharge(admin, saved.id, payment.id, { driverId, preapproval: providerSubscriptionId });
    return { driverId, paymentStatus: 'refunded', credited: false, reason: 'retired_subscription' };
  }
  if (status === 'approved' && !saved.wasApproved) {
    if (providerSubscriptionId) {
      // Read the preapproval again so the due date reflects this charge. This
      // also ends a manual admin override: a real payment is authoritative.
      try {
        local = await syncSubscription(admin, await getPreapproval(providerSubscriptionId), local, driverId);
      } catch (error) {
        console.warn('[MercadoPago] atualização da assinatura após a cobrança:', error.message);
      }
    }
    const providerNextDate = dateOnlyOrNull(local.next_payment_at);
    if (providerNextDate && providerNextDate > todayIso()) {
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

// Applies one Mercado Pago payment to a pass checkout (daily or weekly, Pix
// or Checkout Pro). The database function does the whole transition under a
// lock, so repeated, late or concurrent notifications credit a payment once.
export async function applyOneTimePlanPaymentWebhook(admin, provider) {
  const parsed = parseOneTimeReference(provider?.external_reference);
  if (!parsed) return null;

  const { data: intent, error: intentError } = await admin.from('payments').select('*')
    .eq('provider', 'mercadopago').eq('external_reference', parsed.reference).maybeSingle();
  if (intentError) throw intentError;
  if (!intent) {
    console.warn('[MercadoPago] pagamento de passe sem intenção local:', parsed.reference);
    return null;
  }

  const amount = Number(provider?.transaction_amount || 0);
  if (!Number.isFinite(amount) || Math.abs(amount - Number(intent.amount)) > 0.01) {
    // Retrying cannot fix it, so the notification is acknowledged and logged.
    console.error('[MercadoPago] valor do passe não confere', {
      driverId: intent.driver_id, paymentId: provider?.id, paid: amount, expected: Number(intent.amount),
    });
    return { driverId: intent.driver_id, paymentStatus: 'ignored', reason: 'amount_mismatch' };
  }

  const status = oneTimeStatus(provider?.status);
  // A declined card attempt reported after the driver already tried again
  // must not mark the newer attempt, maybe still under way, as refused.
  const attempts = metadataList(intent.provider_metadata, 'card_attempts');
  const providerId = provider?.id ? String(provider.id) : '';
  if (!['approved', 'refunded'].includes(status) && providerId && attempts.includes(providerId)
    && attempts[attempts.length - 1] !== providerId) {
    return { driverId: intent.driver_id, paymentStatus: status, result: 'stale_attempt' };
  }
  const { data: result, error } = await admin.rpc('apply_one_time_plan_payment', {
    p_payment_id: intent.id,
    p_provider_payment_id: provider?.id ? String(provider.id) : null,
    p_status: status,
    p_provider_status: String(provider?.status || 'pending'),
    p_method: ledgerMethod(provider),
    p_provider_metadata: safeProviderMetadata(provider),
  });
  if (error) throw error;

  if (result === 'credited' || result === 'credited_duplicate') {
    console.log('[MercadoPago] passe creditado', { driverId: intent.driver_id, plan: parsed.plan, paymentId: provider?.id, result });
    // The credit already retired any monthly subscription; stop it charging.
    await retryPendingCancelsQuietly(admin, intent.driver_id);
    // Other Pix codes and card forms of this driver must not be paid by mistake.
    try {
      await retireOpenPassIntents(admin, intent.driver_id, intent.id);
    } catch (cleanupError) {
      console.warn('[MercadoPago] limpeza de checkouts antigos:', cleanupError.message);
    }
  }
  return { driverId: intent.driver_id, paymentStatus: status, result };
}

// Older name, kept for callers that still import it.
export const applyDailyPlanPaymentWebhook = applyOneTimePlanPaymentWebhook;

async function applyPaymentWebhook(admin, provider) {
  if (parseOneTimeReference(provider?.external_reference)) {
    return applyOneTimePlanPaymentWebhook(admin, provider);
  }
  // Older Pix codes used the bare driver id. Anything else is not ours, and
  // failing on it would only make Mercado Pago retry the notification.
  const driverId = String(provider?.external_reference || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId)) return null;
  const status = providerPaymentStatus(provider.status);
  const preapprovalId = provider?.preapproval_id
    || provider?.metadata?.preapproval_id
    || provider?.point_of_interaction?.transaction_data?.subscription_id
    || null;
  if (preapprovalId) {
    // Recurring charges are recorded and credited by the
    // subscription_authorized_payment notification. Touching the ledger here
    // too would either credit the plan days twice or hide the charge from it.
    return { driverId, paymentStatus: status, credited: false, reason: 'recurring_charge' };
  }
  const local = await getSubscription(admin, driverId);
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
  const { data: row, error } = await admin.from('payments').select('*').eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!row) throw new MercadoPagoError('Pagamento não encontrado.', 404);
  if (PASS_BILLING_MODELS.includes(row.provider_metadata?.billing_model)) {
    // A pass checkout: a Checkout Pro link has no payment id until someone
    // pays it, so it is looked up by its reference like the maintenance job.
    await reconcilePassIntent(admin, row, { closeStale: true });
    const { data: updated, error: readError } = await admin.from('payments').select('status').eq('id', row.id).maybeSingle();
    if (readError) throw readError;
    return { driverId: row.driver_id, paymentStatus: updated?.status || row.status };
  }
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

const APP_SCHEME = 'rotta-urbana';
const ANDROID_PACKAGE = 'com.rottaurbana.app';
const RETURN_KEYS = ['flow', 'plan', 'ride_id', 'status', 'collection_status', 'payment_id', 'preapproval_id'];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function returnCopy(query) {
  const status = String(query.status || query.collection_status || '').toLowerCase();
  if (['approved', 'authorized'].includes(status)) {
    return { title: 'Pagamento aprovado', text: 'Tudo certo. Volte ao aplicativo para ver o seu plano atualizado.' };
  }
  if (['pending', 'in_process', 'in_mediation'].includes(status)) {
    return { title: 'Pagamento em processamento', text: 'O Mercado Pago ainda está confirmando o pagamento. O aplicativo atualiza sozinho assim que ele for aprovado.' };
  }
  if (['rejected', 'cancelled', 'canceled', 'failure', 'null'].includes(status)) {
    return { title: 'Pagamento não concluído', text: 'Nada foi cobrado. Volte ao aplicativo para tentar novamente ou escolher outra forma de pagamento.' };
  }
  return { title: 'Voltar ao aplicativo', text: 'Toque no botão abaixo para voltar ao Rotta Urbana. Se você concluiu o pagamento, o plano é atualizado automaticamente.' };
}

// Mercado Pago only accepts https return URLs. This page hands the result to
// the app: Android needs an intent:// link (Chrome ignores custom schemes
// without a tap), iOS closes the auth session on the custom scheme itself.
export function paymentReturnPage({ query = {}, userAgent = '', host = '' } = {}) {
  const params = new URLSearchParams();
  for (const key of RETURN_KEYS) {
    const value = query[key];
    if (typeof value === 'string' && value && value.length <= 120) params.set(key, value);
  }
  const qs = params.toString();
  const path = `pagamento/retorno${qs ? `?${qs}` : ''}`;
  const appUrl = `${APP_SCHEME}://${path}`;
  const fallbackParams = new URLSearchParams(params);
  fallbackParams.set('noapp', '1');
  const fallbackUrl = `${host}/pagamento/retorno?${fallbackParams.toString()}`;
  const isAndroid = /android/i.test(String(userAgent));
  const href = isAndroid
    ? `intent://${path}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
    : appUrl;
  const noApp = query.noapp === '1';
  const copy = noApp
    ? { title: 'Abra o Rotta Urbana', text: 'Não conseguimos abrir o aplicativo automaticamente. Abra o Rotta Urbana no seu celular; o pagamento é conferido sozinho.' }
    : returnCopy(query);
  const redirectScript = noApp ? '' : `<script>try{window.location.replace(${JSON.stringify(href).replace(/</g, '\\u003c')});}catch(e){}</script>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.title)} · Rotta Urbana</title>
<style>
body{margin:0;font-family:-apple-system,Roboto,Arial,sans-serif;background:#0f172a;color:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:420px;padding:32px 24px;text-align:center}
h1{font-size:24px;margin:0 0 12px}
p{font-size:16px;line-height:1.5;color:#cbd5e1;margin:0 0 28px}
a.btn{display:block;background:#f59e0b;color:#111827;font-weight:700;font-size:18px;text-decoration:none;padding:16px 20px;border-radius:14px}
small{display:block;margin-top:18px;color:#94a3b8;font-size:13px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(copy.title)}</h1>
<p>${escapeHtml(copy.text)}</p>
${noApp ? '' : `<a class="btn" href="${escapeHtml(href)}">Voltar ao aplicativo</a>
<small>Se nada acontecer, toque no botão acima.</small>`}
</main>
${redirectScript}
</body>
</html>`;
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

// What the app needs to show, or reopen, an unpaid pass checkout.
export function publicPass(intent) {
  if (!intent) return null;
  const meta = intent.provider_metadata || {};
  const channel = passChannel(intent);
  return {
    payment_id: intent.id,
    method: channel,
    plan: meta.plan || null,
    plan_segment: meta.plan_segment || null,
    amount: Number(intent.amount),
    expires_at: intent.expires_at || null,
    init_point: channel === 'checkout' ? (meta.init_point || null) : null,
    pix: channel === 'pix' && intent.pix_qr_code ? {
      qr_code: intent.pix_qr_code,
      qr_code_base64: intent.pix_qr_code_base64 || null,
      ticket_url: intent.pix_ticket_url || null,
      expires_at: intent.expires_at || null,
    } : null,
  };
}

// The driver's latest pass checkout: one with a payment under review first, so
// the app shows it instead of offering a second charge, then one that can
// still be paid.
export async function latestPendingPass(admin, driverId) {
  const now = Date.now();
  const { data, error } = await passIntentsQuery(admin)
    .eq('driver_id', driverId).in('status', ['pending', 'rejected'])
    .gt('created_at', new Date(now - PROCESSING_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const intents = data || [];
  const processing = intents.find((intent) => isProcessingPass(intent, now));
  if (processing) return { ...publicPass(processing), processing: true };
  // A Checkout Pro link or card form that already has a payment under way is
  // not offered again: paying it twice would charge twice.
  const payable = intents.find((intent) => {
    if (intent.status !== 'pending' || new Date(intent.expires_at || 0).getTime() <= now) return false;
    const channel = passChannel(intent);
    if (channel === 'pix') return Boolean(intent.pix_qr_code);
    if (channel === 'card') return !intent.provider_payment_id;
    return Boolean(intent.provider_metadata?.init_point) && !intent.provider_payment_id;
  });
  return publicPass(payable || null);
}

// The plan category that fits the driver's vehicle (see the SQL function).
async function planSegmentFor(admin, driverId, requested) {
  const { data, error } = await admin.rpc('driver_plan_segment_for', {
    p_driver_id: driverId,
    p_segment: requested,
  });
  if (error) throw error;
  return VALID_SEGMENTS.has(String(data || '')) ? String(data) : requested;
}

async function insertPassIntent(admin, row) {
  const { error } = await admin.from('payments').insert(row);
  if (error) throw error;
}

// Daily and weekly plans are passes paid once: Pix or card inside the app, or
// Checkout Pro (older app builds, and the fallback). The driver's plan changes
// only when the payment is approved; apply_one_time_plan_payment then adds the
// days on top of any paid time left.
export async function createPassCheckout(admin, { plan, segment, amount, local, driver, email, name, cpf, host, returnUrl, method, extend, replaces, allowProcessing }) {
  // The card form needs the public key; without it the card goes through
  // Checkout Pro, which the app opens instead.
  let cardUnavailable = false;
  if (method === 'card' && !mercadopagoCardConfigured()) {
    method = 'checkout';
    cardUnavailable = true;
  }
  // A payment made while the driver was away is credited before anything
  // else, so a paid code is never handed back as if it were still open.
  try {
    await reconcilePassPayments(admin, driver.id);
    local = (await getSubscription(admin, driver.id)) || local;
  } catch (error) {
    console.warn('[MercadoPago] conferência antes do passe:', error.message);
  }

  const base = {
    provider: 'mercadopago',
    plan,
    plan_segment: segment,
    billing_type: 'one_time',
    amount,
    local_subscription_id: local.id,
  };
  const paidMeanwhile = (subscription) => ({
    ...base,
    plan: subscription?.plan || plan,
    plan_segment: subscription?.plan_segment || segment,
    already_active: true,
    renewable: true,
    status: 'approved',
    method,
    init_point: null,
    subscription,
  });
  const intentStatus = async (id) => {
    const { data, error } = await admin.from('payments').select('status').eq('id', id).maybeSingle();
    if (error) throw error;
    return data?.status || null;
  };

  // The app names the checkout the driver is switching away from (Pix to
  // card or back). It is checked right now, past the 5 s throttle above, so
  // one that was just paid is reported instead of opening a second charge.
  if (replaces) {
    try {
      const { data: previous, error } = await passIntentsQuery(admin)
        .eq('id', replaces).eq('driver_id', driver.id).maybeSingle();
      if (error) throw error;
      if (previous && ['pending', 'rejected'].includes(previous.status)) {
        await reconcilePassIntent(admin, previous);
        if ((await intentStatus(previous.id)) === 'approved') {
          return paidMeanwhile((await getSubscription(admin, driver.id)) || local);
        }
      }
    } catch (error) {
      console.warn('[MercadoPago] checkout anterior:', error.message);
    }
  }
  const passActive = local.status === 'active'
    && local.plan === plan
    && local.plan_segment === segment
    && local.provider_status === 'one_time_approved'
    && (dateOnlyOrNull(local.due_date) || '') >= todayIso();
  if (!extend && passActive) {
    // "Mais um dia / mais uma semana" in the app sends extend to buy ahead.
    return { ...base, already_active: true, renewable: true, status: 'approved', method, init_point: null, subscription: local };
  }

  const { data: open, error: openError } = await passIntentsQuery(admin)
    .eq('driver_id', driver.id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(10);
  if (openError) throw openError;
  const now = Date.now();
  const sameOffer = (intent) => intent.provider_metadata?.plan === plan
    && intent.provider_metadata?.plan_segment === segment
    && Math.abs(Number(intent.amount) - amount) < 0.01;
  const timeLeft = (intent) => new Date(intent.expires_at || 0).getTime() - now;
  const notificationUrl = `${host}/api/mercadopago/webhook`;
  const newReference = (intentId) => `ru_plan:${plan}:${driver.id}:${local.id}:${intentId}`;
  const meta = (channel) => ({ billing_model: 'one_time_pass', plan, plan_segment: segment, channel });
  const fallbackFlags = () => ({
    ...(pixUnavailable ? { pix_unavailable: true } : {}),
    ...(cardUnavailable ? { card_unavailable: true } : {}),
  });
  // A card form left open must not charge after the driver moved on to
  // another method or offer.
  const closeIdleCards = async (keepId = null) => {
    for (const intent of (open || []).filter((item) => isIdleCardIntent(item) && item.id !== keepId)) {
      try {
        await closePassIntent(admin, intent, 'superseded');
      } catch (error) {
        console.warn('[MercadoPago] cartão anterior:', error.message);
      }
    }
  };

  // A payment still under review charges the driver when it clears. Another
  // one now would be a second charge, so the app asks the driver first and
  // only then sends allowProcessing.
  if (!allowProcessing) {
    const { data: declined, error: declinedError } = await passIntentsQuery(admin)
      .eq('driver_id', driver.id).eq('status', 'rejected')
      .gt('created_at', new Date(now - PROCESSING_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false }).limit(10);
    if (declinedError) throw declinedError;
    for (const intent of [...(open || []), ...(declined || [])].filter((item) => isProcessingPass(item, now))) {
      let underWay = true;
      try {
        // A card left unanswered may not be in the search yet.
        underWay = (await reconcilePassIntent(admin, intent)) !== false || cardUnknownRecent(intent, now);
      } catch (error) {
        console.warn('[MercadoPago] pagamento em análise:', error.message);
      }
      const status = await intentStatus(intent.id);
      if (status === 'approved') return paidMeanwhile((await getSubscription(admin, driver.id)) || local);
      if (['pending', 'rejected'].includes(status) && underWay) {
        const error = new MercadoPagoError('Você já tem um pagamento de plano em análise no Mercado Pago. Quando ele for aprovado, o plano é liberado sozinho. Se pagar de novo e os dois forem aprovados, serão duas cobranças.', 409);
        error.code = 'payment_processing';
        throw error;
      }
    }
  }

  // Card chosen over a Pix code already shown: the code stops being payable
  // first. If Mercado Pago will not cancel it, it was probably just paid.
  if (method === 'checkout' || method === 'card') {
    for (const intent of (open || []).filter((item) => passChannel(item) === 'pix')) {
      let closed = false;
      try {
        closed = await supersedePixIntent(admin, intent);
      } catch (error) {
        console.warn('[MercadoPago] Pix anterior:', error.message);
      }
      if (closed) continue;
      await reconcilePassIntent(admin, intent);
      if ((await intentStatus(intent.id)) === 'approved') {
        return paidMeanwhile((await getSubscription(admin, driver.id)) || local);
      }
      throw new MercadoPagoError('O Pix gerado antes ainda está em aberto. Se você já pagou, aguarde a confirmação; senão, tente de novo em instantes.', 409);
    }
  }

  let pixUnavailable = false;
  if (method === 'pix') {
    await closeIdleCards();
    const pixIntents = (open || []).filter((intent) => passChannel(intent) === 'pix');
    const reusable = pixIntents.find((intent) => sameOffer(intent)
      && intent.provider_payment_id && intent.pix_qr_code
      && timeLeft(intent) > PIX_REUSE_MARGIN_MS);
    if (reusable) return { ...base, ...publicPass(reusable), status: 'pending', reused: true };

    // One live Pix code per driver: an older one (another plan, or about to
    // expire) is cancelled so it cannot be paid by mistake.
    for (const intent of pixIntents) {
      try {
        await supersedePixIntent(admin, intent);
      } catch (error) {
        console.warn('[MercadoPago] Pix anterior:', error.message);
      }
    }

    const intentId = crypto.randomUUID();
    const externalReference = newReference(intentId);
    const expiresAt = new Date(now + PIX_TTL_MS).toISOString();
    await insertPassIntent(admin, {
      id: intentId,
      driver_id: driver.id,
      subscription_id: local.id,
      amount,
      method: 'pix',
      status: 'pending',
      provider: 'mercadopago',
      provider_status: 'pix_pending',
      external_reference: externalReference,
      expires_at: expiresAt,
      provider_metadata: meta('pix'),
    });
    let payment = null;
    try {
      payment = await createPlanPixPayment({
        plan,
        amount,
        externalReference,
        notificationUrl,
        payer: { email, name, cpf },
        expiresAt,
        idempotencyKey: `plan-pix:${intentId}`,
      });
      const data = payment?.point_of_interaction?.transaction_data || {};
      if (!payment?.id || !data.qr_code) throw new MercadoPagoError('O Mercado Pago não retornou o código Pix.', 502, payment);
      const { data: saved, error } = await admin.from('payments').update({
        provider_payment_id: String(payment.id),
        pix_qr_code: data.qr_code,
        pix_qr_code_base64: data.qr_code_base64 || null,
        pix_ticket_url: data.ticket_url || null,
        expires_at: dateTime(payment.date_of_expiration) || expiresAt,
      }).eq('id', intentId).select('*').single();
      if (error) throw error;
      console.log('[MercadoPago] Pix do passe criado', { driverId: driver.id, plan, segment, paymentId: String(payment.id) });
      return { ...base, ...publicPass(saved), status: 'pending' };
    } catch (error) {
      // The code never reached the driver, so it must not stay payable.
      if (payment?.id) await cancelPaymentQuietly(String(payment.id));
      try {
        await closePassIntent(admin, { id: intentId }, 'pix_create_failed');
      } catch (closeError) {
        console.warn('[MercadoPago] intenção de Pix:', closeError.message);
      }
      // Usually a Pix key missing on the platform account. Checkout Pro still
      // takes card and the Mercado Pago balance, so the driver can pay anyway.
      console.error('[MercadoPago] Pix do passe indisponível; usando o Checkout Pro:', error.message,
        error instanceof MercadoPagoError && error.details ? JSON.stringify(error.details).slice(0, 1000) : '');
      pixUnavailable = true;
    }
  }

  if (method === 'card') {
    // The form opened moments ago for the same offer is handed back, so
    // leaving the screen and coming back does not pile up checkouts.
    const reusable = (open || []).find((intent) => passChannel(intent) === 'card'
      && sameOffer(intent)
      && !intent.provider_payment_id
      && timeLeft(intent) > CHECKOUT_TTL_MS - CHECKOUT_REUSE_MS);
    await closeIdleCards(reusable?.id || null);
    if (reusable) return { ...base, ...publicPass(reusable), status: 'pending', reused: true, payer_email: email || null };
    const intentId = crypto.randomUUID();
    const row = {
      id: intentId,
      driver_id: driver.id,
      subscription_id: local.id,
      amount,
      method: 'card',
      status: 'pending',
      provider: 'mercadopago',
      provider_status: 'card_pending',
      external_reference: newReference(intentId),
      expires_at: new Date(now + CHECKOUT_TTL_MS).toISOString(),
      provider_metadata: meta('card'),
    };
    await insertPassIntent(admin, row);
    console.log('[MercadoPago] cartão do passe aberto', { driverId: driver.id, plan, segment, intentId });
    return { ...base, ...publicPass(row), status: 'pending', payer_email: email || null };
  }

  await closeIdleCards();
  const reusableCheckout = (open || []).find((intent) => passChannel(intent) === 'checkout'
    && sameOffer(intent)
    && intent.provider_metadata?.init_point
    && !intent.provider_payment_id
    && timeLeft(intent) > CHECKOUT_TTL_MS - CHECKOUT_REUSE_MS);
  if (reusableCheckout) {
    return { ...base, ...publicPass(reusableCheckout), status: 'pending', reused: true, ...fallbackFlags() };
  }

  const intentId = crypto.randomUUID();
  const externalReference = newReference(intentId);
  const expiresAt = new Date(now + CHECKOUT_TTL_MS).toISOString();
  // Recorded before the link exists, so a payment can always find its row.
  await insertPassIntent(admin, {
    id: intentId,
    driver_id: driver.id,
    subscription_id: local.id,
    amount,
    method: 'mercadopago',
    status: 'pending',
    provider: 'mercadopago',
    provider_status: 'checkout_creating',
    external_reference: externalReference,
    expires_at: expiresAt,
    provider_metadata: meta('checkout'),
  });
  try {
    const preference = await createPlanPassPreference({
      plan,
      driverId: driver.id,
      amount,
      externalReference,
      notificationUrl,
      backUrls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      idempotencyKey: `plan-pass:${intentId}`,
      expiresAt,
    });
    const initPoint = preference?.init_point || preference?.sandbox_init_point;
    if (!preference?.id || !initPoint) throw new MercadoPagoError('O Mercado Pago não retornou o link de pagamento.', 502, preference);
    const { data: saved, error } = await admin.from('payments').update({
      provider_status: 'checkout_pending',
      provider_metadata: { ...meta('checkout'), checkout_preference_id: String(preference.id), init_point: initPoint },
    }).eq('id', intentId).select('*').single();
    if (error) throw error;
    console.log('[MercadoPago] checkout do passe criado', { driverId: driver.id, plan, segment, preference: String(preference.id) });
    return {
      ...base,
      ...publicPass(saved),
      status: 'pending',
      subscription_id: String(preference.id),
      sandbox_init_point: preference.sandbox_init_point || null,
      ...fallbackFlags(),
    };
  } catch (error) {
    try {
      await closePassIntent(admin, { id: intentId }, 'checkout_create_failed');
    } catch (closeError) {
      console.warn('[MercadoPago] intenção do checkout:', closeError.message);
    }
    throw error;
  }
}

// What the driver reads when the bank declines the card. Mercado Pago's
// status_detail says why; anything else gets the general text.
const CARD_DECLINE_COPY = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão e tente de novo.',
  cc_rejected_bad_filled_date: 'Confira a data de validade do cartão e tente de novo.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança (CVV) e tente de novo.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão e tente de novo.',
  cc_rejected_blacklist: 'Este cartão não pode ser usado. Use outro cartão ou pague com Pix.',
  cc_rejected_high_risk: 'O pagamento foi recusado pela análise de segurança. Use outro cartão ou pague com Pix.',
  cc_rejected_call_for_authorize: 'O banco pediu para você autorizar este pagamento. Ligue para o banco do cartão e tente de novo, ou pague com Pix.',
  cc_rejected_card_disabled: 'O cartão está bloqueado ou não foi ativado. Fale com o banco ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Você já fez um pagamento com este valor agora há pouco. Se ele foi aprovado, o plano é liberado sozinho.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente. Use outro cartão ou pague com Pix.',
  cc_rejected_max_attempts: 'Você atingiu o limite de tentativas com este cartão. Use outro cartão ou pague com Pix.',
  cc_rejected_card_type_not_allowed: 'Este tipo de cartão não é aceito. Use outro cartão ou pague com Pix.',
};
const CARD_DECLINE_DEFAULT = 'O banco não aprovou o pagamento e nada foi cobrado. Tente outro cartão ou pague com Pix.';
const CARD_INVALID_COPY = 'Não foi possível usar este cartão e nada foi cobrado. Confira os dados, use outro cartão ou pague com Pix.';

// Card charges a driver can send per hour, so a stolen session cannot be used
// to test card numbers.
const CARD_RATE_LIMIT = 8;
const CARD_RATE_WINDOW_MS = 3600e3;
const cardChargesByDriver = new Map();

function cardRateLimited(driverId, now = Date.now()) {
  const recent = (cardChargesByDriver.get(driverId) || []).filter((at) => now - at < CARD_RATE_WINDOW_MS);
  const limited = recent.length >= CARD_RATE_LIMIT;
  if (!limited) recent.push(now);
  cardChargesByDriver.set(driverId, recent);
  if (cardChargesByDriver.size > 5000) {
    for (const [id, list] of cardChargesByDriver) if (!list.some((at) => now - at < CARD_RATE_WINDOW_MS)) cardChargesByDriver.delete(id);
  }
  return limited;
}

const validEmail = (value) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(value || '').trim());

// Charges the card typed in the app to a pass checkout opened by
// createPassCheckout (channel card). The token is used once; a retry of the
// same request carries the same idempotency key, so it never charges twice.
export async function payPassWithCard(admin, { driver, profile, user, paymentId, token, paymentMethodId, issuerId, payerEmail, identification, deviceId, allowProcessing = false, host }) {
  const fail = (message, status, code) => Object.assign(new MercadoPagoError(message, status), { code });
  const statusOf = async () => {
    const { data, error } = await admin.from('payments').select('status').eq('id', paymentId).maybeSingle();
    if (error) throw error;
    return data?.status || null;
  };
  const approved = async () => ({ status: 'approved', payment_id: paymentId, subscription: await getSubscription(admin, driver.id) });

  const { data: intent, error } = await passIntentsQuery(admin)
    .eq('id', paymentId).eq('driver_id', driver.id).maybeSingle();
  if (error) throw error;
  if (!intent || passChannel(intent) !== 'card' || !parseOneTimeReference(intent.external_reference)) {
    throw fail('Pagamento não encontrado. Toque em pagar de novo.', 404, 'payment_not_found');
  }
  if (intent.status === 'approved') return approved();
  if (!['pending', 'rejected'].includes(intent.status)) {
    throw fail('Este pagamento foi encerrado. Toque em pagar de novo.', 409, 'payment_superseded');
  }

  // The driver opened another payment later (or paid one): this form must not
  // charge too.
  const { data: newer, error: newerError } = await passIntentsQuery(admin, 'id')
    .eq('driver_id', driver.id).in('status', ['pending', 'approved'])
    .gt('created_at', intent.created_at).neq('id', intent.id).limit(1);
  if (newerError) throw newerError;
  if (newer?.length) throw fail('Você abriu outro pagamento depois deste. Toque em pagar de novo.', 409, 'payment_superseded');

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);
  // The app sending again the card Mercado Pago did not answer: the same
  // idempotency key returns that charge instead of making another.
  const unknownCharge = cardUnknownRecent(intent);
  const replay = unknownCharge && intent.provider_metadata?.card_unknown?.token === tokenHash;

  // An earlier attempt of this checkout may have been approved, or still be
  // under review, without its notification having arrived.
  let underWay = false;
  try {
    underWay = Boolean(await reconcilePassIntent(admin, intent)) || unknownCharge;
  } catch (reconcileError) {
    console.warn('[MercadoPago] conferência antes do cartão:', reconcileError.message);
    underWay = (intent.status === 'pending' && Boolean(intent.provider_payment_id)) || unknownCharge;
  }
  const current = await statusOf();
  if (current === 'approved') return approved();
  if (!['pending', 'rejected'].includes(current)) {
    throw fail('Este pagamento foi encerrado. Toque em pagar de novo.', 409, 'payment_superseded');
  }
  if (underWay && !allowProcessing && !replay) {
    throw fail('O pagamento anterior com cartão ainda está em análise. Quando for aprovado, o plano é liberado sozinho. Se pagar de novo e os dois forem aprovados, serão duas cobranças.', 409, 'payment_processing');
  }
  if (!replay && new Date(intent.expires_at || 0).getTime() <= Date.now()) {
    throw fail('O tempo para pagar terminou. Toque em pagar de novo.', 410, 'payment_expired');
  }
  if (!replay && cardRateLimited(driver.id)) {
    throw fail('Muitas tentativas com cartão na última hora. Aguarde um pouco ou pague com Pix.', 429, 'too_many_attempts');
  }

  const markUnknown = () => mergePassMetadata(admin, intent.id, (metadata) => ({
    ...metadata,
    card_unknown: { at: new Date().toISOString(), token: tokenHash },
  }));
  let payment;
  try {
    payment = await createPlanCardPayment({
      plan: intent.provider_metadata?.plan,
      amount: Number(intent.amount),
      externalReference: intent.external_reference,
      notificationUrl: `${host}/api/mercadopago/webhook`,
      token,
      paymentMethodId,
      issuerId,
      payer: {
        email: validEmail(payerEmail) ? payerEmail : (profile?.email || user?.email || ''),
        name: profile?.full_name || '',
        identification,
      },
      deviceId,
      idempotencyKey: `plan-card:${intent.id}:${tokenHash}`,
    });
  } catch (chargeError) {
    const status = chargeError instanceof MercadoPagoError ? chargeError.status : 502;
    console.warn('[MercadoPago] cobrança do cartão', status, chargeError.message,
      chargeError instanceof MercadoPagoError && chargeError.details ? JSON.stringify(chargeError.details).slice(0, 800) : '');
    // Refused before any charge (invalid token, card or data).
    if ([400, 402, 404, 422].includes(status)) return { status: 'rejected', message: CARD_INVALID_COPY, detail: 'invalid_request' };
    // No answer: the charge may or may not exist. The app retries the same
    // request (same idempotency key) and then waits for the plan to change;
    // meanwhile another card is not charged without asking.
    await markUnknown();
    throw fail('Não conseguimos confirmar o pagamento com o Mercado Pago agora.', 502, 'payment_unknown');
  }
  if (!payment?.id) {
    await markUnknown();
    throw fail('O Mercado Pago não confirmou o pagamento.', 502, 'payment_unknown');
  }

  // Recorded so a late notification of an older attempt is told apart from
  // this one, and so the attempt is found before the search indexes it. A card
  // left unanswered before is answered now if this was the same card.
  await mergePassMetadata(admin, intent.id, (metadata) => {
    const attempts = [...metadataList(metadata, 'card_attempts').filter((id) => id !== String(payment.id)), String(payment.id)].slice(-10);
    const { card_unknown: unanswered, ...rest } = metadata;
    return { ...(unanswered?.token === tokenHash ? rest : metadata), card_attempts: attempts };
  });

  const status = oneTimeStatus(payment.status);
  try {
    await applyOneTimePlanPaymentWebhook(admin, payment);
  } catch (applyError) {
    // Mercado Pago has the payment; the notification or the next check credits it.
    console.error('[MercadoPago] cartão aprovado sem crédito imediato:', applyError.message);
    if (status === 'approved') return { status: 'processing', payment_id: paymentId };
  }
  console.log('[MercadoPago] cartão do passe', { driverId: driver.id, intentId: intent.id, paymentId: String(payment.id), status: payment.status, detail: payment.status_detail });
  if (status === 'approved') return approved();
  if (status === 'pending') return { status: 'processing', payment_id: paymentId };
  return {
    status: 'rejected',
    message: CARD_DECLINE_COPY[String(payment.status_detail || '')] || CARD_DECLINE_DEFAULT,
    detail: payment.status_detail || null,
  };
}

const CARD_SUBSCRIPTION_DECLINED = 'O cartão não foi aceito para a assinatura e nada foi cobrado. Confira os dados ou use outro cartão de crédito.';
const CARD_SUBSCRIPTION_UNKNOWN = 'Não conseguimos confirmar a assinatura com o Mercado Pago agora. Aguarde um instante e confira seu plano antes de tentar de novo.';
// A subscription Mercado Pago did not answer may exist and be charging. Its
// notification makes it the plan; until then another card is not sent.
const CARD_SUBSCRIPTION_UNKNOWN_MS = 10 * 60e3;

// What the app's card form sent for the monthly plan, checked before anything
// reaches Mercado Pago. Throws the 400 the app shows.
export function cardSubscriptionInput(body, fallbackSegment = 'economy') {
  const fail = (message, code) => Object.assign(new MercadoPagoError(message, 400), { code });
  const plan = String(body?.plan || '').toLowerCase();
  const segment = String(body?.segment || fallbackSegment || 'economy').toLowerCase();
  if (plan !== 'monthly') throw fail('Só o plano mensal é assinado com cartão.', 'invalid_plan');
  if (!VALID_SEGMENTS.has(segment)) throw fail('Categoria de plano inválida.', 'invalid_plan');
  const token = String(body?.token || '').trim();
  const paymentMethodId = String(body?.payment_method_id || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9-]{16,128}$/.test(token) || !/^[a-z0-9_-]{2,40}$/.test(paymentMethodId)) {
    throw fail('Os dados do cartão não chegaram completos. Preencha de novo.', 'invalid_card_form');
  }
  // debvisa, debmaster, debelo: a debit card cannot be charged every month.
  if (paymentMethodId.startsWith('deb')) throw fail('A assinatura mensal precisa de cartão de crédito.', 'debit_not_allowed');
  const payer = body?.payer && typeof body.payer === 'object' ? body.payer : {};
  return {
    segment,
    token,
    paymentMethodId,
    payerEmail: typeof payer.email === 'string' ? payer.email.slice(0, 254) : '',
    deviceId: typeof body?.device_id === 'string' ? body.device_id.slice(0, 128) : null,
  };
}

// The monthly plan with the card typed in the app. Mercado Pago checks the card
// and authorizes the subscription in the same request, with no checkout page;
// only then does it become the driver's plan, replacing the one they had.
export async function subscribeMonthlyWithCard(admin, { driver, profile, user, segment: requestedSegment, token, paymentMethodId, payerEmail, deviceId, host }) {
  const plan = 'monthly';
  const fail = (message, status, code, extra = {}) => Object.assign(new MercadoPagoError(message, status), { code, ...extra });
  if (String(paymentMethodId || '').toLowerCase().startsWith('deb')) {
    throw fail('A assinatura mensal precisa de cartão de crédito.', 400, 'debit_not_allowed');
  }
  const segment = await planSegmentFor(admin, driver.id, requestedSegment);
  const amount = amountFromSettings(await getSettings(admin), plan, segment);
  if (!Number.isFinite(amount) || amount <= 0) throw fail('O valor do plano não está configurado no painel.', 400, 'invalid_plan');
  const roundedAmount = Number(amount.toFixed(2));
  const answer = (row, providerId, extra = {}) => ({
    provider: 'mercadopago',
    status: 'authorized',
    ...extra,
    subscription_id: String(providerId),
    plan,
    plan_segment: segment,
    billing_type: 'recurring',
    amount: extra.already_active ? Number(row.amount || roundedAmount) : roundedAmount,
    subscription: row,
  });

  let local = await ensureSubscriptionRow(admin, driver.id, { plan, segment, amount: roundedAmount });
  if (recurringPlanActive(local, plan, segment)) return answer(local, local.provider_subscription_id, { already_active: true });

  // A checkout link opened before may have been paid, its webhook not arrived
  // yet. Unpaid, it stays until this card is authorized; the promotion then
  // cancels it.
  const pending = pendingCheckoutOf(local);
  if (pending) {
    let attempt = null;
    try {
      attempt = await getPreapproval(pending.preapproval_id);
    } catch (error) {
      if (!(error instanceof MercadoPagoError) || error.status !== 404) throw error;
    }
    if (attempt && isAuthorizedStatus(attempt.status)) {
      local = await promotePreapproval(admin, attempt, local, pending.plan_segment);
      if (recurringPlanActive(local, plan, segment)) return answer(local, local.provider_subscription_id, { already_active: true });
    }
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);
  const unanswered = local.provider_metadata?.card_subscription_unknown;
  const unansweredRecent = unanswered && Date.now() - new Date(unanswered.at || 0).getTime() < CARD_SUBSCRIPTION_UNKNOWN_MS;
  // The same card again carries the same idempotency key, so Mercado Pago
  // answers with the subscription it made instead of another one.
  const replay = unansweredRecent && unanswered.token === tokenHash;
  if (unansweredRecent && !replay) {
    throw fail('A assinatura anterior ainda está sendo confirmada. Aguarde alguns minutos e confira seu plano.', 409, 'subscription_in_progress');
  }
  if (!replay && cardRateLimited(driver.id)) {
    throw fail('Muitas tentativas com cartão na última hora. Aguarde um pouco e tente de novo.', 429, 'too_many_attempts');
  }

  const noteMetadata = async (change) => {
    try {
      const current = (await getSubscription(admin, driver.id)) || local;
      await saveSubscriptionMetadata(admin, current, change(current.provider_metadata || {}));
    } catch (error) {
      console.warn('[MercadoPago] metadados da assinatura com cartão:', error.message);
    }
  };
  let created;
  try {
    created = await createCardSubscription({
      driverId: driver.id,
      email: String(validEmail(payerEmail) ? payerEmail : (profile?.email || user?.email || '')).trim().toLowerCase(),
      plan,
      amount: roundedAmount,
      cardTokenId: token,
      backUrl: `${host}/pagamento/retorno`,
      notificationUrl: `${host}/api/mercadopago/webhook`,
      deviceId,
      idempotencyKey: `subscription-card:${driver.id}:${tokenHash}`,
    });
  } catch (error) {
    const status = error instanceof MercadoPagoError ? error.status : 502;
    // The provider's message stays in the log; the driver gets the copy below.
    console.warn('[MercadoPago] assinatura com cartão', status, error.message,
      error instanceof MercadoPagoError && error.details ? JSON.stringify(error.details).slice(0, 800) : '');
    // Refused before anything was charged: an invalid token, a card that did
    // not pass Mercado Pago's check, or data it did not accept.
    if (status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status)) {
      throw fail(CARD_SUBSCRIPTION_DECLINED, 402, 'card_declined', { detail: 'invalid_request' });
    }
    await noteMetadata((metadata) => ({ ...metadata, card_subscription_unknown: { at: new Date().toISOString(), token: tokenHash } }));
    throw fail(CARD_SUBSCRIPTION_UNKNOWN, 502, 'payment_unknown');
  }
  if (!created?.id) throw fail(CARD_SUBSCRIPTION_UNKNOWN, 502, 'payment_unknown');
  const createdId = String(created.id);

  if (!isAuthorizedStatus(created.status)) {
    // Kept without the card authorized: it must never start charging later.
    const cancelled = await cancelPreapprovalQuietly(createdId);
    await noteMetadata((metadata) => {
      const { card_subscription_unknown: _unknown, ...rest } = metadata;
      const next = withRetired(rest, [createdId]);
      if (!cancelled) next.cancel_pending = [...new Set([...metadataList(next, 'cancel_pending'), createdId])];
      return next;
    });
    console.log('[MercadoPago] assinatura com cartão não autorizada', { driverId: driver.id, preapproval: createdId, status: created.status });
    throw fail(CARD_SUBSCRIPTION_DECLINED, 402, 'card_declined', { detail: 'not_authorized' });
  }

  try {
    const current = (await getSubscription(admin, driver.id)) || local;
    // The plan and price come from the schedule; this one was just sent.
    const provider = created.auto_recurring ? created : {
      ...created,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: roundedAmount, currency_id: 'BRL' },
    };
    return answer(await promotePreapproval(admin, provider, current, segment), createdId);
  } catch (error) {
    // Mercado Pago has the subscription; its notification makes it the plan.
    console.error('[MercadoPago] assinatura com cartão autorizada sem ativar o plano:', error.message);
    throw fail('O Mercado Pago aprovou a assinatura, mas o plano ainda não foi atualizado aqui. Ele é liberado em instantes; não assine de novo.', 502, 'payment_unknown');
  }
}

// The page the app's card form loads in a WebView. The card fields are
// Mercado Pago's own (Card Payment Brick): the numbers never pass through the
// app or this server, only the one-use token does. The app hands in the amount
// and e-mail after load, so nothing personal goes in the URL.
export function cardFormPage({ publicKey = '' } = {}) {
  const key = JSON.stringify(String(publicKey)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="robots" content="noindex">
<title>Pagamento com cartão · Rotta Urbana</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #status { padding: 28px 16px; text-align: center; color: #6b7280; font-size: 15px; line-height: 1.4; }
</style>
</head>
<body>
<div id="status">Carregando o formulário seguro do Mercado Pago…</div>
<div id="cardPaymentBrick_container"></div>
<script src="https://www.mercadopago.com/v2/security.js" view="checkout"></script>
<script src="https://sdk.mercadopago.com/js/v2"></script>
<script>
(function () {
  var KEY = ${key};
  var statusBox = document.getElementById('status');
  var controller = null;
  var pending = null;
  var init = null;
  var building = false;
  function post(message) {
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  }
  function show(text) { statusBox.textContent = text; statusBox.style.display = 'block'; }
  function fail(reason) {
    building = false;
    show('Não foi possível carregar o formulário do cartão.');
    post({ type: 'error', reason: String(reason || '') });
  }
  function build() {
    if (!init || building) return;
    if (!KEY || typeof window.MercadoPago !== 'function') return fail(KEY ? 'sdk' : 'key');
    building = true;
    try {
      var mp = window.__ruMp || (window.__ruMp = new window.MercadoPago(KEY, { locale: 'pt-BR' }));
      mp.bricks().create('cardPayment', 'cardPaymentBrick_container', {
        initialization: { amount: init.amount, payer: init.email ? { email: init.email } : undefined },
        customization: {
          paymentMethods: init.credit_only
            ? { minInstallments: 1, maxInstallments: 1, types: { excluded: ['debit_card'] } }
            : { minInstallments: 1, maxInstallments: 1 }
        },
        callbacks: {
          onReady: function () { building = false; statusBox.style.display = 'none'; post({ type: 'ready' }); },
          onSubmit: function (data) {
            return new Promise(function (resolve) {
              pending = resolve;
              post({ type: 'card_form', data: data, deviceId: window.MP_DEVICE_SESSION_ID || null });
            });
          },
          onError: function (error) {
            post({ type: 'brick_error', reason: String((error && (error.type || '') + ':' + (error.cause || error.message || '')) || '') });
          }
        }
      }).then(function (value) { controller = value; }, function (error) { fail(error && error.message); });
    } catch (error) { fail(error && error.message); }
  }
  window.__ruInit = function (value) {
    if (init || !value || !(Number(value.amount) > 0)) return;
    // credit_only: the monthly plan renews on the card, which a debit card cannot do.
    init = {
      amount: Number(value.amount),
      email: typeof value.email === 'string' ? value.email : '',
      credit_only: value.credit_only === true
    };
    build();
  };
  // The app answers every submit; the form then takes a new card or retry.
  window.__rnResult = function (result) {
    var done = pending;
    pending = null;
    if (done) done();
    if (result && result.rebuild && controller) {
      var old = controller;
      controller = null;
      show('Preparando o formulário…');
      post({ type: 'rebuilding' });
      Promise.resolve().then(function () { return old.unmount(); }).catch(function () {}).then(build);
    }
  };
  if (window.__RU_INIT) window.__ruInit(window.__RU_INIT);
  else post({ type: 'init_request' });
  var last = 0;
  function reportHeight() {
    var height = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(height - last) > 2) { last = height; post({ type: 'height', height: height }); }
  }
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.body);
  setInterval(reportHeight, 700);
})();
</script>
</body>
</html>`;
}

const PLAN_NAMES = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
const PLAN_JOB_INTERVAL_MS = 10 * 60e3;
const PASS_STALE_MS = 24 * 3600e3;

// The renewal push a plan is due now, if any. A plan stops at the start of
// the day after due_date in UTC, as in subscription_is_current (21:00 in
// Brasília). A daily pass gets no 24-hour notice: it would arrive right after
// the purchase.
export function reminderKind({ plan, status, dueDate, now = Date.now() }) {
  const day = dateOnlyOrNull(dueDate);
  if (!day) return null;
  const hoursLeft = (Date.parse(`${day}T00:00:00Z`) + 864e5 - now) / 3600e3;
  if (hoursLeft <= -48) return null;
  if (status !== 'active' || hoursLeft <= 0) return 'expired';
  if (hoursLeft <= 3) return 'h3';
  if (hoursLeft <= 24 && plan !== 'daily') return 'h24';
  return null;
}

export function reminderMessage(kind, plan) {
  const planLabel = PLAN_NAMES[plan] ? `plano ${PLAN_NAMES[plan]}` : 'plano';
  const howToPay = PASS_PLANS.has(plan) ? ' Com Pix leva menos de um minuto.' : '';
  if (kind === 'h24') {
    return {
      title: 'Seu plano vence em breve',
      body: `Seu ${planLabel} termina em menos de 24 horas. Renove para continuar recebendo corridas.`,
    };
  }
  if (kind === 'h3') {
    return {
      title: 'Seu plano vence em poucas horas',
      body: `Renove o ${planLabel} agora para não parar de receber corridas.${howToPay}`,
    };
  }
  return {
    title: 'Seu plano venceu',
    body: `Você não está recebendo corridas. Toque para renovar o ${planLabel}.${howToPay}`,
  };
}

async function sendExpoPush(message) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10e3),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
  const ticket = Array.isArray(body?.data) ? body.data[0] : body?.data;
  // An uninstalled app will not come back by retrying.
  if (ticket?.status === 'error' && ticket?.details?.error !== 'DeviceNotRegistered') {
    throw new Error(ticket.message || 'Expo push error');
  }
  return ticket;
}

// One push per plan, due date and kind. The row is claimed before sending, so
// two runs never both send it, and released if the send fails.
async function sendRenewalReminders(admin, now = Date.now()) {
  const { data, error } = await admin.rpc('plan_renewal_reminder_candidates');
  if (error) throw error;
  let sent = 0;
  for (const row of data || []) {
    if (row.auto_renews || !row.push_token) continue;
    const dueDate = dateOnlyOrNull(row.due_date);
    const kind = reminderKind({ plan: row.plan, status: row.status, dueDate, now });
    if (!kind) continue;
    const claim = { driver_id: row.driver_id, due_date: dueDate, kind };
    const { data: claimed, error: claimError } = await admin.from('plan_renewal_reminders')
      .upsert(claim, { onConflict: 'driver_id,due_date,kind', ignoreDuplicates: true })
      .select('driver_id');
    if (claimError) {
      console.warn('[Planos] lembrete de renovação:', claimError.message);
      continue;
    }
    if (!claimed?.length) continue;
    try {
      await sendExpoPush({
        to: row.push_token,
        ...reminderMessage(kind, row.plan),
        sound: 'default',
        priority: 'high',
        channelId: 'support',
        data: { type: 'plan_renewal', kind, plan: row.plan },
      });
      sent += 1;
    } catch (pushError) {
      console.warn('[Planos] push de renovação:', pushError.message);
      await admin.from('plan_renewal_reminders').delete().match(claim);
    }
  }
  return sent;
}

async function maintenanceStep(label, task) {
  try {
    await task();
  } catch (error) {
    console.warn(`[Planos] ${label}:`, error.message);
  }
}

// Pass checkouts whose webhook never came: the last day's, and older ones with
// a payment still under review, which can clear for up to PROCESSING_WINDOW_MS.
export async function reviewPassIntents(admin, now = Date.now()) {
  const { data: recent, error } = await passIntentsQuery(admin)
    .in('status', ['pending', 'rejected'])
    .gte('created_at', new Date(now - PASS_STALE_MS).toISOString())
    .order('created_at', { ascending: true }).limit(50);
  if (error) throw error;
  const { data: older, error: olderError } = await passIntentsQuery(admin)
    .eq('status', 'pending')
    .not('provider_payment_id', 'is', null)
    .lt('created_at', new Date(now - PASS_STALE_MS).toISOString())
    .gte('created_at', new Date(now - PROCESSING_WINDOW_MS).toISOString())
    .order('created_at', { ascending: true }).limit(20);
  if (olderError) throw olderError;
  const underReview = (older || []).filter((intent) => isProcessingPass(intent, now));
  for (const intent of [...(recent || []), ...underReview]) {
    try {
      await reconcilePassIntent(admin, intent, { closeStale: true });
    } catch (reconcileError) {
      console.warn('[Planos] passe', intent.id, reconcileError.message);
    }
  }
}

// Anything still open after a day can no longer be paid, except a payment
// under review, which is left for its notification or the check above. A
// late approval still credits a closed one: the database function accepts it.
export async function closeAbandonedPasses(admin, now = Date.now()) {
  const { data, error } = await passIntentsQuery(admin)
    .eq('status', 'pending')
    .lt('created_at', new Date(now - PASS_STALE_MS).toISOString())
    .order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  let closed = 0;
  for (const intent of data || []) {
    if (isProcessingPass(intent, now)) continue;
    try {
      await closePassIntent(admin, intent, 'expired_unpaid');
      closed += 1;
    } catch (closeError) {
      console.warn('[Planos] passe abandonado', intent.id, closeError.message);
    }
  }
  return closed;
}

// Monthly checkouts paid while no webhook arrived. Older app builds only ask
// the server about a plan that already has a preapproval, so without this the
// driver would stay blocked. Abandoned checkouts stop being checked after 3 days.
export async function reviewPendingCheckouts(admin, now = Date.now()) {
  // Newest first: a checkout the driver just paid is the one worth catching.
  const { data, error } = await admin.from('subscriptions').select('driver_id')
    .not('provider_metadata->pending_checkout', 'is', null)
    .gte('provider_metadata->pending_checkout->>created_at', new Date(now - 3 * 24 * 3600e3).toISOString())
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  for (const { driver_id: driverId } of data || []) {
    try {
      // Read again right before checking: a webhook may have handled it meanwhile.
      const local = await getSubscription(admin, driverId);
      const pending = pendingCheckoutOf(local);
      if (!pending) continue;
      try {
        await reconcilePreapproval(admin, await getPreapproval(pending.preapproval_id), local, driverId);
      } catch (checkError) {
        if (!(checkError instanceof MercadoPagoError && checkError.status === 404)) throw checkError;
        await saveSubscriptionMetadata(admin, local, withoutPendingCheckout(local.provider_metadata));
      }
    } catch (checkError) {
      // One driver's failure must not hold back the others.
      console.warn('[Planos] checkout mensal', driverId, checkError.message);
    }
  }
}

let planMaintenanceRunning = false;

// Runs every 10 minutes: ends overdue plans, finishes cancellations Mercado
// Pago refused earlier, credits pass payments whose webhook never came, closes
// unpaid checkouts, and sends the renewal reminders.
async function runPlanMaintenance(admin) {
  if (planMaintenanceRunning) return;
  planMaintenanceRunning = true;
  try {
    await maintenanceStep('vencimentos', () => expireOverdueSubscriptions(admin));
    if (mercadopagoConfigured()) {
      await maintenanceStep('cancelamentos pendentes', async () => {
        const { data, error } = await admin.from('subscriptions').select('*')
          .not('provider_metadata->cancel_pending', 'is', null).limit(20);
        if (error) throw error;
        for (const local of data || []) await retryPendingCancels(admin, local);
      });
      await maintenanceStep('conferência dos passes', () => reviewPassIntents(admin));
      await maintenanceStep('checkouts mensais pendentes', () => reviewPendingCheckouts(admin));
    }
    await maintenanceStep('passes abandonados', () => closeAbandonedPasses(admin));
    await maintenanceStep('lembretes', () => sendRenewalReminders(admin));
  } finally {
    planMaintenanceRunning = false;
  }
}

export function registerMercadoPagoRoutes({ app, admin, isProd }) {
  const requireDriver = bearerMiddleware(admin);
  const requirePassenger = userMiddleware(admin, 'passenger');
  const requireUser = userMiddleware(admin);

  // At boot for rows left overdue while the service was down, then every 10
  // minutes (there is no database scheduler). Every step is idempotent.
  void runPlanMaintenance(admin);
  setInterval(() => { void runPlanMaintenance(admin); }, PLAN_JOB_INTERVAL_MS).unref?.();

  app.get('/pagamento/retorno', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.type('html').status(200).send(paymentReturnPage({
      query: req.query || {},
      userAgent: req.get('user-agent') || '',
      host: publicHost(req),
    }));
  });

  // Loaded by the app's card form (WebView). Not meant to be embedded by
  // other sites.
  app.get('/pagamento/cartao', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "frame-ancestors 'none'");
    res.set('X-Frame-Options', 'DENY');
    // Mercado Pago's card fields check where they are loaded from; the
    // server-wide same-origin policy would hide it.
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const configured = mercadopagoCardConfigured();
    res.type('html').status(configured ? 200 : 503).send(cardFormPage({ publicKey: configured ? mercadoPagoPublicKey() : '' }));
  });

  app.post('/api/subscriptions/card-pay', requireDriver, async (req, res) => {
    const paymentId = String(req.body?.payment_id || '').trim();
    const token = String(req.body?.token || '').trim();
    const paymentMethodId = String(req.body?.payment_method_id || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
      return res.status(400).json({ error: 'Pagamento inválido. Toque em pagar de novo.', code: 'payment_not_found' });
    }
    if (!/^[A-Za-z0-9-]{16,128}$/.test(token) || !/^[a-z0-9_-]{2,40}$/.test(paymentMethodId)) {
      return res.status(400).json({ error: 'Os dados do cartão não chegaram completos. Preencha de novo.', code: 'invalid_card_form' });
    }
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });
    // A double tap, or a retry while the first request is still running.
    if (cardChargesInFlight.has(paymentId)) {
      return res.status(409).json({ error: 'Este pagamento já está sendo processado. Aguarde um instante.', code: 'payment_in_progress' });
    }
    cardChargesInFlight.add(paymentId);
    try {
      const { profile, user, driver } = req.driverAuth;
      const payer = req.body?.payer && typeof req.body.payer === 'object' ? req.body.payer : {};
      const identification = payer.identification && typeof payer.identification === 'object'
        ? { type: String(payer.identification.type || '').slice(0, 8), number: String(payer.identification.number || '').slice(0, 32) }
        : null;
      return res.json(await payPassWithCard(admin, {
        driver,
        profile,
        user,
        paymentId,
        token,
        paymentMethodId,
        issuerId: req.body?.issuer_id == null ? null : String(req.body.issuer_id).slice(0, 16),
        payerEmail: typeof payer.email === 'string' ? payer.email.slice(0, 254) : '',
        identification,
        deviceId: typeof req.body?.device_id === 'string' ? req.body.device_id.slice(0, 128) : null,
        allowProcessing: req.body?.allow_processing === true,
        host: publicHost(req),
      }));
    } catch (error) {
      console.error('[MercadoPago card pay]', error.message);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      const code = error instanceof MercadoPagoError && typeof error.code === 'string' ? error.code : (status >= 500 ? 'payment_unknown' : undefined);
      return res.status(status).json({ error: error.message || 'Não foi possível processar o cartão.', ...(code ? { code } : {}) });
    } finally {
      cardChargesInFlight.delete(paymentId);
    }
  });

  // The monthly plan paid with the card typed in the app's form (credit only).
  // Mercado Pago authorizes the card in this request; there is no checkout page.
  app.post('/api/subscriptions/card-subscribe', requireDriver, async (req, res) => {
    let input;
    try {
      input = cardSubscriptionInput(req.body, req.driverAuth.driver.plan_segment);
    } catch (error) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });
    const driverId = req.driverAuth.driver.id;
    // A double tap, or a retry while the first request is still running.
    if (cardSubscriptionsInFlight.has(driverId)) {
      return res.status(409).json({ error: 'A assinatura já está sendo processada. Aguarde um instante.', code: 'subscription_in_progress' });
    }
    cardSubscriptionsInFlight.add(driverId);
    try {
      const { profile, user, driver } = req.driverAuth;
      return res.json(await subscribeMonthlyWithCard(admin, { driver, profile, user, ...input, host: publicHost(req) }));
    } catch (error) {
      // Only the copy written for the driver goes out; anything else (a
      // database error, a provider message) is logged and reported as unknown.
      const known = error instanceof MercadoPagoError && typeof error.code === 'string';
      if (!known) console.error('[MercadoPago card subscribe]', error);
      return res.status(known ? error.status : 502).json({
        error: known ? error.message : CARD_SUBSCRIPTION_UNKNOWN,
        code: known ? error.code : 'payment_unknown',
        ...(known && error.detail ? { detail: error.detail } : {}),
      });
    } finally {
      cardSubscriptionsInFlight.delete(driverId);
    }
  });

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
      const redirectUri = splitRedirectUri(req);
      const authorizationUrl = mercadopagoAuthorizationUrl({ state, redirectUri });
      // Mercado Pago rejects the whole authorization when redirect_uri differs
      // from the one registered in the application, so keep it in the logs.
      console.log('[MercadoPago OAuth start]', { driverId: req.driverAuth.driver.id, redirectUri, host: new URL(authorizationUrl).host });
      return res.json({ authorization_url: authorizationUrl, expires_in: 600 });
    } catch (error) {
      console.error('[MercadoPago OAuth start]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível iniciar a conexão Mercado Pago.' });
    }
  });

  app.get('/api/mercadopago/oauth/callback', async (req, res) => {
    const finish = (ok, message) => {
      const status = ok ? 'success' : 'error';
      const details = ok ? '' : `&message=${encodeURIComponent(String(message).slice(0, 240))}`;
      const appUrl = `rotta-urbana://mercadopago/connected?status=${status}${details}`;
      // The mobile auth session is waiting for this custom-scheme redirect.
      // A 302 is required here; rendering a page with a manual link leaves the
      // browser open and the app never receives the OAuth result.
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, appUrl);
    };
    const rawState = String(req.query?.state || '').trim();
    const providerError = String(req.query?.error || '').trim();
    console.log('[MercadoPago OAuth callback]', {
      hasState: Boolean(rawState),
      hasCode: Boolean(req.query?.code),
      error: providerError || null,
      errorDescription: req.query?.error_description ? String(req.query.error_description).slice(0, 200) : null,
    });
    const providerErrorMessage = () => (providerError === 'access_denied'
      ? 'Você cancelou a autorização no Mercado Pago.'
      : `O Mercado Pago recusou a conexão${req.query?.error_description ? `: ${String(req.query.error_description).slice(0, 160)}` : '.'}`);
    if (!rawState) {
      return finish(false, providerError ? providerErrorMessage() : 'A autorização não retornou um estado válido. Inicie a conexão novamente pelo app.');
    }
    try {
      const { data: oauthState, error } = await admin.from('mercadopago_oauth_states').select('*')
        .eq('state_hash', stateHash(rawState)).maybeSingle();
      if (error) throw error;
      if (!oauthState || oauthState.used_at || new Date(oauthState.expires_at).getTime() <= Date.now()) {
        return finish(false, 'Esta autorização expirou ou já foi utilizada. Inicie uma nova conexão pelo app.');
      }
      await admin.from('mercadopago_oauth_states').update({ used_at: new Date().toISOString() }).eq('state_hash', oauthState.state_hash);
      if (providerError) return finish(false, providerErrorMessage());
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
    const requestedSegment = String(req.body?.segment || req.driverAuth.driver.plan_segment || 'economy').toLowerCase();
    const replaces = String(req.body?.replaces || '').trim();
    if (!FIXED_PLANS.has(plan)) return res.status(400).json({ error: 'Plano pago inválido.' });
    if (!VALID_SEGMENTS.has(requestedSegment)) return res.status(400).json({ error: 'Categoria de plano inválida.' });
    if (!mercadopagoConfigured()) return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });

    try {
      const { profile, user, driver } = req.driverAuth;
      // A car cannot buy the cheaper moto plan, and a moto pays moto prices.
      // A category that does not fit the vehicle (an older app sends economy
      // for a moto) becomes the vehicle's; the price returned is the real one.
      const segment = await planSegmentFor(admin, driver.id, requestedSegment);
      const settings = await getSettings(admin);
      const amount = amountFromSettings(settings, plan, segment);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'O valor do plano não está configurado no painel.' });
      const roundedAmount = Number(amount.toFixed(2));
      const host = publicHost(req);
      const returnUrl = `${host}/pagamento/retorno`;

      let local = await ensureSubscriptionRow(admin, driver.id, { plan, segment, amount: roundedAmount });

      if (PASS_PLANS.has(plan)) {
        // Older app builds send no method and get the Checkout Pro link.
        return res.json(await createPassCheckout(admin, {
          plan,
          segment,
          amount: roundedAmount,
          local,
          driver,
          email: String(profile?.email || user.email || '').trim().toLowerCase(),
          name: profile?.full_name || '',
          cpf: profile?.cpf || '',
          host,
          returnUrl,
          method: ['pix', 'card'].includes(String(req.body?.method || '').toLowerCase())
            ? String(req.body.method).toLowerCase()
            : 'checkout',
          extend: req.body?.extend === true,
          replaces: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(replaces) ? replaces : null,
          // The driver saw the payment under review and chose to pay again.
          allowProcessing: req.body?.allow_processing === true,
        }));
      }

      const alreadyActive = (row) => recurringPlanActive(row, plan, segment);
      const activeResponse = (row) => res.json({
        provider: 'mercadopago',
        already_active: true,
        subscription_id: String(row.provider_subscription_id),
        status: 'authorized',
        plan,
        plan_segment: segment,
        billing_type: 'recurring',
        amount: Number(row.amount || roundedAmount),
        init_point: null,
        local_subscription_id: row.id,
        subscription: row,
      });
      if (alreadyActive(local)) return activeResponse(local);

      // An open checkout for the same plan and price is handed back as is, so
      // closing the browser and tapping again never creates a second charge.
      let metadata = { ...(local.provider_metadata || {}) };
      const pending = pendingCheckoutOf(local);
      if (pending) {
        let attempt = null;
        try {
          attempt = await getPreapproval(pending.preapproval_id);
        } catch (error) {
          if (!(error instanceof MercadoPagoError) || error.status !== 404) throw error;
        }
        if (attempt && isAuthorizedStatus(attempt.status)) {
          // Paid in the meantime; the webhook just has not arrived yet.
          local = await promotePreapproval(admin, attempt, local, pending.plan_segment);
          if (alreadyActive(local)) return activeResponse(local);
          metadata = { ...(local.provider_metadata || {}) };
        } else {
          const attemptAmount = Number(attempt?.auto_recurring?.transaction_amount);
          const reusable = attempt
            && !isCancelledStatus(attempt.status)
            && pending.plan === plan
            && pending.plan_segment === segment
            && planFromProvider(attempt, pending.plan) === plan
            && Number.isFinite(attemptAmount)
            && Math.abs(attemptAmount - roundedAmount) < 0.01
            && (attempt.init_point || pending.init_point);
          if (reusable) {
            return res.json({
              provider: 'mercadopago',
              subscription_id: String(attempt.id),
              status: attempt.status || 'pending',
              plan,
              plan_segment: segment,
              billing_type: 'recurring',
              amount: roundedAmount,
              init_point: attempt.init_point || pending.init_point,
              sandbox_init_point: attempt.sandbox_init_point || null,
              local_subscription_id: local.id,
              reused: true,
            });
          }
          // A different plan or price: the old link must not be payable anymore.
          const cancelled = !attempt || isCancelledStatus(attempt.status) || await cancelPreapprovalQuietly(pending.preapproval_id);
          metadata = withRetired(withoutPendingCheckout(metadata), [pending.preapproval_id]);
          if (!cancelled) {
            metadata.cancel_pending = [...new Set([...metadataList(metadata, 'cancel_pending'), String(pending.preapproval_id)])];
          }
        }
      }

      const attemptId = crypto.randomUUID();
      const checkout = await createRecurringSubscription({
        driverId: driver.id,
        email: String(profile?.email || user.email || '').trim().toLowerCase(),
        plan,
        amount: roundedAmount,
        backUrl: returnUrl,
        notificationUrl: `${host}/api/mercadopago/webhook`,
        idempotencyKey: `subscription:${driver.id}:${attemptId}`,
      });
      const initPoint = checkout?.init_point || checkout?.sandbox_init_point;
      if (!checkout?.id || !initPoint) throw new MercadoPagoError('O Mercado Pago não retornou o link de checkout.', 502, checkout);

      // Only the attempt is recorded. The plan the driver has today, its status
      // and due date stay untouched until Mercado Pago authorizes this one.
      metadata.pending_checkout = {
        preapproval_id: String(checkout.id),
        plan,
        plan_segment: segment,
        amount: roundedAmount,
        init_point: initPoint,
        attempt_id: attemptId,
        created_at: new Date().toISOString(),
        provider_status: String(checkout.status || 'pending'),
      };
      local = await saveSubscriptionMetadata(admin, local, metadata);
      console.log('[MercadoPago] checkout criado', { driverId: driver.id, plan, segment, preapproval: String(checkout.id) });
      return res.json({
        provider: 'mercadopago',
        subscription_id: String(checkout.id),
        status: checkout.status || 'pending',
        plan,
        plan_segment: segment,
        billing_type: 'recurring',
        amount: roundedAmount,
        init_point: initPoint,
        sandbox_init_point: checkout.sandbox_init_point || null,
        local_subscription_id: local.id,
      });
    } catch (error) {
      console.error('[MercadoPago create subscription]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      const code = error instanceof MercadoPagoError && typeof error.code === 'string' ? { code: error.code } : {};
      return res.status(status).json({ error: error.message || 'Não foi possível criar o checkout.', ...code });
    }
  });

  app.get('/api/subscriptions/status', requireDriver, async (req, res) => {
    try {
      const driverId = req.driverAuth.driver.id;
      const { local, provider } = await refreshDriverSubscription(admin, driverId);
      let pendingPass = null;
      try {
        pendingPass = await latestPendingPass(admin, driverId);
      } catch (error) {
        console.warn('[MercadoPago] passe pendente:', error.message);
      }
      return res.json({
        subscription: local,
        provider,
        pending_checkout: publicPendingCheckout(local),
        pending_pass: pendingPass,
      });
    } catch (error) {
      console.error('[MercadoPago subscription status]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível consultar a assinatura.' });
    }
  });

  // Per-ride commission has nothing to pay up front. Any Mercado Pago
  // subscription must stop charging before the switch is recorded.
  app.post('/api/subscriptions/select-commission', requireDriver, async (req, res) => {
    const requestedSegment = String(req.body?.segment || req.driverAuth.driver.plan_segment || 'economy').toLowerCase();
    if (!VALID_SEGMENTS.has(requestedSegment)) return res.status(400).json({ error: 'Categoria de plano inválida.' });
    try {
      const driverId = req.driverAuth.driver.id;
      const segment = await planSegmentFor(admin, driverId, requestedSegment);
      const local = await getSubscription(admin, driverId);
      const currentId = local?.provider_subscription_id ? String(local.provider_subscription_id) : null;
      const pending = pendingCheckoutOf(local);
      const toCancel = [...new Set([currentId, pending?.preapproval_id ? String(pending.preapproval_id) : null].filter(Boolean))];
      if (toCancel.length && !mercadopagoConfigured()) {
        return res.status(503).json({ error: 'Mercado Pago ainda não está configurado no servidor.' });
      }
      const failed = [];
      for (const id of toCancel) {
        if (!(await cancelPreapprovalQuietly(id))) failed.push(id);
      }
      if (failed.length) {
        return res.status(502).json({ error: 'Não foi possível cancelar a assinatura atual no Mercado Pago. Tente novamente em instantes.' });
      }

      const previousMetadata = local?.provider_metadata || {};
      const metadata = withRetired({}, [...metadataList(previousMetadata, 'replaced_preapproval_ids'), ...toCancel]);
      const leftoverCancels = metadataList(previousMetadata, 'cancel_pending').filter((id) => !toCancel.includes(id));
      if (leftoverCancels.length) metadata.cancel_pending = leftoverCancels;
      if (currentId || previousMetadata.previous_preapproval_id) {
        metadata.previous_preapproval_id = currentId || previousMetadata.previous_preapproval_id;
      }
      const now = new Date().toISOString();
      const { data: saved, error } = await admin.from('subscriptions').upsert({
        driver_id: driverId,
        plan: 'commission',
        plan_segment: segment,
        status: 'active',
        amount: 0,
        // Per-ride never runs out; the far date only keeps older app builds,
        // which still read due_date, from showing it as expired.
        due_date: dateOnly(null, 3650),
        provider_subscription_id: null,
        provider_status: currentId ? 'cancelled' : null,
        provider_cancelled_at: currentId ? now : (local?.provider_cancelled_at || null),
        provider_payment_method_id: null,
        next_payment_at: null,
        provider_last_synced_at: now,
        provider_metadata: metadata,
      }, { onConflict: 'driver_id' }).select('*').single();
      if (error) throw error;
      const { error: driverError } = await admin.from('drivers')
        .update({ plan_type: 'commission', plan_segment: segment }).eq('id', driverId);
      if (driverError) throw driverError;
      // An unpaid pass checkout would switch the driver back to a pass if paid
      // later. A Pix code is cancelled. A Checkout Pro link cannot be, so it is
      // only closed and no longer offered; one paid anyway still counts.
      try {
        const { data: openPasses } = await passIntentsQuery(admin)
          .eq('driver_id', driverId).eq('status', 'pending').limit(10);
        for (const intent of openPasses || []) {
          if (passChannel(intent) === 'pix') await supersedePixIntent(admin, intent);
          else if (!intent.provider_payment_id) await closePassIntent(admin, intent, 'superseded');
        }
      } catch (error) {
        console.warn('[MercadoPago] passe pendente ao mudar para comissão:', error.message);
      }
      console.log('[MercadoPago] motorista mudou para comissão', { driverId, cancelled: toCancel });
      return res.json({ subscription: saved });
    } catch (error) {
      console.error('[MercadoPago select commission]', error);
      const status = error instanceof MercadoPagoError ? error.status : 502;
      return res.status(status).json({ error: error.message || 'Não foi possível mudar para o plano por corrida.' });
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

  // The old one-off Pix was not tied to any plan, so paying it granted
  // nothing. Plan Pix now comes from create-checkout with method "pix".
  app.post('/api/payments/create-pix', requireDriver, (req, res) => res.status(410).json({
    error: 'Atualize o aplicativo para pagar o plano com Pix.',
  }));

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
