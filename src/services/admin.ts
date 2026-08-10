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
  operating_city?: string | null;
  operating_state?: string | null;
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

// ── Configurações de aprovação ────────────────────────────────────────────────
export interface AppSettings {
  driver_approval_mode: 'manual' | 'auto';
  min_vehicle_year: number;
  platform_name: string | null;
  platform_pix_key: string | null;
  platform_pix_name: string | null;
  platform_pix_city: string | null;
  commission_pct: number | null;
  plan_weekly_price: number | null;
  subscription_daily_amount: number | null;
  subscription_monthly_amount: number | null;
}

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.rpc('admin_get_settings');
  if (error) throw error;
  return data as AppSettings;
}

export async function setApprovalMode(mode: 'manual' | 'auto'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_approval_mode', { p_mode: mode });
  if (error) throw error;
}

export async function setMinVehicleYear(year: number): Promise<void> {
  const { error } = await supabase.rpc('admin_set_min_vehicle_year', { p_year: year });
  if (error) throw error;
}

export async function approveAllPending(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_approve_all_pending');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function setCommissionPct(pct: number): Promise<void> {
  const { error } = await supabase.rpc('admin_set_commission_pct', { p_pct: pct });
  if (error) throw error;
}

export async function setPlanWeeklyPrice(price: number): Promise<void> {
  const { error } = await supabase.rpc('admin_set_plan_weekly_price', { p_price: price });
  if (error) throw error;
}

// ── Managers ──────────────────────────────────────────────────────────────────
export interface Manager {
  manager_id: string;
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  manager_type: 'city' | 'network';
  city?: string | null;
  cities: { city: string; state: string | null }[];
  explicit_driver_count: number;
  is_active: boolean;
  created_at: string;
}

export interface UserSearchResult {
  id: string;
  full_name: string;
  email: string;
  role: string | null;
}

export async function listManagers(): Promise<Manager[]> {
  const { data, error } = await supabase.rpc('admin_list_managers');
  if (error) throw error;
  return (data as Manager[]) ?? [];
}

export async function upsertManager(profileId: string, city: string): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_manager', {
    p_profile_id: profileId,
    p_city: city,
  });
  if (error) throw error;
}

export async function removeManager(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_manager', {
    p_profile_id: profileId,
  });
  if (error) throw error;
}

export async function findUserByEmail(email: string): Promise<UserSearchResult | null> {
  const { data, error } = await supabase.rpc('admin_find_user_by_email', {
    p_email: email,
  });
  if (error) throw error;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] ?? null : data;
  return row as UserSearchResult | null;
}

// ── Full report ───────────────────────────────────────────────────────────────
export interface FullReport {
  passengers: {
    total: number;
    female: number;
    male: number;
    other: number;
    active_30d: number;
  };
  drivers: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
    avg_rating: number;
    total_rides: number;
  };
  rides: {
    total: number;
    completed: number;
    cancelled: number;
    in_progress: number;
    this_month: number;
    last_month: number;
    avg_price: number;
    avg_duration_min: number;
    avg_distance_km: number;
    gross_total: number;
    by_month: { month: string; count: number; gross: number }[];
  };
  revenue: {
    subscriptions_total: number;
    subscriptions_pending: number;
  };
  complaints: {
    total: number;
    open: number;
    in_progress: number;
    closed: number;
  };
}

export async function getFullReport(): Promise<FullReport> {
  const { data, error } = await supabase.rpc('admin_full_report');
  if (error) throw error;
  return data as FullReport;
}

// ── Driver ranking ────────────────────────────────────────────────────────────
export interface DriverRankingEntry {
  driver_id: string;
  full_name: string;
  phone: string | null;
  rating: number;
  total_ratings: number;
  total_rides: number;
  is_verified: boolean;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  rank_by_rating: number;
  rank_by_rides: number;
}

export async function getDriverRanking(limit = 30): Promise<DriverRankingEntry[]> {
  const { data, error } = await supabase.rpc('admin_driver_ranking', { p_limit: limit });
  if (error) throw error;
  return (data as DriverRankingEntry[]) ?? [];
}

export interface ManagerConfigInput {
  profileId: string;
  managerType: 'city' | 'network';
  cities: string[];
  driverIds: string[];
}

export interface CreateManagerAccountInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  managerType: 'city' | 'network';
  cities: string[];
  driverIds: string[];
}

export async function configureManager(input: ManagerConfigInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_configure_manager', {
    p_profile_id: input.profileId,
    p_manager_type: input.managerType,
    p_cities: input.cities,
    p_driver_ids: input.driverIds,
  });
  if (error) throw error;
  return String(data);
}

export async function createManagerAccount(input: CreateManagerAccountInput): Promise<{ manager_id: string; profile_id: string }> {
  const { data, error } = await supabase.functions.invoke('create-manager', {
    body: input,
  });
  if (error) throw error;
  return data as { manager_id: string; profile_id: string };
}

export async function setManagerActive(profileId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_manager_active', {
    p_profile_id: profileId,
    p_active: active,
  });
  if (error) throw error;
}

export interface ManagerScope {
  manager_type: 'city' | 'network';
  cities: string[];
  driver_ids: string[];
}

export async function getManagerScope(profileId: string): Promise<ManagerScope> {
  const { data, error } = await supabase.rpc('admin_manager_scope', { p_profile_id: profileId });
  if (error) throw error;
  return data as ManagerScope;
}
