import { supabase } from '../lib/supabase';
import { buildPixPayload } from '../lib/pix';
import type { PaymentRow, SubscriptionRow, AppSettings, PlanSegment } from '../types/db';

export type PlanType = 'commission' | 'daily' | 'weekly' | 'monthly';

export function isSubscriptionCurrent(subscription: SubscriptionRow | null | undefined): boolean {
  if (!subscription || subscription.status !== 'active' || !subscription.due_date) return false;
  return String(subscription.due_date).slice(0, 10) >= new Date().toISOString().slice(0, 10);
}

const PAYMENTS_API = (process.env.EXPO_PUBLIC_API_URL || 'https://rottaurbana.com.br').replace(/\/$/, '');

export interface SubscriptionCheckout {
  provider: 'mercadopago';
  subscription_id: string;
  status: string;
  plan: Exclude<PlanType, 'commission'>;
  plan_segment?: PlanSegment | null;
  amount: number;
  init_point: string;
  sandbox_init_point?: string | null;
  local_subscription_id?: string;
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
  if (!response.ok) throw new Error(payload?.error || `Falha no servidor de pagamentos (${response.status}).`);
  return payload as T;
}

export async function getSubscription(): Promise<SubscriptionRow | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase.from('subscriptions').select('*').eq('driver_id', u.user.id).maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow) ?? null;
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

/** Opens Mercado Pago's hosted recurring checkout for the allowed methods: card or Pix. */
export async function createSubscriptionCheckout(
  plan: Exclude<PlanType, 'commission'>,
  segment?: PlanSegment,
): Promise<SubscriptionCheckout> {
  const checkout = await paymentsApi<SubscriptionCheckout>('/api/subscriptions/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, segment }),
  });
  if (!checkout?.init_point) throw new Error('O Mercado Pago não retornou o link de pagamento.');
  return checkout;
}

/** Reconciles the local subscription with Mercado Pago after returning to the app. */
export async function syncSubscriptionStatus(): Promise<SubscriptionRow | null> {
  const result = await paymentsApi<{ subscription: SubscriptionRow | null }>('/api/subscriptions/status');
  return result.subscription;
}

export async function cancelSubscription(): Promise<void> {
  await paymentsApi('/api/subscriptions/cancel', { method: 'POST', body: '{}' });
}

/**
 * Driver chooses their billing model. Commission is immediate; fixed plans
 * are handed to the Mercado Pago recurring checkout after this selection.
 */
export async function selectPlan(plan: PlanType, segment?: PlanSegment): Promise<void> {
  const { error } = await supabase.rpc('driver_select_plan', {
    p_plan: plan,
    p_segment: segment ?? 'economy',
  });
  if (error) throw error;
}

/** Returns null if plan not yet chosen (driver needs PlanSelectionScreen). */
export async function getDriverPlanType(): Promise<PlanType | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await supabase.from('drivers').select('plan_type').eq('id', u.user.id).single();
  return (data?.plan_type as PlanType) ?? null;
}

export async function getDriverPlanSegment(): Promise<PlanSegment | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await supabase.from('drivers').select('plan_segment').eq('id', u.user.id).single();
  const segment = data?.plan_segment;
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
