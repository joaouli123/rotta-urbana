import { supabase } from '../lib/supabase';
import { buildPixPayload } from '../lib/pix';
import type { PaymentRow, SubscriptionRow, AppSettings } from '../types/db';

export type PlanType = 'commission' | 'daily' | 'weekly' | 'monthly';

const PAYMENTS_API = (process.env.EXPO_PUBLIC_API_URL || 'https://rottaurbana.com.br').replace(/\/$/, '');

export interface SubscriptionCheckout {
  provider: 'mercadopago';
  subscription_id: string;
  status: string;
  plan: Exclude<PlanType, 'commission'>;
  amount: number;
  init_point: string;
  sandbox_init_point?: string | null;
  local_subscription_id?: string;
}

async function paymentsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');

  const response = await fetch(`${PAYMENTS_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
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

/** Opens Mercado Pago's hosted recurring checkout (card, Pix or boleto). */
export async function createSubscriptionCheckout(plan: Exclude<PlanType, 'commission'>): Promise<SubscriptionCheckout> {
  const checkout = await paymentsApi<SubscriptionCheckout>('/api/subscriptions/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
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
export async function selectPlan(plan: PlanType): Promise<void> {
  const { error } = await supabase.rpc('driver_select_plan', { p_plan: plan });
  if (error) throw error;
}

/** Returns null if plan not yet chosen (driver needs PlanSelectionScreen). */
export async function getDriverPlanType(): Promise<PlanType | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await supabase.from('drivers').select('plan_type').eq('id', u.user.id).single();
  return (data?.plan_type as PlanType) ?? null;
}

/** PIX copia-e-cola for a passenger to pay the ride fare DIRECTLY to the driver. */
export async function buildRideFarePix(rideId: string): Promise<{ code: string; amount: number; driverName: string } | null> {
  const { data: ride } = await supabase.from('rides').select('driver_id, price').eq('id', rideId).single();
  if (!ride?.driver_id) return null;
  const [{ data: driver }, { data: profile }, settings] = await Promise.all([
    supabase.from('drivers').select('pix_key').eq('id', ride.driver_id).single(),
    supabase.from('profiles').select('full_name').eq('id', ride.driver_id).single(),
    getAppSettings(),
  ]);
  if (!driver?.pix_key) return null;
  const code = buildPixPayload({
    key: driver.pix_key, name: profile?.full_name ?? 'Motorista',
    city: settings?.platform_pix_city ?? 'SINOP', amount: Number(ride.price), txid: 'CORRIDA',
  });
  return code ? { code, amount: Number(ride.price), driverName: profile?.full_name ?? 'Motorista' } : null;
}
