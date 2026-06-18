import { supabase } from '../lib/supabase';
import type { RideStatusDb, RideTypeDb, DriverStatus, SubscriptionStatus } from '../types/db';

// ── KPIs ──────────────────────────────────────────────────────────────────────
export interface AdminKpis {
  passengers: number;
  drivers_total: number;
  drivers_online: number;
  drivers_on_ride: number;
  drivers_verified: number;
  drivers_pending: number;
  rides_total: number;
  rides_today: number;
  rides_week: number;
  rides_month: number;
  rides_in_progress: number;
  rides_completed: number;
  rides_cancelled: number;
  gross_fares_month: number;
  subs_active: number;
  subs_expired: number;
  revenue_subscriptions: number;
  support_open: number;
  // per-category breakdowns (completed rides, last 30 days), incl. moto
  rides_by_type?: Partial<Record<RideTypeDb, number>>;
  gross_fares_by_type?: Partial<Record<RideTypeDb, number>>;
}

export async function getAdminKpis(): Promise<AdminKpis> {
  const { data, error } = await supabase.rpc('admin_kpis');
  if (error) throw error;
  return data as AdminKpis;
}

// ── Active rides ──────────────────────────────────────────────────────────────
export interface AdminActiveRide {
  ride_id: string;
  passenger_name: string | null;
  driver_name: string | null;
  origin_address: string;
  destination_address: string;
  status: RideStatusDb;
  ride_type: RideTypeDb;
  price: number | null;
  requested_at: string;
}

export async function getAdminActiveRides(limit = 100): Promise<AdminActiveRide[]> {
  const { data, error } = await supabase.rpc('admin_active_rides', { p_limit: limit });
  if (error) throw error;
  return (data as AdminActiveRide[]) ?? [];
}

// ── Drivers ───────────────────────────────────────────────────────────────────
export interface AdminDriver {
  driver_id: string;
  full_name: string;
  phone: string | null;
  rating: number;
  status: DriverStatus;
  is_verified: boolean;
  documents_status: string;
  total_rides: number;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_year: number | null;
  subscription_status: SubscriptionStatus | null;
  subscription_due: string | null;
}

export async function getAdminDrivers(limit = 200): Promise<AdminDriver[]> {
  const { data, error } = await supabase.rpc('admin_list_drivers', { p_limit: limit });
  if (error) throw error;
  return (data as AdminDriver[]) ?? [];
}

export async function verifyDriver(driverId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_verify_driver', { p_driver_id: driverId, p_approve: approve });
  if (error) throw error;
}

// ── Payments ──────────────────────────────────────────────────────────────────
export interface AdminPayment {
  payment_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';
  method: 'pix' | 'card' | 'boleto';
  paid_at: string | null;
  created_at: string;
  subscription_status: SubscriptionStatus | null;
  subscription_due: string | null;
}

export async function getAdminPayments(limit = 100): Promise<AdminPayment[]> {
  const { data, error } = await supabase.rpc('admin_list_payments', { p_limit: limit });
  if (error) throw error;
  return (data as AdminPayment[]) ?? [];
}

// ── Support tickets ───────────────────────────────────────────────────────────
export type TicketStatus = 'open' | 'in_progress' | 'closed';
export interface AdminTicket {
  ticket_id: string;
  user_name: string | null;
  subject: string;
  message: string;
  status: TicketStatus;
  response: string | null;
  created_at: string;
}

export async function getAdminTickets(limit = 100): Promise<AdminTicket[]> {
  const { data, error } = await supabase.rpc('admin_list_tickets', { p_limit: limit });
  if (error) throw error;
  return (data as AdminTicket[]) ?? [];
}

export async function setTicketStatus(ticketId: string, status: TicketStatus, response?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_ticket_status', {
    p_ticket_id: ticketId, p_status: status, p_response: response ?? null,
  });
  if (error) throw error;
}
