import {
  COUNTRY_NAMES,
  getOfficialServiceAreaBounds,
  getServiceArea,
  isLocationInServiceArea,
  isWithinServiceArea,
  matchesServiceAreaText,
  normalizeAreaText,
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
  featureType?: string;
  city?: string;
  /** Region code (UF), e.g. "MT". Mapbox omits it for most POIs. */
  state?: string;
  postcode?: string;
  countryCode?: string;
  mapboxId?: string;
}

/** Autocomplete row. Search Box suggestions only get coordinates in resolvePlace(). */
export interface PlaceSuggestion extends Omit<Place, 'lng' | 'lat'> {
  id: string;
  lng?: number;
  lat?: number;
  /** Metres from the service-area center (radius scope only). */
  distanceM?: number;
  sessionToken?: string;
}

type Bbox = { ne: LngLat; sw: LngLat };
type ScopeCandidate = Omit<PlaceSuggestion, 'id'>;
type ScopeOptions = { bounds?: Bbox | null };

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

// First five CEP digits -> UF. Search Box POIs carry city + CEP but no region.
const CEP_RANGES: [number, number, string][] = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'],
  [40000, 48999, 'BA'], [49000, 49999, 'SE'], [50000, 56999, 'PE'], [57000, 57999, 'AL'],
  [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'],
  [69300, 69399, 'RR'], [69400, 69899, 'AM'], [69900, 69999, 'AC'], [70000, 72799, 'DF'],
  [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'], [80000, 87999, 'PR'],
  [88000, 89999, 'SC'], [90000, 99999, 'RS'],
];

function stateFromPostcode(postcode?: string): string | undefined {
  const match = /^(\d{5})(?:-?\d{3})?$/.exec(postcode?.trim() ?? '');
  if (!match) return undefined;
  const prefix = Number(match[1]);
  return CEP_RANGES.find(([min, max]) => prefix >= min && prefix <= max)?.[2];
}

function candidateState(place: { state?: string; postcode?: string; countryCode?: string }, area: ServiceArea): string | undefined {
  const code = place.state?.trim().toUpperCase();
  if (code) return code;
  const country = (place.countryCode || area.country || '').toUpperCase();
  return country === 'BR' ? stateFromPostcode(place.postcode) : undefined;
}

function contextText(context: any, ...extra: unknown[]): string {
  return [
    context?.place?.name,
    context?.locality?.name,
    context?.district?.name,
    context?.region?.name,
    context?.country?.name,
    context?.country?.country_code ?? context?.country?.short_code,
    ...extra,
  ].filter(Boolean).join(', ');
}

function contextFields(context: any, featureType?: string, name?: string) {
  return {
    city: context?.place?.name ?? (featureType === 'place' ? name : undefined),
    state: context?.region?.region_code || undefined,
    postcode: context?.postcode?.name ?? (featureType === 'postcode' ? name : undefined),
    countryCode: context?.country?.country_code || undefined,
  };
}

function placeFromFeature(feature: any, fallback = ''): Place | null {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties ?? {};
  if (!Array.isArray(coordinates) || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') return null;
  const context = properties.context ?? {};
  const name = properties.name ?? properties.name_preferred ?? fallback;
  return {
    name,
    address: properties.full_address ?? properties.place_formatted ?? properties.address ?? '',
    lng: coordinates[0],
    lat: coordinates[1],
    contextText: contextText(context, properties.place_formatted, properties.full_address),
    featureType: properties.feature_type,
    ...contextFields(context, properties.feature_type, name),
    mapboxId: properties.mapbox_id,
  };
}

function insideBounds(point: { lng?: number; lat?: number }, bounds?: Bbox | null): boolean | undefined {
  if (!bounds || typeof point.lng !== 'number' || typeof point.lat !== 'number') return undefined;
  return point.lng >= bounds.sw[0] && point.lng <= bounds.ne[0]
    && point.lat >= bounds.sw[1] && point.lat <= bounds.ne[1];
}

/**
 * Mapbox Search Box omits the region for POIs ("Shopping Sinop" only has city
 * + CEP), so the UF also comes from the CEP. A result whose scope is unknown
 * never passes: the bbox is a rectangle that overlaps neighbouring
 * cities/states. Picked places are checked again against the official
 * boundary (isCoordinateWithinServiceArea) and the database rejects the rest.
 */
function matchesConfiguredScope(place: ScopeCandidate, area: ServiceArea, options: ScopeOptions = {}): boolean {
  if (!area.enabled) return true;
  if (area.scope === 'radius') {
    if (typeof place.lng === 'number' && typeof place.lat === 'number') return isWithinServiceArea([place.lng, place.lat], area);
    return typeof place.distanceM === 'number' && place.distanceM <= area.radiusKm * 1000;
  }

  const country = place.countryCode?.toUpperCase();
  if (country && area.country && country !== area.country) return false;
  // The name is left out on purpose: spam POIs such as "Casa em Sinop MT" exist elsewhere.
  const textMatches = matchesServiceAreaText([place.address, place.contextText].filter(Boolean).join(', '), area);
  if (area.scope === 'country') return !!country || textMatches;

  const state = candidateState(place, area);
  if (state && state !== area.state) return false;
  if (area.scope === 'state') return !!state || textMatches;

  if (place.city && normalizeAreaText(place.city) !== normalizeAreaText(area.city)) return false;
  if (place.city && state) return true;
  if (textMatches) return true;
  // UF unknown: the city name is trusted only for results Mapbox already
  // limited to the city's own bbox (and inside it, when coordinates exist).
  return !!place.city && !!options.bounds && insideBounds(place, options.bounds) !== false;
}

const POI_TERMS = [
  'shopping', 'hospital', 'clinica', 'farmacia', 'mercado', 'supermercado',
  'restaurante', 'lanchonete', 'hotel', 'pousada', 'aeroporto', 'rodoviaria',
  'escola', 'faculdade', 'universidade', 'igreja', 'parque', 'praca', 'posto',
  'academia', 'banco', 'oficina', 'delegacia', 'cartorio', 'prefeitura',
];

function isLikelyPoiQuery(query: string): boolean {
  const normalized = query
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return POI_TERMS.some((term) => normalized.includes(term));
}

function placeScore(place: Place, query: string, area: ServiceArea, bounds: Bbox | null): number {
  const normalizedQuery = query
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const searchable = `${place.name} ${place.address}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const localText = `${place.address} ${place.contextText ?? ''}`;
  let score = 0;
  if (place.featureType === 'poi') score += isLikelyPoiQuery(query) ? 10_000 : 900;
  if (place.featureType === 'address') score += 500;
  if (normalizedQuery && searchable.includes(normalizedQuery)) score += 300;
  if (area.enabled && area.scope !== 'radius' && matchesConfiguredScope(place, area, { bounds })) score += 400;
  if (area.enabled && area.scope === 'radius') {
    // Search Box already returns a distance, but scoring by coordinates keeps
    // the ordering deterministic across its POI/address result types.
    const distance = Math.hypot(
      (place.lng - area.center[0]) * Math.cos((area.center[1] * Math.PI) / 180),
      place.lat - area.center[1],
    );
    score -= distance * 100;
  }
  if (area.city && localText.toLowerCase().includes(area.city.toLowerCase())) score += 150;
  return score;
}

function sortPlaces(places: Place[], query: string, area: ServiceArea, bounds: Bbox | null): Place[] {
  return places
    .sort((a, b) => placeScore(b, query, area, bounds) - placeScore(a, query, area, bounds))
    .slice(0, 8);
}

const bboxParam = (bounds: Bbox) => `${bounds.sw[0]},${bounds.sw[1]},${bounds.ne[0]},${bounds.ne[1]}`;

/** Rectangle that hard-limits Mapbox results: the radius square or the city/state bbox. */
async function searchBounds(area: ServiceArea): Promise<Bbox | null> {
  if (!area.enabled || area.scope === 'country') return null;
  return area.scope === 'radius' ? serviceAreaBbox(area) : getServiceAreaBounds(area);
}

/** Ranks results near the user (like 99/Uber) while they are inside the area. */
function biasPoint(area: ServiceArea, bounds: Bbox | null, proximity?: LngLat | null): LngLat | undefined {
  if (!proximity) return area.enabled ? area.center : undefined;
  if (!area.enabled) return proximity;
  const nearby = area.scope === 'radius'
    ? isWithinServiceArea(proximity, area)
    : !bounds || insideBounds({ lng: proximity[0], lat: proximity[1] }, bounds) === true;
  return nearby ? proximity : area.center;
}

async function searchBoxGeocode(query: string, area: ServiceArea, bounds: Bbox | null, bias?: LngLat): Promise<Place[]> {
  // The raw query + admin bbox ranks real local places; appending
  // ", Sinop, MT, BR" surfaced spam POIs that merely contain the city name.
  const params = new URLSearchParams({
    q: query.trim(), access_token: TOKEN, language: 'pt', limit: '10',
  });
  if (area.enabled) {
    if (area.country) params.set('country', area.country.toUpperCase());
    // A generic term such as "Shopping" should favor local businesses, but
    // must not hard-exclude addresses/streets — Mapbox's POI coverage is
    // sparse in smaller cities, and an all-poi filter can return zero
    // results for a place that exists under a different feature type.
    if (isLikelyPoiQuery(query)) params.set('types', 'poi,address,street,place');
  }
  if (bounds) params.set('bbox', bboxParam(bounds));
  if (bias) params.set('proximity', `${bias[0]},${bias[1]}`);
  const data = await fetchJson<{ features?: any[] }>(
    `https://api.mapbox.com/search/searchbox/v1/forward?${params}`,
  );
  return (data?.features ?? [])
    .map((feature: any) => placeFromFeature(feature, query))
    .filter((place: Place | null): place is Place => !!place && matchesConfiguredScope(place, area, { bounds }));
}

async function legacyGeocode(query: string, area: ServiceArea, bounds: Bbox | null, bias?: LngLat): Promise<Place[]> {
  const params = new URLSearchParams({
    q: scopedGeocodeQuery(query, area), access_token: TOKEN, language: 'pt', limit: '8',
  });
  if (area.enabled && area.country) params.set('country', area.country.toLowerCase());
  if (bounds) params.set('bbox', bboxParam(bounds));
  if (bias) params.set('proximity', `${bias[0]},${bias[1]}`);
  const data = await fetchJson<{ features?: any[] }>(
    `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
  );
  return (data?.features ?? [])
    .map((feature: any) => placeFromFeature(feature, query))
    .filter((place: Place | null): place is Place => !!place && matchesConfiguredScope(place, area, { bounds }));
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
 * Forward geocoding (address -> places), for one-shot lookups such as a
 * typed/recent destination. Use searchPlaces() for as-you-type autocomplete.
 *
 * When the admin has an operational area enabled, Mapbox is limited to that
 * area's bbox and results outside the configured scope are discarded locally
 * too, because the bbox is rectangular and overlaps neighbouring cities.
 */
export async function geocode(query: string, proximity?: LngLat | null): Promise<Place[]> {
  if (!TOKEN || query.trim().length < 3) return [];
  const area = await getServiceArea();
  const bounds = await searchBounds(area);
  const bias = biasPoint(area, bounds, proximity);
  const searchBoxPlaces = await searchBoxGeocode(query, area, bounds, bias);
  const fallbackPlaces = searchBoxPlaces.length > 0
    ? []
    : await legacyGeocode(query, area, bounds, bias);
  return sortPlaces([...searchBoxPlaces, ...fallbackPlaces], query, area, bounds);
}

// Search Box bills /suggest + /retrieve per session. A session ends with the
// retrieve, after 50 suggests or when idle, so the token rotates in those cases.
const SESSION_MAX_SUGGESTS = 50;
const SESSION_IDLE_MS = 170_000;
const SUGGEST_TYPES = 'poi,address,street,neighborhood,locality,place,postcode';

function newSessionToken(): string {
  const cryptoApi = (globalThis as any).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random % 4) + 8).toString(16);
  });
}

let searchSession = { token: newSessionToken(), suggests: 0, lastUsedAt: 0 };

function nextSuggestToken(): string {
  const now = Date.now();
  if (searchSession.suggests >= SESSION_MAX_SUGGESTS
    || (searchSession.lastUsedAt > 0 && now - searchSession.lastUsedAt > SESSION_IDLE_MS)) {
    searchSession = { token: newSessionToken(), suggests: 0, lastUsedAt: 0 };
  }
  searchSession.suggests += 1;
  searchSession.lastUsedAt = now;
  return searchSession.token;
}

function suggestionFromMapbox(item: any, index: number, sessionToken: string): PlaceSuggestion | null {
  const featureType: string | undefined = item?.feature_type;
  const name: string | undefined = item?.name;
  // category/brand rows are search shortcuts, not places a ride can go to.
  if (!name || !featureType || !SUGGEST_TYPES.split(',').includes(featureType)) return null;
  const context = item.context ?? {};
  const fullAddress: string = item.full_address ?? '';
  // Streets repeat their own name in full_address; show only the locality then.
  const address = fullAddress && !normalizeAreaText(fullAddress).startsWith(normalizeAreaText(name))
    ? fullAddress
    : item.place_formatted ?? fullAddress ?? item.address ?? '';
  return {
    id: item.mapbox_id ?? `${featureType}-${index}`,
    name,
    address,
    featureType,
    mapboxId: item.mapbox_id,
    contextText: contextText(context, item.place_formatted, fullAddress),
    ...contextFields(context, featureType, name),
    distanceM: typeof item.distance === 'number' ? item.distance : undefined,
    sessionToken,
  };
}

/**
 * As-you-type place search (Mapbox Search Box /suggest), the same kind of
 * autocomplete 99/Uber use: partial words such as "shopp" already find
 * "Shopping Sinop". Rows have no coordinates — call resolvePlace() on tap.
 */
export async function searchPlaces(query: string, proximity?: LngLat | null): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!TOKEN || q.length < 2) return [];
  const area = await getServiceArea();
  const bounds = await searchBounds(area);
  const sessionToken = nextSuggestToken();
  const params = new URLSearchParams({
    q, access_token: TOKEN, language: 'pt', limit: '10', types: SUGGEST_TYPES, session_token: sessionToken,
  });
  if (area.enabled && area.country) params.set('country', area.country.toUpperCase());
  if (bounds) params.set('bbox', bboxParam(bounds));
  const bias = biasPoint(area, bounds, proximity);
  if (bias) params.set('proximity', `${bias[0]},${bias[1]}`);
  // Distances are measured from `origin`: the area center keeps the radius
  // filter exact; otherwise the user, so nearby places can be ranked first.
  const origin = area.enabled && area.scope === 'radius' ? area.center : bias;
  if (origin) params.set('origin', `${origin[0]},${origin[1]}`);

  const data = await fetchJson<{ suggestions?: any[] }>(
    `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`,
  );
  const seen = new Set<string>();
  const suggestions = (data?.suggestions ?? [])
    .map((item: any, index: number) => suggestionFromMapbox(item, index, sessionToken))
    .filter((item): item is PlaceSuggestion => {
      if (!item || seen.has(item.id) || !matchesConfiguredScope(item, area, { bounds })) return false;
      seen.add(item.id);
      return true;
    });
  if (suggestions.length > 0) {
    // Concrete places first. Mapbox may rank the city itself, or user-created
    // POIs with neither street nor CEP (rental listings such as "Casa com
    // piscina próximo à UFMT"), above the real place.
    const rank = (item: PlaceSuggestion) => {
      if (item.featureType === 'place' || item.featureType === 'postcode') return 2;
      return item.featureType === 'poi' && !item.postcode && item.address.split(',').length <= 2 ? 1 : 0;
    };
    // Then nearby before far, like 99/Uber: with a state-wide area, "prefeitura"
    // typed in Sinop must list Sinop's before a neighbouring town's.
    const nearness = (item: PlaceSuggestion) => {
      if (typeof item.distanceM !== 'number') return 1;
      return item.distanceM <= 15_000 ? 0 : item.distanceM <= 60_000 ? 1 : 2;
    };
    return suggestions
      .map((item, index) => ({ item, index }))
      .sort((a, b) => rank(a.item) - rank(b.item) || nearness(a.item) - nearness(b.item) || a.index - b.index)
      .map(({ item }) => item);
  }

  // Search Box unavailable or empty (e.g. an address only the v6 geocoder knows).
  const places = await geocode(q, proximity);
  return places.map((place, index) => ({ ...place, id: place.mapboxId ?? `${place.lng},${place.lat},${index}` }));
}

/** Coordinates + full context for a tapped suggestion (Search Box /retrieve). */
export async function resolvePlace(suggestion: PlaceSuggestion): Promise<Place | null> {
  if (typeof suggestion.lng === 'number' && typeof suggestion.lat === 'number') {
    const { id: _id, distanceM: _distance, sessionToken: _token, ...place } = suggestion;
    return { ...place, lng: suggestion.lng, lat: suggestion.lat };
  }
  if (TOKEN && suggestion.mapboxId) {
    const sessionToken = suggestion.sessionToken ?? searchSession.token;
    const params = new URLSearchParams({ access_token: TOKEN, language: 'pt', session_token: sessionToken });
    const data = await fetchJson<{ features?: any[] }>(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapboxId)}?${params}`,
    );
    if (searchSession.token === sessionToken) {
      searchSession = { token: newSessionToken(), suggests: 0, lastUsedAt: 0 };
    }
    const place = placeFromFeature(data?.features?.[0], suggestion.name);
    if (place) {
      return {
        ...place,
        name: place.name || suggestion.name,
        address: place.address || suggestion.address,
        city: place.city ?? suggestion.city,
        state: place.state ?? suggestion.state,
        postcode: place.postcode ?? suggestion.postcode,
        countryCode: place.countryCode ?? suggestion.countryCode,
      };
    }
  }
  const [fallback] = await geocode(placeLabel(suggestion));
  return fallback ?? null;
}

/**
 * Text saved on the ride: keeps the POI name ("Shopping Sinop, Av. Alexandre
 * Ferronato, ...") and the street name, which Mapbox leaves out of
 * place_formatted.
 */
export function placeLabel(place: { name?: string; address?: string }): string {
  const name = place.name?.trim() ?? '';
  const address = place.address?.trim() ?? '';
  if (!name) return address;
  if (!address) return name;
  return normalizeAreaText(address).includes(normalizeAreaText(name)) ? address : `${name}, ${address}`;
}

function withStateSegment(address: string, city: string | undefined, area: ServiceArea): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const cityKey = city ? normalizeAreaText(city) : '';
  const cityIndex = cityKey ? parts.findIndex((part) => normalizeAreaText(part) === cityKey) : -1;
  if (cityIndex >= 0) {
    parts[cityIndex] = `${parts[cityIndex]} - ${area.state}`;
    return parts.join(', ');
  }
  const countryKey = normalizeAreaText(COUNTRY_NAMES[area.country] || area.country);
  const tailIndex = parts.findIndex((part, index) => index > 0
    && (/^\d{5}(-?\d{3})?$/.test(part) || normalizeAreaText(part) === countryKey));
  parts.splice(tailIndex >= 0 ? tailIndex : parts.length, 0, city ? `${city} - ${area.state}` : area.state);
  return parts.join(', ');
}

/**
 * The database validates city/state areas by address text, but Mapbox POI
 * addresses usually lack the UF ("Av. Alexandre Ferronato, Sinop, 78557-247,
 * Brasil"). Adds "Sinop - MT" taken from reverse geocoding the point itself,
 * and only when that point really is inside the area — otherwise the
 * original text goes through and the database rejects it.
 */
export async function addressWithServiceArea(address: string, point: LngLat): Promise<string> {
  const base = address.trim();
  const area = await getServiceArea();
  if (!area.enabled || area.scope === 'radius' || (base && matchesServiceAreaText(base, area))) return base;
  const [reverse, bounds] = await Promise.all([
    reverseGeocodePlace(point[0], point[1]),
    getServiceAreaBounds(area),
  ]);
  if (!reverse || !matchesConfiguredScope({ ...reverse, lng: point[0], lat: point[1] }, area, { bounds })) return base;
  const reverseLabel = placeLabel(reverse);
  if (!base) return reverseLabel;
  const enriched = area.scope === 'country'
    ? `${base}, ${COUNTRY_NAMES[area.country] || area.country}`
    : withStateSegment(base, reverse.city ?? (area.scope === 'city' ? area.city : undefined), area);
  if (matchesServiceAreaText(enriched, area)) return enriched;
  const combined = `${base}, ${reverseLabel}`;
  return matchesServiceAreaText(combined, area) ? combined : base;
}

/** Point of a PostGIS column as PostgREST returns it (hex EWKB) or as GeoJSON. */
export function parseGeoPoint(value: unknown): LngLat | null {
  let lng: number | undefined;
  let lat: number | undefined;
  if (value && typeof value === 'object' && Array.isArray((value as any).coordinates)) {
    [lng, lat] = (value as any).coordinates;
  } else if (typeof value === 'string' && value.length >= 42 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)) {
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(value.substr(i * 2, 2), 16);
    const view = new DataView(bytes.buffer);
    const little = bytes[0] === 1;
    const type = view.getUint32(1, little);
    const offset = type & 0x20000000 ? 9 : 5; // EWKB carries the SRID before the coordinates
    if ((type & 0xffff) !== 1 || bytes.length < offset + 16) return null;
    lng = view.getFloat64(offset, little);
    lat = view.getFloat64(offset + 8, little);
  }
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng as number, lat as number] : null;
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

/**
 * City/state/country areas are decided by the official boundary in the
 * database — the same rule that accepts or rejects the ride. Reverse
 * geocoding only covers an unreachable RPC or a boundary not loaded yet.
 */
export async function isCoordinateWithinServiceArea(point: LngLat, area: ServiceArea): Promise<boolean> {
  if (!area.enabled) return true;
  if (area.scope === 'radius') return isWithinServiceArea(point, area);
  const official = await isLocationInServiceArea(point);
  if (official !== null) return official;
  const [place, bounds] = await Promise.all([
    reverseGeocodePlace(point[0], point[1]),
    getServiceAreaBounds(area),
  ]);
  return !!place && matchesConfiguredScope({ ...place, lng: point[0], lat: point[1] }, area, { bounds });
}

let boundsCache: { key: string; value: Bbox; expiresAt: number } | null = null;

/**
 * Rectangle of the configured city/state/country. The official boundary the
 * rides are checked against comes first; the Mapbox geocode only covers a
 * database without it. null when neither answered.
 */
export async function resolveServiceAreaBounds(area: ServiceArea): Promise<Bbox | null> {
  if (!area.enabled || area.scope === 'radius') return serviceAreaBbox(area);
  const key = [area.scope, area.city, area.state, area.country].join('|');
  if (boundsCache && boundsCache.key === key && boundsCache.expiresAt > Date.now()) return boundsCache.value;

  const value = (await getOfficialServiceAreaBounds(area)) ?? (await geocodedAreaBounds(area));
  if (!value) return null;
  boundsCache = { key, value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}

/** Resolves an administrative bbox for city/state/country map framing. */
export async function getServiceAreaBounds(area: ServiceArea): Promise<Bbox> {
  return (await resolveServiceAreaBounds(area)) ?? serviceAreaBbox(area);
}

async function geocodedAreaBounds(area: ServiceArea): Promise<Bbox | null> {
  if (!TOKEN) return null;
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
  if (!valid) return null;
  return { sw: [bbox[0], bbox[1]], ne: [bbox[2], bbox[3]] };
}
