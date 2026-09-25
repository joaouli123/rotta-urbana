import { supabase } from '../lib/supabase';
import { paymentsApi } from './payments';

/** One day's commissions, due the next morning at 10:00. */
export interface CommissionInvoice {
  id: string;
  ref_date: string;
  amount: number;
  rides_count: number;
  status: 'open' | 'paid' | 'waived';
  due_at: string;
  paid_at: string | null;
}

export interface CommissionStatus {
  open_total: number;
  next_due_at: string | null;
  /** An open day past its due time: the driver is blocked until paying. */
  overdue: boolean;
  open: Pick<CommissionInvoice, 'id' | 'ref_date' | 'amount' | 'rides_count' | 'due_at'>[];
  /** Commissions of today, billed tonight. */
  today_amount: number;
  today_rides: number;
}

export interface CommissionPix {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  amount: number;
  invoice_ids: string[];
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
}

export interface CommissionPaymentRow {
  id: string;
  amount: number;
  status: CommissionPix['status'];
  invoice_ids: string[];
  paid_at: string | null;
  created_at: string;
}

export async function getCommissionStatus(): Promise<CommissionStatus> {
  const { data, error } = await supabase.rpc('driver_commission_status');
  if (error) throw error;
  const d = (data ?? {}) as Partial<CommissionStatus>;
  return {
    open_total: Number(d.open_total ?? 0),
    next_due_at: d.next_due_at ?? null,
    overdue: !!d.overdue,
    open: (d.open ?? []).map((i) => ({ ...i, amount: Number(i.amount) })),
    today_amount: Number(d.today_amount ?? 0),
    today_rides: Number(d.today_rides ?? 0),
  };
}

/** Days already closed, newest first (paid ones are the payment history). */
export async function getCommissionInvoices(limit = 60): Promise<CommissionInvoice[]> {
  const { data, error } = await supabase
    .from('commission_invoices')
    .select('id, ref_date, amount, rides_count, status, due_at, paid_at')
    .order('ref_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as CommissionInvoice[]) ?? []).map((i) => ({ ...i, amount: Number(i.amount) }));
}

export async function getCommissionPayments(limit = 30): Promise<CommissionPaymentRow[]> {
  const { data, error } = await supabase
    .from('commission_payments')
    .select('id, amount, status, invoice_ids, paid_at, created_at')
    .eq('status', 'approved')
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as CommissionPaymentRow[]) ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
}

/** Pix for every open day at once; the same code comes back while it is valid. */
export function createCommissionPix(): Promise<CommissionPix> {
  return paymentsApi<CommissionPix>('/api/commissions/pix', { method: 'POST', body: '{}' });
}

export function getCommissionPix(id: string): Promise<CommissionPix> {
  return paymentsApi<CommissionPix>(`/api/commissions/pix/${encodeURIComponent(id)}`);
}
