// Mapbox Directions + Geocoding over HTTP. These work everywhere (incl. Expo Go);
// only the native map RENDERING (@rnmapbox/maps) needs a dev build.
// Free tier (per month): Directions 100k req, Geocoding 100k req, Maps SDK 25k MAU.
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? '';

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
}

/** Driving route geometry + distance/duration between two points. */
export async function getRoute(from: LngLat, to: LngLat): Promise<RouteResult | null> {
  if (!TOKEN) return null;
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    geometry: route.geometry,
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
  };
}

/** Forward geocoding (address -> places). Biased toward Brazil. */
export async function geocode(query: string, proximity?: LngLat): Promise<Place[]> {
  if (!TOKEN || query.trim().length < 3) return [];
  const params = new URLSearchParams({
    q: query, access_token: TOKEN, country: 'br', language: 'pt', limit: '6',
  });
  if (proximity) params.set('proximity', `${proximity[0]},${proximity[1]}`);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    name: f.properties?.name ?? f.properties?.name_preferred ?? query,
    address: f.properties?.full_address ?? f.properties?.place_formatted ?? '',
    lng: f.geometry?.coordinates?.[0],
    lat: f.geometry?.coordinates?.[1],
  })).filter((p: Place) => typeof p.lng === 'number' && typeof p.lat === 'number');
}

/** Reverse geocoding (point -> address). */
export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  if (!TOKEN) return '';
  const params = new URLSearchParams({
    longitude: String(lng), latitude: String(lat),
    access_token: TOKEN, language: 'pt', limit: '1',
  });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params}`);
  if (!res.ok) return '';
  const data = await res.json();
  return data.features?.[0]?.properties?.full_address ??
         data.features?.[0]?.properties?.place_formatted ?? '';
}
