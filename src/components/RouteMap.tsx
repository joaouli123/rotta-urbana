import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // @rnmapbox/maps on the phone, mapbox-gl on the web (mapboxImpl.web.tsx).
  Mapbox = require('./mapboxImpl').default;
  // Rendering an undefined component takes the whole screen down.
  if (Mapbox?.MapView) {
    const Nothing = () => null;
    const parts = ['Camera', 'UserLocation', 'PointAnnotation', 'ShapeSource', 'LineLayer'];
    const missing = parts.filter((p) => !Mapbox[p]);
    if (missing.length) {
      Mapbox = { ...Mapbox, ...Object.fromEntries(missing.map((p) => [p, Nothing])) };
    }
    if (!Mapbox.StyleURL?.Street) Mapbox = { ...Mapbox, StyleURL: { ...Mapbox.StyleURL, Street: 'mapbox://styles/mapbox/streets-v12' } };
  }
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
  /** Room taken by buttons along the right edge of the map. */
  paddingRight?: number;
  driverLocation?: LngLat;
  secondaryRoute?: { type: 'LineString'; coordinates: LngLat[] } | null;
  /** Street route from the driver to the pickup, drawn in blue above the trip route. */
  approachRoute?: { type: 'LineString'; coordinates: LngLat[] } | null;
  /**
   * Navigation view: the camera follows this point up close, turned to the
   * heading, instead of framing the whole trip.
   */
  focus?: { center: LngLat; heading?: number | null } | null;
  /** Changing it frames the whole trip again (after the user moved the map). */
  recenterKey?: number;
  style?: ViewStyle;
}

// Line sources stay mounted with an empty shape while their route is missing,
// so the layers keep the JSX order no matter which route arrives first.
const EMPTY_SHAPE = { type: 'FeatureCollection', features: [] };
const lineShape = (line?: { type: 'LineString'; coordinates: LngLat[] } | null) =>
  line && line.coordinates?.length > 1 ? { type: 'Feature', properties: {}, geometry: line } : EMPTY_SHAPE;

export const isMapAvailable = () => MAP_READY;

/** Driver and passenger home maps frame the service area the same way. */
export const homeMapPadding = (topInset: number, screenHeight: number) => ({
  paddingTop: topInset + 80,
  paddingBottom: Math.round(screenHeight * 0.5),
});

/**
 * Driver and passenger ride maps frame the trip below the buttons at the top and
 * above the bottom sheet. `topControls` is where the top buttons end below the
 * status bar, and `rightControls` the width of the buttons on the right edge.
 * Pass `onSheetLayout` to the sheet so the real height is used.
 */
export function useRideMapPadding(topControls: number, rightControls = 0) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(0);
  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    // Ignore tiny changes: each new padding re-frames the camera.
    setSheetHeight((current) => (Math.abs(current - h) > 4 ? h : current));
  }, []);
  // The destination flag stands 42 px above its point and the map adds a 24 px
  // margin, so 26 px more keeps the whole flag 8 px below the buttons.
  const paddingTop = insets.top + topControls + 26;
  // Keep at least 180 px of map between the paddings to frame the trip in.
  const paddingBottom = Math.min(sheetHeight || 320, Math.max(0, height - paddingTop - 180));
  return { mapPadding: { paddingTop, paddingBottom, paddingRight: rightControls }, onSheetLayout };
}

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

const RouteMap: React.FC<RouteMapProps> = ({ origin, destination, drivers = [], route, followUser, restrictToSinop = false, paddingTop, paddingBottom, paddingRight, driverLocation, secondaryRoute, approachRoute, focus, recenterKey = 0, style }) => {
  const limits = useMapLimits(restrictToSinop);
  // Last frame sent to the camera; see the framing below.
  const frameRef = useRef<{ bbox: number[]; pad: string; bounds: any; key: number } | null>(null);

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
  const pad = { paddingTop: paddingTop ?? 0, paddingBottom: paddingBottom ?? 0, paddingLeft: 0, paddingRight: paddingRight ?? 0 };

  // Frame every line and pin of the trip, plus the live car so it stays on screen.
  const framePts: LngLat[] = [];
  for (const line of [route, approachRoute, secondaryRoute]) {
    if (line && line.coordinates.length > 1) framePts.push(...line.coordinates);
  }
  if (origin) framePts.push(origin);
  if (destination) framePts.push(destination);
  if (driverLocation && framePts.length > 0) framePts.push(driverLocation);
  let bounds: any = null;
  if (framePts.length > 1) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of framePts) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    // At least ~400 m across, so a short trip frames at street level without
    // a zoom cap (a camera maxZoomLevel also stops the user's pinch zoom).
    const MIN_SPAN = 0.004;
    if (maxLng - minLng < MIN_SPAN) { const c = (minLng + maxLng) / 2; minLng = c - MIN_SPAN / 2; maxLng = c + MIN_SPAN / 2; }
    if (maxLat - minLat < MIN_SPAN) { const c = (minLat + maxLat) / 2; minLat = c - MIN_SPAN / 2; maxLat = c + MIN_SPAN / 2; }
    const bbox = [minLng, minLat, maxLng, maxLat];
    const padKey = `${paddingTop ?? 0}:${paddingBottom ?? 0}:${paddingRight ?? 0}`;
    // Routes are trimmed and the car moves every second. A new frame on each
    // fix kept the camera flying around; it only moves when the frame changed
    // by more than 12% of its size (or at least ~50 m).
    const prev = frameRef.current;
    const tolLng = Math.max(0.0005, (maxLng - minLng) * 0.12);
    const tolLat = Math.max(0.0005, (maxLat - minLat) * 0.12);
    const same = !!prev && prev.pad === padKey && prev.key === recenterKey && prev.bbox.every((v, i) =>
      Math.abs(v - bbox[i]) <= (i % 2 === 0 ? tolLng : tolLat));
    if (same) {
      bounds = prev!.bounds;
    } else {
      // Caller padding is authoritative (it already accounts for the bottom sheet).
      // Add only a small margin so the pins aren't glued to the edges.
      bounds = {
        ne: [maxLng, maxLat], sw: [minLng, minLat],
        paddingTop: (paddingTop ?? 0) + 24, paddingBottom: (paddingBottom ?? 0) + 24,
        paddingLeft: 40, paddingRight: (paddingRight ?? 0) + 40,
      };
      frameRef.current = { bbox, pad: padKey, bounds, key: recenterKey };
    }
  } else {
    frameRef.current = null;
  }

  // The admin-configured area replaces the old hardcoded Sinop rectangle.
  // No limit is applied until the shared one is resolved: a provisional
  // rectangle would clamp this map differently from the others.
  const serviceArea = limits?.area ?? DEFAULT_SERVICE_AREA;
  // A single known point (the pickup, a car) is the place to show; the middle
  // of the service area only when there is nothing else.
  const pinned = origin ?? destination ?? driverLocation;
  const mapCenter = pinned ?? (restrictToSinop ? serviceArea.center : center);
  const pinnedZoom = 15.5;
  const maxBounds = limits?.bounds;
  const minZoomLevel = limits?.minZoom;
  const minServiceZoom = minZoomFor(serviceArea);

  return (
    <Mapbox.MapView style={[{ flex: 1 }, style]} styleURL={Mapbox.StyleURL.Street} logoEnabled={false} compassEnabled={false}>
      {focus ? (
        // Up close on the car, turned to where it goes, with the car in the
        // lower part of the free map (like Waze and Google Maps).
        <Mapbox.Camera
          // A new recenterKey remounts it: "Minha posição" snaps back after a pan.
          key={`focus-${recenterKey}`}
          centerCoordinate={focus.center}
          zoomLevel={18}
          heading={focus.heading ?? 0}
          pitch={55}
          padding={{ ...pad, paddingTop: pad.paddingTop + 140 }}
          animationDuration={800}
        />
      ) : bounds ? (
        // A new bounds object animates the camera; the same one leaves it alone.
        // No service-area limit here: a trip point outside it (a driver coming
        // from far) was clamped away and the map showed a random corner.
        <Mapbox.Camera
          key="frame"
          bounds={bounds}
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
        <Mapbox.Camera zoomLevel={pinned ? pinnedZoom : Math.min(15, minServiceZoom + 3.5)} centerCoordinate={mapCenter} maxBounds={maxBounds} minZoomLevel={minZoomLevel} padding={pad} animationDuration={700} />
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
          <View style={styles.destPin}>
            <View style={styles.flagPin}>
              <Flag size={15} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2.4} />
            </View>
            <View style={styles.pinStem} />
          </View>
        </Mapbox.PointAnnotation>
      )}

      {drivers.map((d) => (
        <Mapbox.PointAnnotation key={d.id} id={`drv-${d.id}`} coordinate={[d.lng, d.lat]}>
          <View style={styles.carPin} />
        </Mapbox.PointAnnotation>
      ))}

      <Mapbox.ShapeSource id="route" shape={lineShape(route)}>
        <Mapbox.LineLayer
          id="routeLine"
          style={{ lineColor: '#000000', lineWidth: 6, lineCap: 'round', lineJoin: 'round' }}
        />
      </Mapbox.ShapeSource>

      {/* driver -> pickup along the streets, above the trip route */}
      <Mapbox.ShapeSource id="approach" shape={lineShape(approachRoute)}>
        <Mapbox.LineLayer
          id="approachCasing"
          style={{ lineColor: '#FFFFFF', lineWidth: 10, lineCap: 'round', lineJoin: 'round' }}
        />
        <Mapbox.LineLayer
          id="approachLine"
          style={{ lineColor: Colors.info, lineWidth: 6, lineCap: 'round', lineJoin: 'round' }}
        />
      </Mapbox.ShapeSource>

      {/* driver -> pickup line (the approaching car) */}
      <Mapbox.ShapeSource id="route2" shape={lineShape(secondaryRoute)}>
        <Mapbox.LineLayer
          id="routeLine2"
          style={{ lineColor: '#555555', lineWidth: 4, lineDasharray: [2, 2], lineCap: 'round' }}
        />
      </Mapbox.ShapeSource>
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
  // Red pin, matching the red "Destino" dot of the ride cards. The side padding
  // keeps the shadow inside the bitmap Android draws for the annotation.
  destPin: { alignItems: 'center', paddingHorizontal: 6, paddingTop: 2 },
  flagPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.danger, borderWidth: 2.5, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
  },
  pinStem: { width: 4, height: 9, marginTop: -1, backgroundColor: Colors.danger, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
});

export default RouteMap;
