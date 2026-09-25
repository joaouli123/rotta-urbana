import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { buildPixPayload } from '../lib/pix';
import type { PaymentRow, SubscriptionRow, AppSettings, PlanSegment } from '../types/db';

export type PlanType = 'commission' | 'daily' | 'weekly' | 'monthly';

export function isSubscriptionCurrent(subscription: SubscriptionRow | null | undefined): boolean {
  if (!subscription || subscription.status !== 'active') return false;
  // Per-ride commission has nothing to renew, so it never runs out.
  if (subscription.plan === 'commission') return true;
  if (!subscription.due_date) return false;
  return String(subscription.due_date).slice(0, 10) >= new Date().toISOString().slice(0, 10);
}

const PAYMENTS_API = (process.env.EXPO_PUBLIC_API_URL || 'https://rottaurbana.com.br').replace(/\/$/, '');

/** The page with Mercado Pago's card fields, loaded in a WebView. */
export const CARD_FORM_URL = `${PAYMENTS_API}/pagamento/cartao`;

/** Pix copy-and-paste code for a daily or weekly plan, paid inside the app. */
export interface PlanPix {
  qr_code: string;
  /** PNG of the QR code, base64 without the data: prefix. */
  qr_code_base64: string | null;
  ticket_url: string | null;
  expires_at: string | null;
}

/** An unpaid daily or weekly plan payment the driver can still finish. */
export interface PendingPass {
  payment_id: string;
  method: PassPaymentMethod;
  plan: 'daily' | 'weekly' | null;
  plan_segment: PlanSegment | null;
  amount: number;
  expires_at: string | null;
  /** Checkout Pro link, only for method 'checkout'. */
  init_point: string | null;
  pix: PlanPix | null;
  /** A payment made on the link is under review: paying again charges twice. */
  processing?: boolean;
}

/** Pix code or card form inside the app, or Checkout Pro (the fallback). */
export type PassPaymentMethod = 'pix' | 'card' | 'checkout';

export interface SubscriptionCheckout {
  provider: 'mercadopago';
  /** Mercado Pago subscription or preference id; absent for Pix. */
  subscription_id?: string;
  status: string;
  plan: Exclude<PlanType, 'commission'>;
  plan_segment?: PlanSegment | null;
  amount: number;
  /** Link to open; null for Pix and when `already_active` is true. */
  init_point: string | null;
  sandbox_init_point?: string | null;
  local_subscription_id?: string;
  /** Monthly renews by itself; daily and weekly are paid once each time. */
  billing_type?: 'recurring' | 'one_time';
  /** The driver already has this plan authorized and in date. */
  already_active?: boolean;
  /** Daily or weekly already in date: the driver may still buy more days. */
  renewable?: boolean;
  /** An unpaid checkout for the same plan and price was handed back. */
  reused?: boolean;
  /** How this daily or weekly payment is made. */
  method?: PassPaymentMethod;
  /** The ledger row of a daily or weekly payment. */
  payment_id?: string;
  expires_at?: string | null;
  pix?: PlanPix | null;
  /** Pix was asked for but could not be created; this is the card checkout. */
  pix_unavailable?: boolean;
  /** The card form is not set up on the server; this is Checkout Pro. */
  card_unavailable?: boolean;
  /** E-mail the card form starts with (method 'card'). */
  payer_email?: string | null;
  subscription?: SubscriptionRow | null;
}

/** Days a plan adds each time it is paid. */
export const PLAN_DAYS: Record<Exclude<PlanType, 'commission'>, number> = { daily: 1, weekly: 7, monthly: 30 };

/** Daily and weekly are one-time passes; only monthly is a subscription. */
export function isPassPlan(plan: PlanType | null | undefined): plan is 'daily' | 'weekly' {
  return plan === 'daily' || plan === 'weekly';
}

/**
 * The instant a plan stops working: the start of the day after due_date in
 * UTC, as in the database's subscription_is_current (21:00 in Brasília).
 */
export function planCutoff(dueDate: string | null | undefined): Date | null {
  const day = String(dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000);
}

/** A driver who had a paid plan and let it lapse (not a new driver). */
export function isPlanLapsed(subscription: SubscriptionRow | null | undefined): boolean {
  if (!subscription || subscription.plan === 'commission') return false;
  if (isSubscriptionCurrent(subscription)) return false;
  // A first checkout left unpaid creates a placeholder row; that driver never had a plan.
  return !(subscription.status === 'expired' && subscription.provider_status === 'checkout_pending');
}

/** Hours until the plan stops, or null when it has no end date. */
export function planHoursLeft(subscription: SubscriptionRow | null | undefined, now = Date.now()): number | null {
  if (!subscription || subscription.plan === 'commission') return null;
  const cutoff = planCutoff(subscription.due_date);
  return cutoff ? (cutoff.getTime() - now) / 3_600_000 : null;
}

/** True when a Mercado Pago subscription will charge again by itself. */
export function planAutoRenews(subscription: SubscriptionRow | null | undefined): boolean {
  if (!subscription || subscription.plan !== 'monthly' || !subscription.provider_subscription_id) return false;
  if (subscription.provider_cancelled_at) return false;
  const renewing = (status: unknown) => ['authorized', 'active'].includes(String(status || '').toLowerCase());
  // manual_admin: an admin changed the dates but kept the card subscription.
  // It charges only if Mercado Pago last had it authorized; a checkout that
  // was never paid does not.
  if (String(subscription.provider_status || '').toLowerCase() === 'manual_admin') {
    return renewing(subscription.provider_metadata?.status ?? 'authorized');
  }
  return renewing(subscription.provider_status);
}

/** A checkout the driver opened but has not paid yet (weekly or monthly). */
export interface PendingCheckout {
  plan: Exclude<PlanType, 'commission'> | null;
  plan_segment: PlanSegment | null;
  amount: number;
  init_point: string | null;
  created_at: string | null;
  provider_status: string;
}

export interface SubscriptionSnapshot {
  subscription: SubscriptionRow | null;
  pending_checkout: PendingCheckout | null;
  /** An unpaid daily or weekly payment (Pix code or card link) still open. */
  pending_pass: PendingPass | null;
}

/** Reads an unpaid checkout straight from the row when the server is unreachable. */
export function pendingCheckoutFromRow(subscription: SubscriptionRow | null | undefined): PendingCheckout | null {
  const pending = subscription?.provider_metadata?.pending_checkout as Record<string, unknown> | undefined;
  if (!pending || typeof pending !== 'object' || !pending.preapproval_id) return null;
  const plan = pending.plan === 'daily' || pending.plan === 'weekly' || pending.plan === 'monthly' ? pending.plan : null;
  const segment = pending.plan_segment;
  return {
    plan,
    plan_segment: segment === 'moto' || segment === 'economy' || segment === 'comfort' || segment === 'premium' ? segment : null,
    amount: Number(pending.amount || 0),
    init_point: typeof pending.init_point === 'string' ? pending.init_point : null,
    created_at: typeof pending.created_at === 'string' ? pending.created_at : null,
    provider_status: typeof pending.provider_status === 'string' ? pending.provider_status : 'pending',
  };
}

/**
 * Everything a confirmed payment can change. A recurring plan keeps its old
 * paid_at when Mercado Pago authorizes it, so paid_at alone is not enough.
 */
export function subscriptionFingerprint(subscription: SubscriptionRow | null | undefined): string {
  if (!subscription) return 'none';
  return [
    subscription.status, subscription.plan, subscription.plan_segment, subscription.due_date,
    subscription.paid_at, subscription.provider_subscription_id,
  ].map((value) => String(value ?? '')).join('|');
}

export interface CheckoutTarget {
  plan: Exclude<PlanType, 'commission'>;
  segment?: PlanSegment | null;
  /** subscriptionFingerprint() taken right before the checkout opened. */
  baseline: string;
}

/** True once the plan the driver paid for is the current, in-date plan. */
export function isCheckoutConfirmed(subscription: SubscriptionRow | null | undefined, target: CheckoutTarget): boolean {
  if (!subscription || !isSubscriptionCurrent(subscription) || subscription.plan !== target.plan) return false;
  if (target.segment && subscription.plan_segment && subscription.plan_segment !== target.segment) return false;
  return subscriptionFingerprint(subscription) !== target.baseline;
}

export interface RidePayment {
  id: string;
  ride_id: string;
  gross_amount: number;
  commission_pct: number;
  marketplace_fee: number;
  driver_amount: number;
  currency: string;
  method: 'mercadopago';
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';
  provider_status?: string | null;
  provider_status_detail?: string | null;
  provider_preference_id?: string | null;
  provider_payment_id?: string | null;
  checkout_url?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MercadoPagoConnectionStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'revoked' | 'error';
  provider_user_id: string | null;
  live_mode: boolean | null;
  access_token_expires_at: string | null;
}

export class PaymentsApiError extends Error {
  /** `code` names a case the app handles, e.g. 'payment_processing'. */
  constructor(message: string, readonly status: number, readonly code: string | null = null) {
    super(message);
    this.name = 'PaymentsApiError';
  }
}

async function paymentsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`${PAYMENTS_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('O servidor de pagamentos demorou demais. Tente novamente.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PaymentsApiError(
      payload?.error || `Falha no servidor de pagamentos (${response.status}).`,
      response.status,
      typeof payload?.code === 'string' ? payload.code : null,
    );
  }
  return payload as T;
}

export async function getSubscription(): Promise<SubscriptionRow | null> {
  const { data: u, error: authError } = await supabase.auth.getUser();
  // Offline is an error, not "no plan": a paid driver must not be blocked.
  if (authError && !isAuthSessionMissingError(authError)) throw authError;
  if (!u?.user) return null;
  const { data, error } = await supabase.from('subscriptions').select('*').eq('driver_id', u.user.id).maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow) ?? null;
}

/** Poll the driver's subscription while a checkout is open; the webhook is authoritative. */
export function watchDriverSubscription(
  onUpdate: (subscription: SubscriptionRow | null) => void,
  intervalMs = 3000,
): () => void {
  let stopped = false;
  let inFlight = false;
  const poll = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const subscription = await getSubscription();
      if (!stopped) onUpdate(subscription);
    } catch {
      // A transient network failure is retried on the next interval.
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => { void poll(); }, intervalMs);
  void poll();
  return () => { stopped = true; clearInterval(timer); };
}

export async function getPayments(limit = 20): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as PaymentRow[]) ?? [];
}

export async function getAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data as AppSettings) ?? null;
}

export interface CheckoutOptions {
  /** Daily and weekly only: Pix inside the app, or the card checkout. */
  method?: PassPaymentMethod;
  /** Daily and weekly only: buy more days while the current ones still run. */
  extend?: boolean;
  /** Daily and weekly only: the unpaid payment this one replaces (switching Pix and card). */
  replaces?: string | null;
  /** Daily and weekly only: the driver chose to pay again while a payment is under review. */
  allowProcessing?: boolean;
}

/**
 * Monthly opens Mercado Pago's recurring checkout (card). Daily and weekly are
 * paid once: a Pix code shown in the app, or Checkout Pro for card.
 */
export async function createSubscriptionCheckout(
  plan: Exclude<PlanType, 'commission'>,
  segment?: PlanSegment,
  options: CheckoutOptions = {},
): Promise<SubscriptionCheckout> {
  const passOptions = isPassPlan(plan)
    ? {
      method: options.method ?? 'pix',
      ...(options.extend ? { extend: true } : {}),
      ...(options.replaces ? { replaces: options.replaces } : {}),
      ...(options.allowProcessing ? { allow_processing: true } : {}),
    }
    : {};
  const checkout = await paymentsApi<SubscriptionCheckout>('/api/subscriptions/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, segment, ...passOptions }),
  });
  const cardForm = checkout?.method === 'card' && Boolean(checkout.payment_id);
  if (!checkout?.already_active && !checkout?.init_point && !checkout?.pix?.qr_code && !cardForm) {
    throw new Error('O Mercado Pago não retornou o pagamento. Tente novamente.');
  }
  return checkout;
}

/** What Mercado Pago's card form hands over on submit (no card numbers). */
export interface CardFormData {
  token: string;
  issuer_id?: string | number | null;
  payment_method_id: string;
  transaction_amount?: number;
  installments?: number;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
}

export interface CardPaymentResult {
  status: 'approved' | 'processing' | 'rejected';
  payment_id?: string;
  /** Why the bank declined, in words for the driver. */
  message?: string;
  detail?: string | null;
  subscription?: SubscriptionRow | null;
}

/**
 * Charges the card typed in the app to the daily or weekly payment opened with
 * method 'card'. The card numbers stay with Mercado Pago; only its one-use
 * token is sent. A retry with the same token never charges twice.
 */
export async function payPlanWithCard(
  paymentId: string,
  form: CardFormData,
  deviceId: string | null,
  allowProcessing = false,
): Promise<CardPaymentResult> {
  return paymentsApi<CardPaymentResult>('/api/subscriptions/card-pay', {
    method: 'POST',
    body: JSON.stringify({
      payment_id: paymentId,
      token: form.token,
      payment_method_id: form.payment_method_id,
      issuer_id: form.issuer_id ?? null,
      payer: {
        email: form.payer?.email ?? '',
        identification: form.payer?.identification ?? null,
      },
      device_id: deviceId,
      ...(allowProcessing ? { allow_processing: true } : {}),
    }),
  });
}

/**
 * The price the server charges for a plan, as in amountFromSettings in
 * railway-admin/paymentRoutes.js. 0 means the admin has not set it, and the
 * server refuses to charge it.
 */
export function planPrice(
  settings: AppSettings | null | undefined,
  plan: Exclude<PlanType, 'commission'>,
  segment: PlanSegment = 'economy',
): number {
  if (!settings) return 0;
  const num = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  if (segment === 'moto') {
    if (plan === 'daily') return num(settings.moto_daily_price ?? settings.subscription_daily_amount);
    if (plan === 'weekly') return num(settings.moto_weekly_price ?? settings.plan_weekly_price);
    return num(settings.moto_monthly_price ?? settings.subscription_monthly_amount);
  }
  if (plan === 'daily') return num(settings.subscription_daily_amount);
  if (plan === 'weekly') return num(settings.plan_weekly_price);
  if (segment === 'comfort') return num(settings.car_comfort_monthly_price ?? settings.subscription_monthly_amount);
  if (segment === 'premium') return num(settings.car_premium_monthly_price ?? settings.subscription_monthly_amount);
  return num(settings.car_economy_monthly_price ?? settings.subscription_monthly_amount);
}

/**
 * Reconciles the local subscription with Mercado Pago (recurring plans, the
 * daily payment and pending cancellations) and returns any unpaid checkout.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionSnapshot> {
  const result = await paymentsApi<Partial<SubscriptionSnapshot>>('/api/subscriptions/status');
  return {
    subscription: result?.subscription ?? null,
    pending_checkout: result?.pending_checkout ?? null,
    pending_pass: result?.pending_pass ?? null,
  };
}

/**
 * The server's view when it answers in time; otherwise the row as stored, so
 * the plan screen and the access check still work while the server is slow.
 */
export async function loadSubscriptionSnapshot(timeoutMs = 12_000): Promise<SubscriptionSnapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getSubscriptionStatus(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
  } catch {
    const subscription = await getSubscription();
    return { subscription, pending_checkout: pendingCheckoutFromRow(subscription), pending_pass: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Reconciles the local subscription with Mercado Pago after returning to the app. */
export async function syncSubscriptionStatus(): Promise<SubscriptionRow | null> {
  return (await getSubscriptionStatus()).subscription;
}

/**
 * Switches to per-ride commission. The server cancels the Mercado Pago
 * subscription and any unpaid checkout first, so nothing is charged again.
 */
export async function selectCommissionPlan(segment?: PlanSegment | null): Promise<SubscriptionRow | null> {
  try {
    const result = await paymentsApi<{ subscription: SubscriptionRow | null }>('/api/subscriptions/select-commission', {
      method: 'POST',
      body: JSON.stringify(segment ? { segment } : {}),
    });
    return result?.subscription ?? null;
  } catch (error) {
    // A server without this route yet: fall back to the database function.
    if (!(error instanceof PaymentsApiError) || error.status !== 404) throw error;
    await selectPlan('commission', segment ?? undefined);
    return getSubscription();
  }
}

/** Link the server's return page opens when Mercado Pago sends the driver back. */
export const PAYMENT_RETURN_URI = 'rotta-urbana://pagamento/retorno';

export function isPaymentReturnUrl(url: string | null | undefined): boolean {
  return /^rotta-urbana:\/\/+pagamento\/retorno/i.test(String(url || ''));
}

let checkoutOpen = false;

/**
 * Opens a Mercado Pago checkout inside the app's task. The return page sends
 * the driver back through PAYMENT_RETURN_URI, which closes the tab; closing it
 * by hand works too. Either way `onSettled` runs so the caller re-checks the
 * plan: the result type alone does not say whether the payment went through.
 */
export async function openMercadoPagoCheckout(url: string, onSettled?: () => unknown): Promise<void> {
  if (checkoutOpen) return;
  checkoutOpen = true;
  try {
    try {
      await WebBrowser.openAuthSessionAsync(url, PAYMENT_RETURN_URI, { createTask: false, showTitle: true });
    } catch (error) {
      // A tab left over from an earlier attempt: open the link in the browser.
      if (!/already open/i.test(String((error as Error)?.message || ''))) throw error;
      await Linking.openURL(url);
    }
  } finally {
    checkoutOpen = false;
    try { await onSettled?.(); } catch { /* the caller's own refresh reports errors */ }
  }
}

export async function cancelSubscription(): Promise<void> {
  await paymentsApi('/api/subscriptions/cancel', { method: 'POST', body: '{}' });
}

/** Starts the server-side OAuth connection for a driver's Mercado Pago account. */
export async function startMercadoPagoConnection(): Promise<string> {
  const result = await paymentsApi<{ authorization_url: string }>('/api/mercadopago/connect/start');
  if (!result?.authorization_url) throw new Error('O Mercado Pago não retornou o link de conexão.');
  return result.authorization_url;
}

export async function getMercadoPagoConnectionStatus(): Promise<MercadoPagoConnectionStatus> {
  return paymentsApi<MercadoPagoConnectionStatus>('/api/mercadopago/connect/status');
}

export async function disconnectMercadoPago(): Promise<void> {
  await paymentsApi('/api/mercadopago/connect/disconnect', { method: 'POST', body: '{}' });
}

/** Creates (or reuses) a hosted Mercado Pago checkout for a completed ride. */
export async function createRideCheckout(rideId: string): Promise<RidePayment> {
  const result = await paymentsApi<{ payment: RidePayment }>(`/api/rides/${encodeURIComponent(rideId)}/payment/checkout`, {
    method: 'POST', body: '{}',
  });
  if (!result?.payment) throw new Error('O servidor não retornou o pagamento da corrida.');
  return result.payment;
}

export async function getRidePayment(rideId: string): Promise<RidePayment | null> {
  const result = await paymentsApi<{ payment: RidePayment | null }>(`/api/rides/${encodeURIComponent(rideId)}/payment`);
  return result.payment ?? null;
}

/**
 * Legacy RPC path. Paid plans only change after Mercado Pago confirms them,
 * so the app uses createSubscriptionCheckout and selectCommissionPlan instead.
 */
export async function selectPlan(plan: PlanType, segment?: PlanSegment): Promise<void> {
  const { error } = await supabase.rpc('driver_select_plan', {
    p_plan: plan,
    p_segment: segment ?? 'economy',
  });
  if (error) throw error;
}

// Throws when the row could not be read, so a network error is never taken
// for a driver who has no plan yet.
async function readOwnDriverColumn(column: 'plan_type' | 'plan_segment'): Promise<unknown> {
  const { data: u, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!u?.user) return null;
  const { data, error } = await supabase.from('drivers').select(column).eq('id', u.user.id).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null)?.[column] ?? null;
}

/** Returns null if plan not yet chosen (driver needs PlanSelectionScreen). */
export async function getDriverPlanType(): Promise<PlanType | null> {
  return ((await readOwnDriverColumn('plan_type')) as PlanType | null) ?? null;
}

export async function getDriverPlanSegment(): Promise<PlanSegment | null> {
  const segment = await readOwnDriverColumn('plan_segment');
  return segment === 'moto' || segment === 'economy' || segment === 'comfort' || segment === 'premium'
    ? segment
    : null;
}

/** PIX copia-e-cola for a passenger to pay the ride fare DIRECTLY to the driver. */
export async function buildRideFarePix(rideId: string): Promise<{ code: string; amount: number; driverName: string } | null> {
  const { data: ride } = await supabase.from('rides').select('driver_id, price').eq('id', rideId).single();
  if (!ride?.driver_id) return null;
  const [{ data: driver }, { data: profile }, settings] = await Promise.all([
    supabase.from('drivers').select('pix_key,pix_key_type').eq('id', ride.driver_id).single(),
    supabase.from('profiles').select('full_name').eq('id', ride.driver_id).single(),
    getAppSettings(),
  ]);
  if (!driver?.pix_key) return null;
  const txid = `RIDE${rideId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`.slice(0, 25);
  const code = buildPixPayload({
    key: driver.pix_key, keyType: driver.pix_key_type ?? undefined,
    name: profile?.full_name ?? 'Motorista',
    city: settings?.platform_pix_city ?? 'SINOP', amount: Number(ride.price), txid,
  });
  return code ? { code, amount: Number(ride.price), driverName: profile?.full_name ?? 'Motorista' } : null;
}
