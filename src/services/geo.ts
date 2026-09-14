import {
  getServiceArea,
  isWithinServiceArea,
  matchesServiceAreaText,
  scopedGeocodeQuery,
  serviceAreaBbox,
  type ServiceArea,
} from './serviceArea';

// Mapbox Directions + Geocoding over HTTP. These work everywhere (incl. Expo Go);
// only the native map RENDERING (@rnmapbox/maps) needs a dev build.
// Free tier (per month): Directions 100k req, Geocoding 100k req, Maps SDK 25k MAU.
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? '';
const REQUEST_TIMEOUT_MS = 12_000;

export type LngLat = [number, number]; // [lng, lat] — Mapbox order

export interface RouteResult {
  geometry: { type: 'LineString'; coordinates: LngLat[] };
  distanceKm: number;
  durationMin: number;
}

export interface Place {
  name: string;
  address: string;
  lng: number;
  lat: number;
  contextText?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function placeFromFeature(feature: any, fallback = ''): Place | null {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties ?? {};
  if (!Array.isArray(coordinates) || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') return null;
  const context = properties.context ?? {};
  const contextText = [
    context.place?.name,
    context.locality?.name,
    context.district?.name,
    context.region?.name,
    context.country?.name,
    context.country?.short_code,
    properties.place_formatted,
    properties.full_address,
  ].filter(Boolean).join(', ');
  return {
    name: properties.name ?? properties.name_preferred ?? fallback,
    address: properties.full_address ?? properties.place_formatted ?? '',
    lng: coordinates[0],
    lat: coordinates[1],
    contextText,
  };
}

function matchesConfiguredScope(place: Place, area: ServiceArea): boolean {
  if (!area.enabled) return true;
  if (area.scope === 'radius') return isWithinServiceArea([place.lng, place.lat], area);
  return matchesServiceAreaText([place.name, place.address, place.contextText].filter(Boolean).join(', '), area);
}

/** Driving route geometry + distance/duration between two points. */
export async function getRoute(from: LngLat, to: LngLat): Promise<RouteResult | null> {
  if (!TOKEN) return null;
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${TOKEN}`;
  const data = await fetchJson<{ routes?: any[] }>(url);
  if (!data) return null;
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    geometry: route.geometry,
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
  };
}

/**
 * Forward geocoding (address -> places).
 *
 * When the admin has an operational area enabled, Mapbox is biased to that
 * city and results outside its configured radius are discarded locally too.
 * The local filter is important because Mapbox's bbox is rectangular and can
 * still return a nearby municipality at the edge.
 */
export async function geocode(query: string, proximity?: LngLat): Promise<Place[]> {
  if (!TOKEN || query.trim().length < 3) return [];
  const area = await getServiceArea();
  const params = new URLSearchParams({
    q: scopedGeocodeQuery(query, area), access_token: TOKEN, language: 'pt', limit: '8',
  });
  if (area.enabled) {
    if (area.country) params.set('country', area.country.toLowerCase());
    if (area.scope === 'radius') {
      const bbox = serviceAreaBbox(area);
      params.set('bbox', `${bbox.sw[0]},${bbox.sw[1]},${bbox.ne[0]},${bbox.ne[1]}`);
    }
    params.set('proximity', `${area.center[0]},${area.center[1]}`);
  } else if (proximity) {
    params.set('proximity', `${proximity[0]},${proximity[1]}`);
  }
  const data = await fetchJson<{ features?: any[] }>(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  if (!data) return [];
  return (data.features ?? [])
    .map((feature: any) => placeFromFeature(feature, query))
    .filter((place: Place | null): place is Place => !!place && matchesConfiguredScope(place, area));
}

/** Reverse geocoding (point -> address). */
export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const place = await reverseGeocodePlace(lng, lat);
  return place?.address || place?.name || '';
}

export async function reverseGeocodePlace(lng: number, lat: number): Promise<Place | null> {
  if (!TOKEN) return null;
  const params = new URLSearchParams({
    longitude: String(lng), latitude: String(lat),
    access_token: TOKEN, language: 'pt', limit: '1',
  });
  const data = await fetchJson<{ features?: any[] }>(`https://api.mapbox.com/search/geocode/v6/reverse?${params}`);
  return placeFromFeature(data?.features?.[0], '');
}

/** Validates GPS coordinates using the selected administrative scope. */
export async function isCoordinateWithinServiceArea(point: LngLat, area: ServiceArea): Promise<boolean> {
  if (!area.enabled) return true;
  if (area.scope === 'radius') return isWithinServiceArea(point, area);
  const place = await reverseGeocodePlace(point[0], point[1]);
  return !!place && matchesConfiguredScope(place, area);
}

type Bbox = { ne: LngLat; sw: LngLat };
let boundsCache: { key: string; value: Bbox; expiresAt: number } | null = null;

/** Resolves an administrative bbox for city/state/country map framing. */
export async function getServiceAreaBounds(area: ServiceArea): Promise<Bbox> {
  const fallback = serviceAreaBbox(area);
  if (!area.enabled || area.scope === 'radius' || !TOKEN) return fallback;
  const key = [area.scope, area.city, area.state, area.country].join('|');
  if (boundsCache && boundsCache.key === key && boundsCache.expiresAt > Date.now()) return boundsCache.value;

  const label = area.scope === 'country'
    ? (area.country || 'BR')
    : area.scope === 'state'
      ? `${area.state}, ${area.country}`
      : `${area.city}, ${area.state}, ${area.country}`;
  const types = area.scope === 'country' ? 'country' : area.scope === 'state' ? 'region' : 'place';
  const params = new URLSearchParams({
    q: label, types, access_token: TOKEN, language: 'pt', limit: '1',
  });
  if (area.country) params.set('country', area.country.toLowerCase());
  const data = await fetchJson<{ features?: any[] }>(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  const bbox = data?.features?.[0]?.bbox ?? data?.features?.[0]?.properties?.bbox;
  const valid = Array.isArray(bbox) && bbox.length === 4 && bbox.every((value: unknown) => typeof value === 'number');
  if (!valid) return fallback;
  const value: Bbox = { sw: [bbox[0], bbox[1]], ne: [bbox[2], bbox[3]] };
  boundsCache = { key, value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}
