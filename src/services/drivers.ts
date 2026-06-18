import { supabase } from '../lib/supabase';
import type { DriverRow, DriverStatus, NearbyDriver, RideRow } from '../types/db';

export async function getMyDriver(): Promise<DriverRow | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase.from('drivers').select('*').eq('id', u.user.id).single();
  if (error) return null;
  return data as DriverRow;
}

export interface NewVehicle {
  model: string; plate: string; year: number; color: string;
  type?: 'sedan' | 'hatch' | 'suv' | 'moto';
  brand?: string; fipeCode?: string; fipeValue?: number; seats?: number;
}

export async function addVehicle(v: NewVehicle): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { error } = await supabase.from('vehicles').insert({
    driver_id: u.user.id,
    model: v.model, plate: v.plate, year: v.year, color: v.color,
    type: v.type ?? 'sedan', is_primary: true,
    brand: v.brand ?? null, fipe_code: v.fipeCode ?? null,
    fipe_value: v.fipeValue ?? null, seats: v.seats ?? 4,
  });
  if (error) throw error;
}

/** Ride categories the current driver's vehicle qualifies for (e.g. ['economy','comfort']). */
export async function getMyCategories(): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_categories');
  if (error) throw error;
  return (data as string[]) ?? [];
}

/** Driver confirms a completed ride was paid (cash/PIX-direto). Admin can too. */
export async function markFarePaid(rideId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_fare_paid', { p_ride_id: rideId });
  if (error) throw error;
}

export async function setStatus(status: DriverStatus): Promise<void> {
  const { error } = await supabase.rpc('set_driver_status', { p_status: status });
  if (error) throw error;
}

export async function updateDriverPix(pixKey: string, pixKeyType: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { error } = await supabase.from('drivers')
    .update({ pix_key: pixKey.trim(), pix_key_type: pixKeyType }).eq('id', u.user.id);
  if (error) throw error;
}

export async function updateLocation(lat: number, lng: number, heading?: number): Promise<void> {
  const { error } = await supabase.rpc('update_driver_location', {
    p_lat: lat, p_lng: lng, p_heading: heading ?? null,
  });
  if (error) throw error;
}

export async function nearbyDrivers(lat: number, lng: number, radiusM = 5000): Promise<NearbyDriver[]> {
  const { data, error } = await supabase.rpc('nearby_drivers', {
    p_lat: lat, p_lng: lng, p_radius_m: radiusM,
  });
  if (error) throw error;
  return (data as NearbyDriver[]) ?? [];
}

/** Open ride requests a verified driver can accept (RLS gates this to drivers). */
export async function getSearchingRides(): Promise<RideRow[]> {
  const { data, error } = await supabase
    .from('rides').select('*').eq('status', 'searching')
    .order('requested_at', { ascending: true }).limit(20);
  if (error) throw error;
  return (data as RideRow[]) ?? [];
}

/** Realtime feed of new ride requests for drivers. */
export function subscribeSearchingRides(onInsert: (ride: RideRow) => void) {
  const channel = supabase
    .channel('rides:searching')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.searching' },
      (payload) => onInsert(payload.new as RideRow))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Aggregate completed-ride earnings for the logged-in driver. Computed in SQL
 * via the driver_earnings RPC (one small payload) instead of pulling every ride.
 */
export async function getEarnings(): Promise<{ today: number; week: number; month: number; total: number; rides: number }> {
  const { data, error } = await supabase.rpc('driver_earnings');
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    today: Number(d.today) || 0,
    week: Number(d.week) || 0,
    month: Number(d.month) || 0,
    total: Number(d.total) || 0,
    rides: Number(d.rides) || 0,
  };
}
