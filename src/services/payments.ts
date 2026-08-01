import { supabase } from '../lib/supabase';
import { buildPixPayload } from '../lib/pix';
import type { PaymentRow, SubscriptionRow, AppSettings } from '../types/db';

export type PlanType = 'commission' | 'daily' | 'weekly' | 'monthly';

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

/** Driver switches between daily/monthly plans (amount comes from settings). */
export async function setSubscriptionPlan(plan: 'daily' | 'monthly'): Promise<SubscriptionRow> {
  const { data, error } = await supabase.rpc('set_subscription_plan', { p_plan: plan });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as SubscriptionRow;
}

/** PIX copia-e-cola to pay the driver subscription into the platform's PIX key. */
export async function buildSubscriptionPix(): Promise<{ code: string; amount: number } | null> {
  const [settings, sub] = await Promise.all([getAppSettings(), getSubscription()]);
  if (!settings?.platform_pix_key || !sub) return null;
  const code = buildPixPayload({
    key: settings.platform_pix_key, name: settings.platform_pix_name,
    city: settings.platform_pix_city, amount: Number(sub.amount), txid: 'ASSINATURA',
  });
  return code ? { code, amount: Number(sub.amount) } : null;
}

/**
 * Driver chooses their billing model. Commission = access imediato.
 * Fixed plans (daily/weekly/monthly) = aguarda pagamento via PIX.
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

/**
 * Builds a PIX copia-e-cola code for the driver to pay their chosen fixed plan
 * into the platform's PIX key.
 */
export async function buildPlanPix(plan: PlanType): Promise<{ code: string; amount: number }> {
  const settings = await getAppSettings();
  if (!settings?.platform_pix_key) throw new Error('Chave PIX não configurada');

  let amount: number;
  switch (plan) {
    case 'daily':
      amount = settings.plan_daily_price ?? settings.subscription_daily_amount;
      break;
    case 'weekly':
      amount = settings.plan_weekly_price ?? (settings.subscription_monthly_amount / 4);
      break;
    case 'monthly':
      amount = settings.subscription_monthly_amount;
      break;
    default:
      throw new Error('Plano inválido para geração de PIX');
  }

  // Tenta gerar via API do Mercado Pago no servidor de produção
  try {
    const { data: u } = await supabase.auth.getUser();
    const res = await fetch('https://rottaurbana.com.br/api/payments/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        description: `Plano Rotta Urbana (${plan.toUpperCase()})`,
        email: u?.user?.email || 'motorista@rottaurbana.com.br',
        driver_id: u?.user?.id
      })
    });
    const json = await res.json();
    if (json?.qr_code) {
      return { code: json.qr_code, amount };
    }
  } catch {
    // Fallback gracioso para payload estático se offline
  }

  const code = buildPixPayload({
    key: settings.platform_pix_key,
    name: settings.platform_pix_name,
    city: settings.platform_pix_city,
    amount,
    txid: `PLANO${plan.toUpperCase().slice(0, 4)}`,
  });
  if (!code) throw new Error('Erro ao gerar código PIX');
  return { code, amount };
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
