import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../constants';
import { Flag } from 'lucide-react-native';
import { DEFAULT_SERVICE_AREA, getServiceArea, serviceAreaBbox, type ServiceArea } from '../services/serviceArea';
import { resolveServiceAreaBounds } from '../services/geo';

// ─────────────────────────────────────────────────────────────────────────────
// Safe Mapbox loader.
// @rnmapbox/maps is a NATIVE module: it renders only in a custom dev build / EAS
// build, NOT in Expo Go. We load it defensively so the app keeps running (with a
// placeholder) anywhere the native module or a Mapbox token is missing.
// Runtime token must be a PUBLIC token (pk.). See MAPBOX.md.
// ─────────────────────────────────────────────────────────────────────────────
let Mapbox: any = null;
let MAP_READY = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@rnmapbox/maps');
  Mapbox = mod?.default ?? mod;
  const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  if (Mapbox?.setAccessToken && token) {
    Mapbox.setAccessToken(token);          // throws in Expo Go (no native module)
    MAP_READY = true;
  }
} catch {
  MAP_READY = false;
}

export type LngLat = [number, number]; // [lng, lat]

export interface DriverPin {
  id: string;
  lng: number;
  lat: number;
  heading?: number | null;
}

interface RouteMapProps {
  origin?: LngLat;
  destination?: LngLat;
  drivers?: DriverPin[];
  route?: { type: 'LineString'; coordinates: LngLat[] } | null;
  followUser?: boolean;
  /** Keep the operational map focused on the Sinop service area. */
  restrictToSinop?: boolean;
  paddingTop?: number;
  paddingBottom?: number;
  driverLocation?: LngLat;
  secondaryRoute?: { type: 'LineString'; coordinates: LngLat[] } | null;
  style?: ViewStyle;
}

export const isMapAvailable = () => MAP_READY;

/** Driver and passenger home maps frame the service area the same way. */
export const homeMapPadding = (topInset: number, screenHeight: number) => ({
  paddingTop: topInset + 80,
  paddingBottom: Math.round(screenHeight * 0.5),
});

/** Driver and passenger ride maps frame the trip the same way. */
export const RIDE_MAP_PADDING = { paddingTop: 80, paddingBottom: 320 };

// ─────────────────────────────────────────────────────────────────────────────
// Shared service-area limit.
// Every restricted map (driver and passenger, every screen) reads ONE limit,
// resolved here and pushed to all mounted maps, so no screen is left with a
// provisional or fallback rectangle while another already has the real one.
// ─────────────────────────────────────────────────────────────────────────────
interface MapLimits {
  area: ServiceArea;
  bounds: { ne: LngLat; sw: LngLat };
  minZoom: number;
}

const LIMITS_TTL_MS = 60_000;
const LIMITS_RETRY_MS = 15_000;
let mapLimits: MapLimits | null = null;
let mapLimitsKey = '';
let mapLimitsExpiresAt = 0;
let loadingLimits = false;
const limitListeners = new Set<(limits: MapLimits) => void>();

const minZoomFor = (area: ServiceArea) => (area.radiusKm <= 30 ? 11.5 : area.radiusKm <= 60 ? 10.5 : 9.5);

async function refreshMapLimits() {
  if (loadingLimits || (mapLimits && mapLimitsExpiresAt > Date.now())) return;
  loadingLimits = true;
  try {
    const area = await getServiceArea();
    const bounds = await resolveServiceAreaBounds(area);
    // No answer yet: the configured radius keeps the map closed until the retry.
    const next: MapLimits = { area, bounds: bounds ?? serviceAreaBbox(area), minZoom: minZoomFor(area) };
    mapLimitsExpiresAt = Date.now() + (bounds ? LIMITS_TTL_MS : LIMITS_RETRY_MS);
    if (!bounds) setTimeout(() => { if (limitListeners.size) refreshMapLimits(); }, LIMITS_RETRY_MS + 500);
    const key = JSON.stringify(next);
    if (key === mapLimitsKey) return;
    mapLimits = next;
    mapLimitsKey = key;
    limitListeners.forEach((listener) => listener(next));
  } catch {
    /* keep the last limit */
  } finally {
    loadingLimits = false;
  }
}

function useMapLimits(enabled: boolean): MapLimits | null {
  const [limits, setLimits] = useState<MapLimits | null>(mapLimits);
  useEffect(() => {
    if (!enabled) return;
    limitListeners.add(setLimits);
    if (mapLimits) setLimits(mapLimits);
    refreshMapLimits();
    return () => { limitListeners.delete(setLimits); };
  }, [enabled]);
  return enabled ? limits : null;
}

const RouteMap: React.FC<RouteMapProps> = ({ origin, destination, drivers = [], route, followUser, restrictToSinop = false, paddingTop, paddingBottom, driverLocation, secondaryRoute, style }) => {
  const limits = useMapLimits(restrictToSinop);

  if (!MAP_READY) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.phTitle}>Mapa</Text>
        <Text style={styles.phText}>
          O mapa Mapbox aparece em um build nativo (dev client / EAS).{'\n'}
          Configure um token público (pk.) em EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN.
        </Text>
      </View>
    );
  }

  const center = origin ?? (drivers[0] ? [drivers[0].lng, drivers[0].lat] as LngLat : [-55.5024, -11.8642] as LngLat);
  // Follow the live GPS puck only when we have no fixed points to frame.
  const follow = !restrictToSinop && !!followUser && !origin && !destination && !route;
  const pad = { paddingTop: paddingTop ?? 0, paddingBottom: paddingBottom ?? 0, paddingLeft: 0, paddingRight: 0 };

  // Frame the WHOLE trip when we have a route or both endpoints.
  // Also extend bounds to include the live driver position so the pin stays on screen.
  const basePts: LngLat[] =
    route && route.coordinates.length > 1 ? [...route.coordinates]
      : (origin && destination ? [origin, destination] : []);
  if (driverLocation && basePts.length > 0) basePts.push(driverLocation);
  const framePts: LngLat[] | null = basePts.length > 1 ? basePts : null;
  let bounds: any = null;
  let boundsKey = 'static';
  if (framePts) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of framePts) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    // Caller padding is authoritative (it already accounts for the bottom sheet).
    // Add only a small margin so the pins aren't glued to the edges.
    bounds = {
      ne: [maxLng, maxLat], sw: [minLng, minLat],
      paddingTop: (paddingTop ?? 0) + 24, paddingBottom: (paddingBottom ?? 0) + 24,
      paddingLeft: 40, paddingRight: 40,
    };
    boundsKey = [
      origin?.map((n) => n.toFixed(5)).join(',') ?? 'no-origin',
      destination?.map((n) => n.toFixed(5)).join(',') ?? 'no-destination',
      route?.coordinates.length ?? 0,
      paddingTop ?? 0,
      paddingBottom ?? 0,
    ].join(':');
  }

  // The admin-configured area replaces the old hardcoded Sinop rectangle.
  // No limit is applied until the shared one is resolved: a provisional
  // rectangle would clamp this map differently from the others.
  const serviceArea = limits?.area ?? DEFAULT_SERVICE_AREA;
  const mapCenter = restrictToSinop ? serviceArea.center : center;
  const maxBounds = limits?.bounds;
  const minZoomLevel = limits?.minZoom;
  const minServiceZoom = minZoomFor(serviceArea);

  return (
    <Mapbox.MapView style={[{ flex: 1 }, style]} styleURL={Mapbox.StyleURL.Street} logoEnabled={false} compassEnabled={false}>
      {bounds ? (
        // key is based on the destination only — it forces a re-mount (hard animation) when
        // the user picks a new destination, but NOT on every driver location poll.
        <Mapbox.Camera
          key={boundsKey}
          bounds={bounds}
          maxBounds={maxBounds}
          minZoomLevel={minZoomLevel}
          maxZoomLevel={15.5}
          animationDuration={700}
        />
      ) : follow ? (
        <Mapbox.Camera
          followUserLocation
          followZoomLevel={15}
          defaultSettings={{ centerCoordinate: serviceArea.center, zoomLevel: minServiceZoom + 1.5 }}
          maxBounds={maxBounds}
          minZoomLevel={minZoomLevel}
          padding={pad}
          animationDuration={700}
        />
      ) : (
        <Mapbox.Camera zoomLevel={Math.min(15, minServiceZoom + 3.5)} centerCoordinate={mapCenter} maxBounds={maxBounds} minZoomLevel={minZoomLevel} padding={pad} animationDuration={700} />
      )}
      {/* Stable location dot (default puck, no spinning heading arrow). */}
      <Mapbox.UserLocation visible androidRenderMode="normal" />

      {origin && (
        <Mapbox.PointAnnotation id="origin" coordinate={origin}>
          <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
        </Mapbox.PointAnnotation>
      )}
      {destination && (
        <Mapbox.PointAnnotation id="destination" coordinate={destination} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.flagPin}>
            <Flag size={15} color="#000000" fill="#000000" strokeWidth={2.4} />
          </View>
        </Mapbox.PointAnnotation>
      )}

      {drivers.map((d) => (
        <Mapbox.PointAnnotation key={d.id} id={`drv-${d.id}`} coordinate={[d.lng, d.lat]}>
          <View style={styles.carPin} />
        </Mapbox.PointAnnotation>
      ))}

      {route && route.coordinates?.length > 1 && (
        <Mapbox.ShapeSource id="route" shape={{ type: 'Feature', properties: {}, geometry: route }}>
          <Mapbox.LineLayer
            id="routeLine"
            style={{ lineColor: '#000000', lineWidth: 6, lineCap: 'round', lineJoin: 'round' }}
          />
        </Mapbox.ShapeSource>
      )}

      {/* driver -> pickup line (the approaching car) */}
      {secondaryRoute && secondaryRoute.coordinates?.length > 1 && (
        <Mapbox.ShapeSource id="route2" shape={{ type: 'Feature', properties: {}, geometry: secondaryRoute }}>
          <Mapbox.LineLayer
            id="routeLine2"
            style={{ lineColor: '#555555', lineWidth: 4, lineDasharray: [2, 2], lineCap: 'round' }}
          />
        </Mapbox.ShapeSource>
      )}
      {driverLocation && (
        <Mapbox.PointAnnotation id="liveDriver" coordinate={driverLocation}>
          <View style={styles.carPin} />
        </Mapbox.PointAnnotation>
      )}
    </Mapbox.MapView>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#11201a', padding: 24, gap: 8,
  },
  phTitle: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  phText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', lineHeight: 18, fontFamily: 'Poppins_400Regular' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
  userPuck: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#000',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 5,
  },
  carPin: {
    width: 16, height: 16, borderRadius: 4, backgroundColor: Colors.primary,
    borderWidth: 2, borderColor: '#fff', transform: [{ rotate: '45deg' }],
  },
  flagPin: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary, borderWidth: 2.5, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
  },
});

export default RouteMap;
