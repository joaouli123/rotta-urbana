import { supabase } from '../lib/supabase';

export interface ManagerKpis {
  context: ManagerContext;
  rides_today: number;
  rides_week: number;
  rides_month: number;
  rides_completed: number;
  rides_cancelled: number;
  drivers_total: number;
  drivers_verified: number;
  drivers_pending: number;
  drivers_online: number;
  drivers_on_ride: number;
  support_open: number;
  rides_in_progress: number;
  gross_month: number;
  avg_ticket: number;
  avg_distance_km: number;
  rides_by_type: Record<string, number>;
  by_month: { month: string; rides: number; gross: number }[];
}

export interface ManagerContext {
  manager_id: string;
  manager_type: 'city' | 'network';
  cities: string[];
  explicit_driver_count: number;
}

export interface ManagerRide {
  ride_id: string;
  status: string;
  ride_type: string;
  origin_address: string;
  destination_address: string;
  price: number | null;
  distance_km: number | null;
  duration_min: number | null;
  requested_at: string;
  completed_at: string | null;
  passenger_name: string | null;
  driver_name: string | null;
}

export interface ManagerReport {
  kpis: ManagerKpis;
  drivers: Array<{
    full_name: string;
    rating: number;
    total_ratings: number;
    total_rides: number;
    status: string;
    is_verified: boolean;
    operating_city: string | null;
    vehicle_model: string | null;
  }>;
  ride_status: Record<string, number>;
}

async function rpcJson<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

export async function getManagerContext(): Promise<ManagerContext> {
  return rpcJson<ManagerContext>('manager_context');
}

export async function getManagerKpis(): Promise<ManagerKpis> {
  return rpcJson<ManagerKpis>('manager_kpis');
}

export async function getManagerDrivers(limit = 300, search = ''): Promise<import('./admin').AdminDriver[]> {
  return (await rpcJson<import('./admin').AdminDriver[]>('manager_list_drivers', { p_limit: limit, p_search: search })) ?? [];
}

export async function verifyManagerDriver(driverId: string, approve: boolean): Promise<void> {
  await rpcJson<void>('manager_verify_driver', { p_driver_id: driverId, p_approve: approve });
}

export async function getManagerRides(limit = 300): Promise<ManagerRide[]> {
  return (await rpcJson<ManagerRide[]>('manager_list_rides', { p_limit: limit })) ?? [];
}

export async function getManagerReport(): Promise<ManagerReport> {
  return rpcJson<ManagerReport>('manager_full_report');
}

export async function getManagerTickets(limit = 200): Promise<import('./admin').AdminTicket[]> {
  return (await rpcJson<import('./admin').AdminTicket[]>('manager_list_tickets', { p_limit: limit })) ?? [];
}

export async function setManagerTicketStatus(
  ticketId: string,
  status: import('./admin').TicketStatus,
  response?: string,
): Promise<void> {
  await rpcJson<void>('manager_set_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
    p_response: response ?? null,
  });
}
