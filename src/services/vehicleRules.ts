import { supabase } from '../lib/supabase';

export type RegistrationVehicleType = 'car' | 'moto';

export interface PublicVehicleRule {
  ride_type: string;
  min_year: number;
  min_fipe_value: number;
  allowed_vehicle_types: string[];
  min_seats: number;
  require_colors: string[];
  active: boolean;
}

let rulesPromise: Promise<PublicVehicleRule[]> | null = null;
let rulesLoadedAt = 0;
const RULES_CACHE_MS = 5 * 60 * 1000;
const PUBLIC_RULES_URL = `${(process.env.EXPO_PUBLIC_API_URL || 'https://rottaurbana.com.br').replace(/\/$/, '')}/api/public/vehicle-rules`;

function normalizeRules(data: unknown): PublicVehicleRule[] {
  return ((data ?? []) as PublicVehicleRule[]).map((rule) => ({
    ...rule,
    min_year: Number(rule.min_year) || 0,
    min_fipe_value: Number(rule.min_fipe_value) || 0,
    allowed_vehicle_types: Array.isArray(rule.allowed_vehicle_types) ? rule.allowed_vehicle_types : [],
    min_seats: Number(rule.min_seats) || 1,
    require_colors: Array.isArray(rule.require_colors) ? rule.require_colors : [],
    active: rule.active !== false,
  }));
}

async function fetchPublicRules(): Promise<PublicVehicleRule[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(PUBLIC_RULES_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Vehicle rules HTTP ${response.status}`);
    return normalizeRules(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRules(): Promise<PublicVehicleRule[]> {
  try {
    return await fetchPublicRules();
  } catch (publicApiError) {
    // Local builds or older deployments can still use the read-only RPC after
    // its migration is applied. Production normally uses the Coolify route so
    // panel changes are reflected without requiring an authenticated signup.
    const { data, error } = await supabase.rpc('get_registration_vehicle_rules');
    if (error) throw publicApiError;
    return normalizeRules(data);
  }
}

export function getRegistrationVehicleRules(): Promise<PublicVehicleRule[]> {
  const now = Date.now();
  if (!rulesPromise || now - rulesLoadedAt >= RULES_CACHE_MS) {
    rulesLoadedAt = now;
    rulesPromise = loadRules().catch((error) => {
      rulesPromise = null;
      rulesLoadedAt = 0;
      throw error;
    });
  }
  return rulesPromise;
}

/**
 * Returns the lowest configured year that can accept the selected vehicle
 * type. For cars, the broadest active car category is used because the driver
 * has not selected a ride category yet; the server still validates every
 * category when the vehicle is used.
 */
export async function getRegistrationMinYear(type: RegistrationVehicleType): Promise<number | null> {
  const rules = await getRegistrationVehicleRules();
  const eligible = rules.filter((rule) => {
    if (!rule.active) return false;
    if (type === 'moto') return rule.ride_type === 'moto';
    if (rule.ride_type === 'moto') return false;
    return rule.allowed_vehicle_types.length === 0
      || rule.allowed_vehicle_types.some((vehicleType) => ['sedan', 'hatch', 'suv'].includes(vehicleType));
  });

  const years = eligible.map((rule) => rule.min_year).filter((year) => year > 0);
  return years.length > 0 ? Math.min(...years) : null;
}
