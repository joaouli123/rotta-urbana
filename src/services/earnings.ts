import { supabase } from '../lib/supabase';

export type DriverCommissionStatus = 'pending' | 'paid' | 'waived';

export interface DriverCommissionRow {
  id: string;
  ride_id: string;
  ride_price: number;
  commission_pct: number;
  commission_amount: number;
  status: DriverCommissionStatus;
  created_at: string;
  paid_at: string | null;
}

export interface DriverRidePaymentRow {
  ride_id: string;
  gross_amount: number;
  commission_pct: number;
  marketplace_fee: number;
  driver_amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';
}

/**
 * Comissões gravadas pelo gatilho do banco quando uma corrida do plano
 * comissão é concluída. O RLS limita o resultado ao motorista autenticado.
 */
export async function getDriverCommissions(limit = 500): Promise<DriverCommissionRow[]> {
  const { data, error } = await supabase
    .from('driver_commissions')
    .select('id, ride_id, ride_price, commission_pct, commission_amount, status, created_at, paid_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DriverCommissionRow[]) ?? [];
}

/**
 * Splits de Mercado Pago. Cartão/Pix pagos pelo checkout já são divididos
 * automaticamente e não devem gerar um segundo PIX manual de comissão.
 */
export async function getDriverRidePayments(limit = 500): Promise<DriverRidePaymentRow[]> {
  const { data, error } = await supabase
    .from('ride_payments')
    .select('ride_id, gross_amount, commission_pct, marketplace_fee, driver_amount, status')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DriverRidePaymentRow[]) ?? [];
}
