import { supabase } from '../lib/supabase';

export type LngLat = [number, number];
export type ServiceAreaScope = 'radius' | 'city' | 'state' | 'country';

/**
 * Operational area used by maps, address search and the ride guard in the
 * database. The defaults keep older deployments safe while the migration is
 * being applied and match the current Sinop operation.
 */
export interface ServiceArea {
  enabled: boolean;
  scope: ServiceAreaScope;
  city: string;
  state: string;
  country: string;
  center: LngLat;
  radiusKm: number;
}

export const DEFAULT_SERVICE_AREA: ServiceArea = {
  enabled: true,
  scope: 'radius',
  city: 'Sinop',
  state: 'MT',
  country: 'BR',
  center: [-55.5024, -11.8642],
  radiusKm: 20,
};

type ServiceAreaRow = {
  service_area_enabled?: boolean | null;
  service_area_scope?: string | null;
  service_area_city?: string | null;
  service_area_state?: string | null;
  service_area_country?: string | null;
  service_area_center_lng?: number | string | null;
  service_area_center_lat?: number | string | null;
  service_area_radius_km?: number | string | null;
};

let cachedArea: ServiceArea | null = null;
let cachedAt = 0;
let loading: Promise<ServiceArea> | null = null;
const CACHE_TTL_MS = 60_000;

const finite = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SCOPES: ServiceAreaScope[] = ['radius', 'city', 'state', 'country'];

export const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapa', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceara',
  DF: 'Distrito Federal', ES: 'Espirito Santo', GO: 'Goias', MA: 'Maranhao', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Para', PB: 'Paraiba', PR: 'Parana',
  PE: 'Pernambuco', PI: 'Piaui', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondonia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'Sao Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil',
};

export function normalizeAreaText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasText(haystack: string, value: string): boolean {
  const needle = normalizeAreaText(value);
  if (!needle) return true;
  if (needle.length <= 2) return new RegExp(`(^| )${needle}( |$)`, 'i').test(haystack);
  return haystack.includes(needle);
}

function matchesStateText(haystack: string, state: string): boolean {
  const stateCode = state.toUpperCase();
  const stateName = BRAZIL_STATE_NAMES[stateCode] || stateCode;
  const codeMatches = hasText(haystack, stateCode);
  const nameMatches = hasText(haystack, stateName);
  // Mato Grosso do Sul must not be accepted when the configured UF is MT.
  if (stateCode === 'MT' && hasText(haystack, BRAZIL_STATE_NAMES.MS)) return false;
  return codeMatches || nameMatches;
}

function normalizeScope(value: unknown): ServiceAreaScope {
  const scope = String(value ?? '').trim().toLowerCase() as ServiceAreaScope;
  return SCOPES.includes(scope) ? scope : DEFAULT_SERVICE_AREA.scope;
}

function normalizeArea(row?: ServiceAreaRow | null): ServiceArea {
  const lng = finite(row?.service_area_center_lng, DEFAULT_SERVICE_AREA.center[0]);
  const lat = finite(row?.service_area_center_lat, DEFAULT_SERVICE_AREA.center[1]);
  const radiusKm = Math.min(200, Math.max(1, finite(row?.service_area_radius_km, DEFAULT_SERVICE_AREA.radiusKm)));

  return {
    enabled: row?.service_area_enabled !== false,
    scope: normalizeScope(row?.service_area_scope),
    city: String(row?.service_area_city || DEFAULT_SERVICE_AREA.city).trim() || DEFAULT_SERVICE_AREA.city,
    state: String(row?.service_area_state || DEFAULT_SERVICE_AREA.state).trim().toUpperCase() || DEFAULT_SERVICE_AREA.state,
    country: String(row?.service_area_country || DEFAULT_SERVICE_AREA.country).trim().toUpperCase() || DEFAULT_SERVICE_AREA.country,
    center: [lng, lat],
    radiusKm,
  };
}

/** Reads the admin setting once per minute so changes take effect without a new app build. */
export async function getServiceArea(force = false): Promise<ServiceArea> {
  const now = Date.now();
  if (!force && cachedArea && now - cachedAt < CACHE_TTL_MS) return cachedArea;
  if (!force && loading) return loading;

  const pending = (async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('service_area_enabled,service_area_scope,service_area_city,service_area_state,service_area_country,service_area_center_lng,service_area_center_lat,service_area_radius_km')
      .eq('id', 1)
      .maybeSingle();
    // An older database may not have the additive columns yet. Falling back
    // to Sinop keeps the client restricted instead of opening Brazil-wide.
    const area = error ? DEFAULT_SERVICE_AREA : normalizeArea(data as ServiceAreaRow | null);
    cachedArea = area;
    cachedAt = Date.now();
    return area;
  })()
    .catch(() => {
      cachedArea = DEFAULT_SERVICE_AREA;
      cachedAt = Date.now();
      return DEFAULT_SERVICE_AREA;
    })
    .finally(() => {
      loading = null;
    });

  loading = pending;
  return pending;
}

export function clearServiceAreaCache() {
  cachedArea = null;
  cachedAt = 0;
}

export function serviceAreaBbox(area: ServiceArea) {
  const [lng, lat] = area.center;
  const latDelta = area.radiusKm / 111.32;
  const lngDelta = area.radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    ne: [lng + lngDelta, lat + latDelta] as LngLat,
    sw: [lng - lngDelta, lat - latDelta] as LngLat,
  };
}

export function distanceKm(from: LngLat, to: LngLat): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const radius = 6371;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinServiceArea(point: LngLat, area: ServiceArea, extraKm = 0): boolean {
  return !area.enabled || area.scope !== 'radius' || distanceKm(point, area.center) <= area.radiusKm + extraKm;
}

/**
 * Official check in the database: the IBGE boundary of the configured
 * city/state/country (the same rule the ride guard applies). null when it
 * cannot decide — offline, or no boundary stored for the area yet — so the
 * caller falls back to its own check.
 */
export async function isLocationInServiceArea(point: LngLat, address?: string | null): Promise<boolean | null> {
  try {
    // Untyped: the function is newer than the generated database types.
    const { data, error } = await (supabase as any).rpc('service_area_allows_location', {
      p_lng: point[0], p_lat: point[1], p_address: address ?? null,
    });
    return !error && typeof data === 'boolean' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Map limit from the official boundary stored for the configured area — the
 * same one the rides are checked against. null when it cannot be used: radius
 * scope, offline, no stored boundary, or a boundary of another area than `area`.
 */
export async function getOfficialServiceAreaBounds(area: ServiceArea): Promise<{ ne: LngLat; sw: LngLat } | null> {
  if (!area.enabled || area.scope === 'radius') return null;
  try {
    // Untyped: the function is newer than the generated database types.
    const { data, error } = await (supabase as any).rpc('service_area_map_bounds');
    if (error || !data) return null;
    const state = area.scope === 'country' ? '' : area.state;
    const cityKey = area.scope === 'city' ? normalizeAreaText(area.city) : '';
    if (data.scope !== area.scope || data.country !== area.country || data.state !== state || data.city_key !== cityKey) return null;
    const [west, south, east, north] = [data.west, data.south, data.east, data.north].map(Number);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    return { sw: [west, south], ne: [east, north] };
  } catch {
    return null;
  }
}

export function scopedGeocodeQuery(query: string, area: ServiceArea): string {
  const base = query.trim();
  if (!area.enabled || !base) return base;
  const normalized = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const city = area.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const state = area.state.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const countryName = COUNTRY_NAMES[area.country] || area.country;
  const country = countryName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (area.scope === 'country') return normalized.includes(country) ? base : `${base}, ${countryName}`;
  if (area.scope === 'state') {
    const stateName = (BRAZIL_STATE_NAMES[area.state] || area.state).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes(state) || normalized.includes(stateName)) return `${base}, ${area.country}`;
    return `${base}, ${BRAZIL_STATE_NAMES[area.state] || area.state}, ${area.country}`;
  }
  if (area.scope === 'city' || area.scope === 'radius') {
    if (normalized.includes(city)) return `${base}, ${area.state}, ${area.country}`;
    return `${base}, ${area.city}, ${area.state}, ${area.country}`;
  }
  return base;
}

/** Checks a formatted address or reverse-geocoded context against the configured administrative scope. */
export function matchesServiceAreaText(text: string, area: ServiceArea): boolean {
  if (!area.enabled || area.scope === 'radius') return true;
  const haystack = normalizeAreaText(text);
  if (!haystack) return false;
  if (area.scope === 'country') return hasText(haystack, COUNTRY_NAMES[area.country] || area.country);
  if (!matchesStateText(haystack, area.state)) return false;
  if (area.scope === 'state') return true;
  return hasText(haystack, area.city);
}

export function serviceAreaScopeLabel(scope: ServiceAreaScope): string {
  return ({ radius: 'Raio', city: 'Cidade', state: 'Estado', country: 'País' } as Record<ServiceAreaScope, string>)[scope];
}

export function serviceAreaLabel(area: ServiceArea): string {
  if (area.scope === 'country') return COUNTRY_NAMES[area.country] || area.country;
  if (area.scope === 'state') return BRAZIL_STATE_NAMES[area.state] || area.state;
  if (area.scope === 'city') return `${area.city}/${area.state}`;
  return `${area.city}/${area.state} (raio de ${area.radiusKm} km)`;
}
