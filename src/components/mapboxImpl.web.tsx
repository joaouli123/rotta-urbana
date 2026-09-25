// Web map over mapbox-gl, with the part of the @rnmapbox/maps API RouteMap
// uses. The web build of @rnmapbox/maps has no line layers and its camera
// ignores bounds, so the web app showed no route and a map zoomed out on
// another continent.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
// @ts-expect-error react-dom ships without types here; only createPortal is used.
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MapCtx = createContext<any>(null);
const SourceCtx = createContext<{ id: string; shape: any } | null>(null);

const flatStyle = (style: any) =>
  Object.assign({}, ...([] as any[]).concat(style).flat(Infinity).filter(Boolean));

function MapView({ style, styleURL, children }: any) {
  const div = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<any>(null);
  useEffect(() => {
    if (!div.current) return;
    const m = new mapboxgl.Map({
      container: div.current,
      style: styleURL || 'mapbox://styles/mapbox/streets-v12',
      center: [-55.5024, -11.8642],
      zoom: 13,
      attributionControl: false,
    });
    let dead = false;
    m.on('load', () => { if (!dead) setMap(m); });
    // The container follows the React Native layout; keep the canvas in step.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.resize()) : null;
    ro?.observe(div.current);
    return () => { dead = true; ro?.disconnect(); m.remove(); };
  }, []);
  return (
    <div style={{ position: 'relative', display: 'flex', flex: 1, overflow: 'hidden', ...flatStyle(style) }}>
      <div ref={div} style={{ position: 'absolute', inset: 0 }} />
      {map && <MapCtx.Provider value={map}>{children}</MapCtx.Provider>}
    </div>
  );
}

const padOf = (p: any) => ({
  top: p?.paddingTop ?? 0, bottom: p?.paddingBottom ?? 0, left: p?.paddingLeft ?? 0, right: p?.paddingRight ?? 0,
});

function Camera(props: any) {
  const map = useContext(MapCtx);
  const {
    bounds, maxBounds, minZoomLevel, maxZoomLevel, centerCoordinate, zoomLevel, heading, pitch,
    padding, defaultSettings, animationDuration = 700,
  } = props;
  const first = useRef(true);
  useEffect(() => {
    if (!map) return;
    map.setMaxBounds(maxBounds ? [maxBounds.sw, maxBounds.ne] : null);
    map.setMinZoom(minZoomLevel ?? 0);
    map.setMaxZoom(maxZoomLevel ?? 22);
  }, [map, JSON.stringify(maxBounds), minZoomLevel, maxZoomLevel]);
  useEffect(() => {
    if (!map) return;
    // No animation on the first frame: the map opens already on the trip.
    const duration = first.current ? 0 : animationDuration;
    first.current = false;
    if (bounds) {
      map.fitBounds([bounds.sw, bounds.ne], { padding: padOf(bounds), maxZoom: maxZoomLevel ?? 22, duration, bearing: 0, pitch: 0 });
    } else if (centerCoordinate) {
      map.easeTo({
        center: centerCoordinate, zoom: zoomLevel ?? map.getZoom(), bearing: heading ?? 0, pitch: pitch ?? 0,
        padding: padOf(padding), duration,
      });
    } else if (defaultSettings?.centerCoordinate) {
      map.jumpTo({ center: defaultSettings.centerCoordinate, zoom: defaultSettings.zoomLevel ?? 13 });
    }
  }, [map, bounds, JSON.stringify(centerCoordinate), zoomLevel, heading, pitch, JSON.stringify(padding)]);
  return null;
}

function PointAnnotation({ coordinate, anchor, children }: any) {
  const map = useContext(MapCtx);
  const [el] = useState(() => document.createElement('div'));
  const marker = useRef<any>(null);
  useEffect(() => {
    const at = anchor && anchor.y === 1 ? 'bottom' : 'center';
    marker.current = new mapboxgl.Marker({ element: el, anchor: at }).setLngLat(coordinate).addTo(map);
    return () => marker.current?.remove();
  }, [map]);
  useEffect(() => { marker.current?.setLngLat(coordinate); }, [coordinate?.[0], coordinate?.[1]]);
  return createPortal(children, el);
}

function ShapeSource({ id, shape, children }: any) {
  const map = useContext(MapCtx);
  useEffect(() => { map.getSource(id)?.setData(shape); }, [map, JSON.stringify(shape)]);
  useEffect(() => () => {
    try {
      map.getStyle()?.layers?.filter((l: any) => l.source === id).forEach((l: any) => map.removeLayer(l.id));
      if (map.getSource(id)) map.removeSource(id);
    } catch { /* map already removed */ }
  }, [map]);
  return <SourceCtx.Provider value={{ id, shape }}>{children}</SourceCtx.Provider>;
}

const PAINT: Record<string, string> = {
  lineColor: 'line-color', lineWidth: 'line-width', lineDasharray: 'line-dasharray', lineOpacity: 'line-opacity',
};
const LAYOUT: Record<string, string> = { lineCap: 'line-cap', lineJoin: 'line-join' };

function LineLayer({ id, style }: any) {
  const map = useContext(MapCtx);
  const src = useContext(SourceCtx)!;
  useEffect(() => {
    if (!map.getSource(src.id)) map.addSource(src.id, { type: 'geojson', data: src.shape });
    const paint: any = {};
    const layout: any = {};
    Object.entries(style || {}).forEach(([k, v]) => {
      if (PAINT[k]) paint[PAINT[k]] = v;
      if (LAYOUT[k]) layout[LAYOUT[k]] = v;
    });
    map.addLayer({ id, type: 'line', source: src.id, paint, layout });
    return () => { try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* map already removed */ } };
  }, [map]);
  return null;
}

// The browser position is drawn by the screens themselves (driver pin).
const UserLocation = () => null;

const Mapbox = {
  setAccessToken: (t: string) => { (mapboxgl as any).accessToken = t; },
  StyleURL: { Street: 'mapbox://styles/mapbox/streets-v12' },
  MapView, Camera, PointAnnotation, ShapeSource, LineLayer, UserLocation,
};
export default Mapbox;
