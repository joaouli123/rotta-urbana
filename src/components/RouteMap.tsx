import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../constants';

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
  paddingTop?: number;
  paddingBottom?: number;
  driverLocation?: LngLat;
  secondaryRoute?: { type: 'LineString'; coordinates: LngLat[] } | null;
  style?: ViewStyle;
}

export const isMapAvailable = () => MAP_READY;

const RouteMap: React.FC<RouteMapProps> = ({ origin, destination, drivers = [], route, followUser, paddingTop, paddingBottom, driverLocation, secondaryRoute, style }) => {
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
  const follow = !!followUser && !origin && !destination && !route;
  const pad = { paddingTop: paddingTop ?? 0, paddingBottom: paddingBottom ?? 0, paddingLeft: 0, paddingRight: 0 };

  // Frame the WHOLE trip when we have a route or both endpoints.
  // Also extend bounds to include the live driver position so the pin stays on screen.
  const basePts: LngLat[] =
    route && route.coordinates.length > 1 ? [...route.coordinates]
      : (origin && destination ? [origin, destination] : []);
  if (driverLocation && basePts.length > 0) basePts.push(driverLocation);
  const framePts: LngLat[] | null = basePts.length > 1 ? basePts : null;
  let bounds: any = null;
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
  }

  // Sinop, MT — used as initial camera position before GPS kicks in.
  const SINOP_COORD: LngLat = [-55.5024, -11.8642];

  return (
    <Mapbox.MapView style={[{ flex: 1 }, style]} styleURL={Mapbox.StyleURL.Street} logoEnabled={false} compassEnabled>
      {bounds ? (
        // key is based on the destination only — it forces a re-mount (hard animation) when
        // the user picks a new destination, but NOT on every driver location poll.
        <Mapbox.Camera
          key={destination ? `${destination[0].toFixed(4)},${destination[1].toFixed(4)}` : 'static'}
          bounds={bounds}
          animationDuration={400}
        />
      ) : follow ? (
        <Mapbox.Camera
          followUserLocation
          followZoomLevel={15}
          defaultSettings={{ centerCoordinate: SINOP_COORD, zoomLevel: 13 }}
          padding={pad}
          animationDuration={700}
        />
      ) : (
        <Mapbox.Camera zoomLevel={15} centerCoordinate={center} padding={pad} animationDuration={700} />
      )}
      {/* Stable location dot (default puck, no spinning heading arrow). */}
      <Mapbox.UserLocation visible androidRenderMode="normal" />

      {origin && (
        <Mapbox.PointAnnotation id="origin" coordinate={origin}>
          <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
        </Mapbox.PointAnnotation>
      )}
      {destination && (
        <Mapbox.PointAnnotation id="destination" coordinate={destination}>
          <View style={[styles.dot, { backgroundColor: Colors.textPrimary }]} />
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
});

export default RouteMap;
