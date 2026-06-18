import { supabase } from '../lib/supabase';
import type { RideRow, RideStatusDb, RideTypeDb, PaymentMethodDb } from '../types/db';

const ACTIVE: RideStatusDb[] = ['searching', 'driver_found', 'driver_on_way', 'driver_arrived', 'in_progress'];
const first = <T,>(d: T | T[] | null): T | null => (Array.isArray(d) ? d[0] ?? null : d);

export interface RequestRideInput {
  originLat: number; originLng: number; originAddress: string;
  destLat: number; destLng: number; destAddress: string;
  rideType?: RideTypeDb; paymentMethod?: PaymentMethodDb;
  requiresFemaleDriver?: boolean;
}

export async function requestRide(i: RequestRideInput): Promise<RideRow> {
  const { data, error } = await supabase.rpc('request_ride', {
    p_origin_lat: i.originLat, p_origin_lng: i.originLng, p_origin_address: i.originAddress,
    p_dest_lat: i.destLat, p_dest_lng: i.destLng, p_dest_address: i.destAddress,
    p_ride_type: i.rideType ?? 'economy', p_payment_method: i.paymentMethod ?? 'pix',
    p_requires_female_driver: i.requiresFemaleDriver ?? false,
  });
  if (error) throw error;
  return first<RideRow>(data)!;
}

/** Passenger relaxes the female-driver preference so any driver can accept. */
export async function relaxFemalePreference(rideId: string): Promise<RideRow> {
  const { data, error } = await supabase.rpc('relax_female_preference', { p_ride_id: rideId });
  if (error) throw error;
  return first<RideRow>(data)!;
}

export async function acceptRide(rideId: string): Promise<RideRow> {
  const { data, error } = await supabase.rpc('accept_ride', { p_ride_id: rideId });
  if (error) throw error;
  return first<RideRow>(data)!;
}

export async function updateRideStatus(rideId: string, status: 'driver_arrived' | 'in_progress' | 'completed'): Promise<RideRow> {
  const { data, error } = await supabase.rpc('update_ride_status', { p_ride_id: rideId, p_status: status });
  if (error) throw error;
  return first<RideRow>(data)!;
}

export async function cancelRide(rideId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_ride', { p_ride_id: rideId, p_reason: reason ?? null });
  if (error) throw error;
}

export async function rateRide(rideId: string, stars: number, comment?: string): Promise<void> {
  const { error } = await supabase.rpc('rate_ride', { p_ride_id: rideId, p_stars: stars, p_comment: comment ?? null });
  if (error) throw error;
}

/** Fetch a single ride by id (RLS-scoped). */
export async function getRide(rideId: string): Promise<RideRow | null> {
  const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();
  if (error) return null;
  return (data as RideRow) ?? null;
}

/** Current active ride for the logged-in user (RLS scopes to passenger or driver). */
export async function getActiveRide(): Promise<RideRow | null> {
  const { data, error } = await supabase
    .from('rides').select('*').in('status', ACTIVE)
    .order('requested_at', { ascending: false }).limit(1);
  if (error) throw error;
  return first<RideRow>(data);
}

export async function getRideHistory(limit = 50): Promise<RideRow[]> {
  const { data, error } = await supabase
    .from('rides').select('*').in('status', ['completed', 'cancelled'])
    .order('requested_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as RideRow[]) ?? [];
}

/**
 * Completed rides for the logged-in driver (RLS scopes to driver_id), ordered
 * by completion time. Used by the earnings screen to aggregate by period.
 */
export async function getDriverCompletedRides(limit = 500): Promise<RideRow[]> {
  const { data, error } = await supabase
    .from('rides').select('*').eq('status', 'completed')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data as RideRow[]) ?? [];
}

/** Estimated fare per ride category for a given distance/duration. */
export async function estimateFares(distanceKm: number, durationMin: number): Promise<Record<string, number>> {
  const types = ['moto', 'economy', 'comfort', 'premium'] as const;
  const entries = await Promise.all(types.map(async (t) => {
    const { data } = await supabase.rpc('fare_estimate', {
      p_ride_type: t, p_distance_km: distanceKm, p_duration_min: durationMin,
    });
    return [t, Number(data) || 0] as const;
  }));
  return Object.fromEntries(entries);
}

export interface RidePoints {
  originLat: number; originLng: number; destLat: number; destLng: number; status: RideStatusDb;
}

/** Origin/destination of a ride as lat/lng (for drawing the route). */
export async function getRidePoints(rideId: string): Promise<RidePoints | null> {
  const { data, error } = await supabase.rpc('ride_points', { p_ride_id: rideId });
  if (error) throw error;
  const r = first<any>(data);
  return r ? {
    originLat: r.origin_lat, originLng: r.origin_lng,
    destLat: r.dest_lat, destLng: r.dest_lng, status: r.status,
  } : null;
}

export interface RideCounterpart {
  name: string; phone: string | null; rating: number;
  vehicleModel: string | null; vehiclePlate: string | null;
}

/** The other party of a ride (driver for a passenger, passenger for a driver). */
export async function getRideCounterpart(rideId: string): Promise<RideCounterpart | null> {
  const { data, error } = await supabase.rpc('ride_counterpart', { p_ride_id: rideId });
  if (error) return null;
  const r = first<any>(data);
  return r ? {
    name: r.name, phone: r.phone, rating: Number(r.rating) || 5,
    vehicleModel: r.vehicle_model, vehiclePlate: r.vehicle_plate,
  } : null;
}

/** Live location of the driver assigned to a ride. */
export async function getRideDriverLocation(rideId: string): Promise<{ lat: number; lng: number; heading: number | null } | null> {
  const { data, error } = await supabase.rpc('ride_driver_location', { p_ride_id: rideId });
  if (error) return null;
  const r = first<any>(data);
  return r ? { lat: r.lat, lng: r.lng, heading: r.heading } : null;
}

/** Realtime updates for one ride (status, driver assignment, etc.). */
export function subscribeToRide(rideId: string, onChange: (ride: RideRow) => void) {
  const channel = supabase
    .channel(`ride:${rideId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
      (payload) => onChange(payload.new as RideRow))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
