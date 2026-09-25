import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Linking,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  DollarSign,
  Search,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Undo2,
  RotateCcw,
  Flag,
  Navigation2,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { Avatar, Button, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap, { useRideMapPadding } from '../../components/RouteMap';
import type { LngLat } from '../../components/RouteMap';
import type { RideStatusDb } from '../../types/db';
import {
  getNavigationRoute,
  isCoordinateWithinServiceArea,
  locateOnRoute,
  nextManeuver,
  placeLabel,
  prepareNavigation,
  resolvePlace,
  searchPlaces,
  type NavigationLine,
  type PlaceSuggestion,
  type RouteStep,
} from '../../services/geo';
import { getServiceArea, serviceAreaLabel } from '../../services/serviceArea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatModal from '../../components/ChatModal';
import {
  getRide,
  getRideCounterpart,
  updateRideStatus,
  updateRideDestination,
  cancelRide,
  type RideCounterpart,
} from '../../services/rides';
import { subscribeMessages, currentUserId } from '../../services/chat';
import RouteChangeLog from '../../components/RouteChangeLog';
import { friendlyError } from '../../lib/errors';

// ── Geo helpers ───────────────────────────────────────────────────────────────

function haversineM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "80 m", "1,2 km" */
function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Arrow drawn in the turn-by-turn banner for a Mapbox maneuver. */
function maneuverIcon(step: RouteStep) {
  const m = step.modifier ?? '';
  if (step.type === 'arrive') return Flag;
  if (step.type.includes('roundabout') || step.type.includes('rotary')) return RotateCcw;
  if (m === 'uturn') return Undo2;
  if (m === 'slight left') return ArrowUpLeft;
  if (m === 'slight right') return ArrowUpRight;
  if (m.includes('left')) return CornerUpLeft;
  if (m.includes('right')) return CornerUpRight;
  return ArrowUp;
}

const fmtMoney = (v?: number | null) =>
  v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteGeometry = { type: 'LineString'; coordinates: LngLat[] };
type DriverRideStatus = 'to_passenger' | 'passenger_pickup' | 'in_ride' | 'completed';

/** Street route being followed, with its maneuvers. */
type NavRoute = {
  nav: NavigationLine;
  /** Metres of this leg already driven when the route was fetched. */
  baseM: number;
};

// A newer route replaces the current one mid-leg (every 80 m to the pickup, a
// reroute, a new destination). Carry what was already driven so the progress
// bar keeps going instead of starting over.
function followOn(prev: NavRoute | null, nav: NavigationLine, from: LngLat): NavRoute {
  const driven = prev ? prev.baseM + (locateOnRoute(prev.nav, from)?.alongM ?? 0) : 0;
  return { nav, baseM: driven };
}

// A ride reopened after an app restart resumes at the step saved in the database.
const STEP_BY_RIDE_STATUS: Partial<Record<RideStatusDb, DriverRideStatus>> = {
  driver_arrived: 'passenger_pickup',
  in_progress: 'in_ride',
};
const STEP_ORDER: DriverRideStatus[] = ['to_passenger', 'passenger_pickup', 'in_ride', 'completed'];

const APPROACH_RETRY_MS = 8_000;

// A tap meant for Aceitar, or for this button before its label changed, must
// not count for the next step: the button ignores presses for a moment after
// it appears and after every step.
const ARM_DELAY_MS = 1_500;
// Past these distances the step is probably a mistake: ask before saving it.
const ARRIVE_CONFIRM_M = 250;
const FINISH_CONFIRM_M = 500;

// Off the route by more than this on 2 fixes in a row asks for a new one, at
// most every 15 s. Fixes less precise than 50 m don't count either way.
const OFF_ROUTE_M = 60;
const OFF_ROUTE_FIXES = 2;
const REROUTE_MIN_MS = 15_000;
const OFF_ROUTE_MAX_ACCURACY_M = 50;

// Turn-by-turn banner, under the status pill.
const NAV_BANNER_TOP = 72;
const NAV_BANNER_HEIGHT = 68;

interface DriverActiveRideProps {
  onCompleted: () => void;
  onCancel: () => void;
  onPanic: () => void;
  origin?: LngLat;
  destination?: LngLat;
  rideId?: string;
  originAddress?: string;
  destinationAddress?: string;
  paymentMethod?: 'pix' | 'cash' | 'card' | 'boleto' | 'mercadopago';
  /** Current fare of the ride, shown during the whole ride. */
  price?: number | null;
  /** Ride status in the database, kept fresh by the navigator. */
  rideStatus?: RideStatusDb;
  onDestinationChanged?: (
    destination: LngLat,
    address: string,
    pricing?: { price: number | null; distanceKm: number | null; durationMin: number | null },
  ) => void;
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'PIX direto na sua chave',
  cash: 'Dinheiro (receba na corrida)',
  card: 'Cartão',
  boleto: 'Pagamento indisponível',
  mercadopago: 'Mercado Pago (repasse automático)',
};

const CANCEL_REASONS = [
  'Passageiro não foi encontrado',
  'Passageiro desistiu da corrida',
  'Problema no veículo',
  'Rota perigosa ou insegura',
  'Comportamento inadequado do passageiro',
  'Outro motivo',
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

const DriverActiveRideScreen: React.FC<DriverActiveRideProps> = ({
  onCompleted,
  onCancel,
  onPanic,
  origin,
  destination,
  rideId,
  originAddress,
  destinationAddress,
  paymentMethod,
  price,
  rideStatus,
  onDestinationChanged,
}) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<DriverRideStatus>(
    () => (rideStatus && STEP_BY_RIDE_STATUS[rideStatus]) || 'to_passenger',
  );
  const [tripRoute, setTripRoute] = useState<NavRoute | null>(null);
  const [approachRoute, setApproachRoute] = useState<NavRoute | null>(null);
  // Bumped when the driver leaves the trip route, to fetch a new one.
  const [tripReroute, setTripReroute] = useState(0);
  // False while the main button ignores presses (ARM_DELAY_MS).
  const [armed, setArmed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [counterpart, setCounterpart] = useState<RideCounterpart | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [currentDestination, setCurrentDestination] = useState<LngLat | undefined>(destination);
  const [currentDestinationAddress, setCurrentDestinationAddress] = useState(destinationAddress);
  // Saved fare returned when the ride is completed, shown to settle the payment.
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [approachRetry, setApproachRetry] = useState(0);

  // Driver live position
  const [driverPos, setDriverPos] = useState<LngLat | null>(null);
  const [driverSpeedMs, setDriverSpeedMs] = useState(0);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDescription, setCancelDescription] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Destination editor
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);
  const [routeQuery, setRouteQuery] = useState('');
  const [routeSuggestions, setRouteSuggestions] = useState<PlaceSuggestion[]>([]);
  const [routeSearching, setRouteSearching] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);
  // Bumped after a successful change so the log reloads with the new entry.
  const [routeChangeKey, setRouteChangeKey] = useState(0);

  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const meRef = useRef<string | null>(null);
  const approachRef = useRef<{ req: number; from: LngLat | null; retryAt: number; timer?: ReturnType<typeof setTimeout> }>(
    { req: 0, from: null, retryAt: 0 },
  );
  // Last route of each leg, kept while a new one loads so its progress carries on.
  const approachLegRef = useRef<NavRoute | null>(null);
  const tripLegRef = useRef<NavRoute | null>(null);
  // Where the trip route in use was requested from, and for which destination.
  const tripFromRef = useRef<{ from: LngLat | null; dest: string }>({ from: null, dest: '' });
  const offRouteRef = useRef({ fixes: 0, at: 0 });
  const driverPosRef = useRef<LngLat | null>(null);
  const driverAccuracyRef = useRef<number | null>(null);
  // Ref guards: state read by a press can be one render old.
  const busyRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const armedAtRef = useRef(0);
  const finishedRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  // Shows the fare, then moves on to the rating. Runs once, whether the
  // completion came from the button or from the saved ride.
  const finish = useCallback((fare: number | null) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinalPrice(fare);
    setStatus('completed');
    finishTimerRef.current = setTimeout(() => onCompletedRef.current(), 3000);
  }, []);

  useEffect(() => () => clearTimeout(finishTimerRef.current), []);

  // Layout effect: set before the new label is on screen, so no press can get
  // between the step change and the delay.
  useLayoutEffect(() => {
    armedAtRef.current = Date.now() + ARM_DELAY_MS;
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // The navigator follows the saved ride (realtime and polling). Move forward
  // to its step, never back, so a lost answer can't leave the driver stuck.
  useEffect(() => {
    if (rideStatus === 'completed') { finish(price ?? null); return; }
    const step = rideStatus && STEP_BY_RIDE_STATUS[rideStatus];
    if (step) setStatus((cur) => (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(cur) ? step : cur));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideStatus]);

  // The navigator receives realtime updates too. Keep the local map/card in
  // sync when the ride row changes outside this screen.
  useEffect(() => {
    setCurrentDestination(destination);
    setCurrentDestinationAddress(destinationAddress);
  }, [destination?.[0], destination?.[1], destinationAddress]);

  // ── Fetch trip route (car → destination) only after pickup ───────────────────
  useEffect(() => {
    // Don't show or request the passenger's trip route until they are aboard.
    // Before pickup the driver's only route is their live position → pickup.
    if (status !== 'in_ride' || !origin || !currentDestination) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const dest = `${currentDestination[0]},${currentDestination[1]}`;
    // A route to the previous destination would contradict the moved flag. A
    // reroute keeps the current line until the new one arrives.
    if (tripFromRef.current.dest !== dest) setTripRoute(null);
    const load = (attempt: number) => {
      // From the car when its position is known, so the first turn is the
      // driver's next one; from the pickup otherwise.
      const from = driverPosRef.current ?? origin;
      getNavigationRoute(from, currentDestination)
        .then((r) => {
          if (!active) return;
          if (!r) throw new Error('route unavailable');
          const next = followOn(tripLegRef.current, prepareNavigation(r.geometry.coordinates, r.steps), from);
          tripLegRef.current = next;
          tripFromRef.current = { from, dest };
          offRouteRef.current.fixes = 0;
          setTripRoute(next);
        })
        .catch(() => {
          // Offline or timed out: try again after 3 s, 6 s, 12 s… up to 30 s.
          if (active) retry = setTimeout(() => load(attempt + 1), Math.min(30_000, 3_000 * 2 ** attempt));
        });
    };
    load(0);
    return () => { active = false; clearTimeout(retry); };
  }, [status, origin?.[0], origin?.[1], currentDestination?.[0], currentDestination?.[1], tripReroute]);

  // ── Off the trip route: new route from where the car is ─────────────────────
  // The route to the pickup already follows the car (a new one every 80 m).
  useEffect(() => {
    if (status !== 'in_ride' || !driverPos || !tripRoute) return;
    const accuracy = driverAccuracyRef.current;
    if (accuracy != null && accuracy > OFF_ROUTE_MAX_ACCURACY_M) return;
    const s = offRouteRef.current;
    const pos = locateOnRoute(tripRoute.nav, driverPos);
    if (!pos || pos.offM <= OFF_ROUTE_M) { s.fixes = 0; return; }
    s.fixes += 1;
    if (s.fixes < OFF_ROUTE_FIXES || Date.now() - s.at < REROUTE_MIN_MS) return;
    // A car parked away from the street would get the same route again and
    // again: only one that moved since the last request gets a new one.
    const from = tripFromRef.current.from;
    if (from && haversineM(from, driverPos) < OFF_ROUTE_M) return;
    s.fixes = 0;
    s.at = Date.now();
    setTripReroute((n) => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPos]);

  // ── Fetch approach route (driver → pickup) when heading to passenger ─────────
  // Re-fetch only when driver moves > 80m to avoid hammering the API. A newer
  // GPS fix must not discard the request in flight; only a newer request does.
  useEffect(() => {
    if (status !== 'to_passenger' || !driverPos || !origin) return;
    const s = approachRef.current;
    if (s.from ? haversineM(s.from, driverPos) < 80 : Date.now() < s.retryAt) return;
    const from = driverPos;
    s.from = from;
    const req = ++s.req;
    const failed = () => {
      if (req !== approachRef.current.req) return;
      // Offline or timed out: retry soon, even if the car is standing still.
      approachRef.current.from = null;
      approachRef.current.retryAt = Date.now() + APPROACH_RETRY_MS;
      approachRef.current.timer = setTimeout(() => {
        approachRef.current.retryAt = 0;
        setApproachRetry((n) => n + 1);
      }, APPROACH_RETRY_MS);
    };
    getNavigationRoute(from, origin)
      .then((r) => {
        if (req !== approachRef.current.req) return;
        if (!r) return failed();
        const next = followOn(approachLegRef.current, prepareNavigation(r.geometry.coordinates, r.steps), from);
        approachLegRef.current = next;
        setApproachRoute(next);
      })
      .catch(failed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPos, status, origin?.[0], origin?.[1], approachRetry]);

  useEffect(() => () => {
    approachRef.current.req++;
    clearTimeout(approachRef.current.timer);
  }, []);

  // ── Live GPS watch ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (cancelled || perm !== 'granted') return;
      const next = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 3000 },
        (pos) => {
          const here: LngLat = [pos.coords.longitude, pos.coords.latitude];
          driverPosRef.current = here;
          driverAccuracyRef.current = pos.coords.accuracy;
          setDriverPos(here);
          setDriverSpeedMs(Math.max(0, pos.coords.speed ?? 0));
        },
      );
      // The screen may have closed while the watch was starting.
      if (cancelled) next.remove();
      else sub = next;
    })().catch(() => {});
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  // ── Ride counterpart & chat ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    getRideCounterpart(rideId)
      .then((c) => { if (active && c) setCounterpart(c); })
      .catch(() => {});
    return () => { active = false; };
  }, [rideId]);

  // Autocomplete inside the configured operational area with debounce. The
  // shared geo service uses Mapbox Search Box suggestions for local POIs.
  useEffect(() => {
    if (!routeEditorOpen || routeQuery.trim().length < 2) {
      setRouteSuggestions([]);
      setRouteSearching(false);
      return;
    }
    let cancelled = false;
    setRouteSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(routeQuery, driverPos ?? origin)
        .then((places) => { if (!cancelled) setRouteSuggestions(places); })
        .catch(() => { if (!cancelled) setRouteSuggestions([]); })
        .finally(() => { if (!cancelled) setRouteSearching(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [routeEditorOpen, routeQuery, driverPos?.[0], driverPos?.[1], origin?.[0], origin?.[1]]);

  useEffect(() => { currentUserId().then((id) => { meRef.current = id; }); }, []);
  useEffect(() => {
    if (!rideId) return;
    return subscribeMessages(rideId, (m) => {
      if (m.sender_id !== meRef.current && !chatOpenRef.current) setUnread((c) => c + 1);
    }, 'unread');
  }, [rideId]);

  // ── Computed: trimmed route + progress + ETA + next maneuver ─────────────────
  const { activeRoute, approachLine, progress, etaText, maneuver } = useMemo(() => {
    // To the pickup: the street route from the car. In ride: the trip route.
    const leg = status === 'to_passenger' ? approachRoute : status === 'in_ride' ? tripRoute : null;
    const show = (line: RouteGeometry | null) => (status === 'in_ride'
      ? { activeRoute: line, approachLine: null }
      : { activeRoute: null, approachLine: line });
    if (!leg) return { ...show(null), progress: 0, etaText: null, maneuver: null };
    const full: RouteGeometry = { type: 'LineString', coordinates: leg.nav.coordinates };
    const pos = driverPos ? locateOnRoute(leg.nav, driverPos) : null;
    if (!pos) return { ...show(full), progress: 0, etaText: null, maneuver: null };

    // The line starts where the car is on it; the part behind is gone.
    const trimmed: RouteGeometry = {
      type: 'LineString',
      coordinates: [pos.point, ...leg.nav.coordinates.slice(pos.index + 1)],
    };
    const remaining = Math.max(0, leg.nav.lengthM - pos.alongM);
    // Everything driven on this leg over everything the leg takes, so a newer
    // route (every 80 m, reroute, new destination) doesn't reset the bar.
    const total = leg.baseM + leg.nav.lengthM || 1;
    const spd = driverSpeedMs > 0.5 ? driverSpeedMs : 8.33; // fallback 30 km/h
    const eta = Math.max(1, Math.ceil(remaining / spd / 60));
    return {
      ...show(trimmed),
      progress: Math.min(1, Math.max(0, (leg.baseM + pos.alongM) / total)),
      etaText: `~${eta} min ${status === 'in_ride' ? 'para o destino' : 'para o passageiro'}`,
      maneuver: nextManeuver(leg.nav, pos.alongM),
    };
  }, [status, tripRoute, approachRoute, driverPos, driverSpeedMs]);

  // The banner needs a route with maneuvers and the car's place on it.
  const showNav = !!maneuver && (status === 'to_passenger' || status === 'in_ride');
  // The status pill ends 66 px below the status bar, the turn banner under it
  // at NAV_BANNER_TOP + NAV_BANNER_HEIGHT.
  const { mapPadding, onSheetLayout } = useRideMapPadding(showNav ? NAV_BANNER_TOP + NAV_BANNER_HEIGHT : 66);

  // Until the street route arrives, a dashed straight line links the car to the pickup.
  const pickupLine: RouteGeometry | null = status === 'to_passenger' && !approachLine && driverPos && origin
    ? { type: 'LineString', coordinates: [driverPos, origin] }
    : null;

  // ── Advance status ───────────────────────────────────────────────────────────
  const callPassenger = () => {
    const d = (counterpart?.phone ?? '').replace(/\D/g, '');
    if (d) Linking.openURL(`tel:${d}`);
    else Alert.alert('Indisponível', 'Telefone do passageiro não disponível.');
  };

  // Forward only: the saved ride may have moved on while the call was out.
  const moveTo = (step: DriverRideStatus) => {
    // Covers the moment between the answer and the new label on screen.
    armedAtRef.current = Date.now() + ARM_DELAY_MS;
    setStatus((cur) => (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(cur) ? step : cur));
  };

  // Saves the step after `from`. A press made for an older step does nothing.
  const advance = async (from: DriverRideStatus) => {
    if (busyRef.current || statusRef.current !== from) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (from === 'to_passenger') {
        if (rideId) await updateRideStatus(rideId, 'driver_arrived');
        moveTo('passenger_pickup');
      } else if (from === 'passenger_pickup') {
        if (rideId) await updateRideStatus(rideId, 'in_progress');
        moveTo('in_ride');
      } else if (from === 'in_ride') {
        const done = rideId ? await updateRideStatus(rideId, 'completed') : null;
        finish(done?.price ?? price ?? null);
      }
    } catch (e: any) {
      // With a weak signal the server can save the step while the answer never
      // arrives. Check the saved ride before reporting an error.
      const saved = rideId ? await getRide(rideId).catch(() => null) : null;
      const step = saved && (saved.status === 'completed' ? 'completed' : STEP_BY_RIDE_STATUS[saved.status]);
      if (step === 'completed') finish(saved?.price ?? price ?? null);
      else if (step && STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(from)) moveTo(step);
      else Alert.alert('Erro ao atualizar corrida', friendlyError(e?.message));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Far from where the step happens: probably a slip, ask first.
  const confirmStep = (from: DriverRideStatus, title: string, message: string, confirmLabel: string) => {
    // A double tap would open the question twice before the first one shows.
    armedAtRef.current = Math.max(armedAtRef.current, Date.now() + 1_000);
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: confirmLabel, onPress: () => { void advance(from); } },
    ]);
  };

  const goNext = () => {
    if (busyRef.current || Date.now() < armedAtRef.current) return;
    const from = statusRef.current;
    // Without a GPS fix there's nothing to compare: the driver decides.
    const here = driverPosRef.current;
    if (here && from === 'to_passenger' && origin) {
      const d = haversineM(here, origin);
      if (d > ARRIVE_CONFIRM_M) {
        confirmStep(from, 'Confirmar chegada', `Você está a ${fmtDistance(d)} do local de embarque. Já chegou ao passageiro?`, 'Confirmar chegada');
        return;
      }
    }
    if (here && from === 'passenger_pickup' && origin) {
      const d = haversineM(here, origin);
      if (d > ARRIVE_CONFIRM_M) {
        confirmStep(from, 'Iniciar corrida', `Você está a ${fmtDistance(d)} do local de embarque. O passageiro já está no carro?`, 'Iniciar corrida');
        return;
      }
    }
    if (here && from === 'in_ride' && currentDestination) {
      const d = haversineM(here, currentDestination);
      if (d > FINISH_CONFIRM_M) {
        confirmStep(from, 'Finalizar corrida', `Você está a ${fmtDistance(d)} do destino. Finalizar a corrida mesmo assim?`, 'Finalizar corrida');
        return;
      }
    }
    void advance(from);
  };

  // ── External navigation app ──────────────────────────────────────────────────
  // No canOpenURL (it needs the schemes declared in the app config): try each
  // link and fall to the next when the app isn't installed.
  const openNavigationApp = () => {
    const target = status === 'in_ride' ? currentDestination : origin;
    if (!target) return;
    const ll = `${target[1]},${target[0]}`;
    const web = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
    const open = async (urls: string[]) => {
      for (const url of urls) {
        try {
          await Linking.openURL(url);
          return;
        } catch { /* not installed: next link */ }
      }
      Alert.alert('Não foi possível abrir', 'Nenhum app de navegação respondeu. Siga a rota pelo mapa.');
    };
    const google = Platform.OS === 'ios'
      ? [`comgooglemaps://?daddr=${ll}&directionsmode=driving`, web]
      : [`google.navigation:q=${ll}&mode=d`, web];
    // Android shows at most 3 buttons: Apple Maps only exists on iOS anyway.
    Alert.alert(
      status === 'in_ride' ? 'Navegar até o destino' : 'Navegar até o embarque',
      'Volte ao app sempre que puder: com ele aberto, o passageiro vê sua posição atualizada.',
      [
        { text: 'Waze', onPress: () => { void open([`https://waze.com/ul?ll=${ll}&navigate=yes`]); } },
        { text: 'Google Maps', onPress: () => { void open(google); } },
        ...(Platform.OS === 'ios'
          ? [{ text: 'Apple Maps', onPress: () => { void open([`http://maps.apple.com/?daddr=${ll}&dirflg=d`]); } }]
          : []),
        { text: 'Cancelar', style: 'cancel' as const },
      ],
    );
  };

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const openCancel = () => {
    setCancelReason('');
    setCancelDescription('');
    setCancelOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason || !cancelDescription.trim()) return;
    setCancelling(true);
    try {
      const fullReason = `[${cancelReason}] ${cancelDescription.trim()}`;
      if (rideId) await cancelRide(rideId, fullReason);
      setCancelOpen(false);
      onCancel();
    } catch (e: any) {
      Alert.alert('Erro ao cancelar', friendlyError(e?.message));
    } finally {
      setCancelling(false);
    }
  };

  // The saved fare wins once the ride is completed.
  const fare = finalPrice ?? price ?? null;

  // ── Status config ────────────────────────────────────────────────────────────
  const statusConfig: Record<DriverRideStatus, { label: string; sub: string; color: string; nextLabel: string }> = {
    to_passenger: {
      label: 'A caminho do passageiro',
      sub: etaText ?? (originAddress ?? 'Calculando rota...'),
      color: Colors.info,
      nextLabel: 'Cheguei ao passageiro',
    },
    passenger_pickup: {
      label: 'Aguardando embarque',
      sub: 'Passageiro está sendo notificado',
      color: Colors.warning,
      nextLabel: 'Iniciar corrida',
    },
    in_ride: {
      label: 'Em corrida',
      sub: etaText ?? (currentDestinationAddress ? `Destino: ${currentDestinationAddress}` : 'Calculando...'),
      color: Colors.success,
      nextLabel: 'Finalizar corrida',
    },
    completed: {
      label: 'Corrida finalizada!',
      sub: fare != null ? `Valor da corrida: ${fmtMoney(fare)}` : 'Aguardando avaliação do passageiro',
      color: Colors.success,
      nextLabel: '',
    },
  };

  const config = statusConfig[status];
  const canCancel = status !== 'completed';
  const canConfirm = !!cancelReason && cancelDescription.trim().length > 0;
  const progressPct = Math.round(progress * 100);
  const canChangeRoute = status === 'passenger_pickup' || status === 'in_ride';
  const canNavigate = (status === 'to_passenger' && !!origin) || (status === 'in_ride' && !!currentDestination);
  const ManeuverIcon = maneuver ? maneuverIcon(maneuver.step) : ArrowUp;

  const openRouteEditor = () => {
    setRouteQuery('');
    setRouteSuggestions([]);
    setRouteEditorOpen(true);
  };

  const selectNewDestination = async (suggestion: PlaceSuggestion) => {
    if (!rideId || routeSaving) return;
    setRouteSaving(true);
    try {
      // Autocomplete rows carry no coordinates until retrieved.
      const place = await resolvePlace(suggestion);
      if (!place) {
        Alert.alert('Endereço não encontrado', 'Não conseguimos localizar esse lugar. Tente buscar pelo nome ou endereço completo.');
        return;
      }
      const nextPoint: LngLat = [place.lng, place.lat];
      const area = await getServiceArea();
      if (!(await isCoordinateWithinServiceArea(nextPoint, area))) {
        Alert.alert('Fora da área de atendimento', `O novo destino precisa estar dentro da área atendida: ${serviceAreaLabel(area)}.`);
        return;
      }
      const nextAddress = placeLabel(place) || placeLabel(suggestion);
      const updated = await updateRideDestination(rideId, place.lat, place.lng, nextAddress);
      const savedAddress = updated.destination_address || nextAddress;
      setCurrentDestination(nextPoint);
      setCurrentDestinationAddress(savedAddress);
      onDestinationChanged?.(nextPoint, savedAddress, {
        price: updated.price,
        distanceKm: updated.distance_km,
        durationMin: updated.duration_min,
      });
      setRouteChangeKey((key) => key + 1);
      setRouteEditorOpen(false);
      setRouteQuery('');
      setRouteSuggestions([]);
      Alert.alert('Rota alterada', `Novo destino: ${savedAddress}\nValor atualizado: R$ ${Number(updated.price ?? 0).toFixed(2).replace('.', ',')}`);
    } catch (e: any) {
      Alert.alert('Não foi possível alterar a rota', friendlyError(e?.message));
    } finally {
      setRouteSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent />

      <RouteMap
        origin={origin}
        destination={status === 'in_ride' ? currentDestination : undefined}
        route={activeRoute}
        approachRoute={approachLine}
        secondaryRoute={pickupLine}
        restrictToSinop
        driverLocation={driverPos ?? undefined}
        followUser
        {...mapPadding}
        style={styles.map}
      />

      {/* Status pill */}
      <View style={[styles.statusPill, { borderColor: config.color + '44', top: insets.top + 8 }]}>
        <View style={[styles.statusDot, { backgroundColor: config.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.statusSub} numberOfLines={1}>{config.sub}</Text>
        </View>
      </View>

      {/* Next turn, measured along the route from the car */}
      {showNav && maneuver && (
        <View style={[styles.navBanner, { top: insets.top + NAV_BANNER_TOP }]} pointerEvents="none">
          <View style={styles.navIcon}>
            <ManeuverIcon size={22} color={Colors.textInverse} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.navDistance} numberOfLines={1}>
              {maneuver.distanceM < 20 ? 'Agora' : `Em ${fmtDistance(maneuver.distanceM)}`}
            </Text>
            <Text style={styles.navInstruction} numberOfLines={2}>
              {maneuver.step.instruction || (maneuver.step.name ? `Siga pela ${maneuver.step.name}` : 'Siga pela rota')}
            </Text>
          </View>
        </View>
      )}

      {/* Bottom sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]} onLayout={onSheetLayout}>
        <View style={styles.handle} />

        {/* Progress bar — visible when route is active */}
        {status !== 'completed' && status !== 'passenger_pickup' && progressPct > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${progressPct}%`,
              backgroundColor: status === 'in_ride' ? Colors.success : Colors.info,
            }]} />
          </View>
        )}

        {/* Passenger info */}
        <View style={styles.passengerRow}>
          <Avatar name={counterpart?.name ?? 'Passageiro'} size={50} />
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>{counterpart?.name ?? 'Passageiro'}</Text>
            <Text style={styles.passengerRating}>
              {(counterpart?.rating ?? 5).toFixed(1)} ★ • Passageiro
            </Text>
          </View>
          <View style={styles.callBtns}>
            <TouchableOpacity style={styles.callBtn} onPress={callPassenger}>
              <Phone size={16} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={() => { setUnread(0); setChatOpen(true); }}>
              <MessageCircle size={16} color={Colors.primary} />
              {unread > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeTxt}>{unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callBtn, styles.panicBtn]} onPress={onPanic}>
              <AlertTriangle size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Route card */}
        <Card style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.routePointAddr} numberOfLines={1}>
              Embarque: {originAddress ?? (origin ? `${origin[1].toFixed(4)}, ${origin[0].toFixed(4)}` : '—')}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.danger }]} />
            <Text style={styles.routePointAddr} numberOfLines={1}>
              Destino: {currentDestinationAddress ?? (currentDestination ? `${currentDestination[1].toFixed(4)}, ${currentDestination[0].toFixed(4)}` : '—')}
            </Text>
          </View>
          {(canChangeRoute || canNavigate) && (
            <View style={styles.routeActions}>
              {canNavigate && (
                <TouchableOpacity style={styles.navigateBtn} onPress={openNavigationApp} activeOpacity={0.8}>
                  <Navigation2 size={15} color={Colors.info} />
                  <Text style={styles.navigateTxt}>Navegar</Text>
                </TouchableOpacity>
              )}
              {canChangeRoute && (
                <TouchableOpacity style={styles.changeRouteBtn} onPress={openRouteEditor} activeOpacity={0.8}>
                  <Navigation size={15} color={Colors.primary} />
                  <Text style={styles.changeRouteTxt}>Alterar a rota</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <RouteChangeLog rideId={rideId ?? null} refreshKey={routeChangeKey} />
          {/* Fare and how the driver gets paid, during the whole ride */}
          {status !== 'completed' && (
            <View style={styles.fareRow}>
              <DollarSign size={14} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fareLabel}>Valor da corrida</Text>
                {paymentMethod && (
                  <Text style={styles.fareSub}>Recebimento: {PAYMENT_LABEL[paymentMethod] ?? paymentMethod}</Text>
                )}
              </View>
              <Text style={styles.fareValue}>{fmtMoney(fare)}</Text>
            </View>
          )}
          {/* ETA row */}
          {etaText && status !== 'passenger_pickup' && status !== 'completed' && (
            <View style={styles.etaRow}>
              <Clock size={12} color={Colors.primary} />
              <Text style={styles.etaTxt}>{etaText}</Text>
              {progressPct > 0 && (
                <Text style={styles.progressTxt}>{progressPct}% concluído</Text>
              )}
            </View>
          )}
        </Card>

        {/* Action buttons */}
        {status !== 'completed' && (
          <View style={styles.actionRow}>
            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={openCancel} activeOpacity={0.8}>
                <X size={16} color={Colors.danger} />
                <Text style={styles.cancelBtnTxt}>Cancelar</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Button
                title={config.nextLabel}
                onPress={goNext}
                loading={busy}
                disabled={busy || !armed}
              />
            </View>
          </View>
        )}

        {status === 'completed' && (
          <View style={styles.completedBox}>
            <CheckCircle size={26} color={Colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.completedText}>Corrida concluída!</Text>
              <Text style={styles.completedFareLabel}>Valor da corrida</Text>
              <Text style={styles.completedFare}>{fmtMoney(fare)}</Text>
              {paymentMethod && (
                <Text style={styles.completedPay}>{PAYMENT_LABEL[paymentMethod] ?? paymentMethod}</Text>
              )}
            </View>
          </View>
        )}
      </View>

      <ChatModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        rideId={rideId}
        title={counterpart?.name ?? 'Passageiro'}
      />

      {/* ── Change destination modal ───────────────────────────────────── */}
      <Modal visible={routeEditorOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setRouteEditorOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrap}
        >
          <View style={styles.modalOverlay} />
          <View style={[styles.routeEditorSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.cancelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelTitle}>Alterar a rota</Text>
                <Text style={styles.routeEditorHint}>Escolha o novo destino do passageiro.</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setRouteEditorOpen(false)} disabled={routeSaving}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.routeInputWrap}>
              <Search size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.routeInput}
                placeholder="Endereço, comércio ou ponto de interesse"
                placeholderTextColor={Colors.textMuted}
                value={routeQuery}
                onChangeText={setRouteQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                editable={!routeSaving}
              />
              {routeSearching && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>

            <ScrollView
              style={styles.routeResults}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {routeSuggestions.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.routeResult}
                  onPress={() => selectNewDestination(place)}
                  disabled={routeSaving}
                  activeOpacity={0.7}
                >
                  <View style={styles.routeResultIcon}>
                    <MapPin size={17} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeResultTitle} numberOfLines={1}>{place.name}</Text>
                    <Text style={styles.routeResultAddress} numberOfLines={2}>{place.address || 'Sinop/MT'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {!routeSearching && routeQuery.trim().length >= 2 && routeSuggestions.length === 0 && (
                <Text style={styles.routeEmpty}>Nenhum lugar encontrado dentro da área de atendimento.</Text>
              )}
              {routeQuery.trim().length < 2 && (
                <Text style={styles.routeEmpty}>Digite o nome do lugar ou o endereço. A busca está limitada à área configurada no painel.</Text>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.dismissBtn, styles.routeEditorCancel]} onPress={() => setRouteEditorOpen(false)} disabled={routeSaving}>
              <Text style={styles.dismissTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Cancel modal ────────────────────────────────────────────────── */}
      <Modal visible={cancelOpen} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrap}
        >
          <View style={styles.modalOverlay} />
          <View style={[styles.cancelSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.cancelHeader}>
              <Text style={styles.cancelTitle}>Cancelar corrida</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setCancelOpen(false)} disabled={cancelling}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.warningBox}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.warningTxt}>
                O cancelamento será registrado e analisado pelo administrador. Cancelamentos frequentes podem afetar seu cadastro.
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <Text style={styles.sectionLabel}>Motivo do cancelamento *</Text>
              {CANCEL_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonItem, cancelReason === r && styles.reasonSelected]}
                  onPress={() => setCancelReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, cancelReason === r && styles.radioFilled]} />
                  <Text style={[styles.reasonTxt, cancelReason === r && styles.reasonTxtSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Descreva o que aconteceu *</Text>
              <TextInput
                style={styles.descInput}
                placeholder="Explique com detalhes o motivo do cancelamento..."
                placeholderTextColor={Colors.textMuted}
                value={cancelDescription}
                onChangeText={setCancelDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.charCount}>{cancelDescription.length}/500</Text>
            </ScrollView>

            <View style={styles.cancelActions}>
              <TouchableOpacity style={styles.dismissBtn} onPress={() => setCancelOpen(false)} disabled={cancelling}>
                <Text style={styles.dismissTxt}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, !canConfirm && styles.confirmCancelDisabled]}
                onPress={handleCancelConfirm}
                disabled={!canConfirm || cancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelTxt}>
                  {cancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { ...StyleSheet.absoluteFillObject },
  statusPill: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card + 'EE', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1, maxWidth: '80%',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusLabel: { ...Typography.smallMedium, fontWeight: '600' },
  statusSub: { ...Typography.caption, color: Colors.textMuted },
  navBanner: {
    position: 'absolute', left: 16, right: 16, height: NAV_BANNER_HEIGHT,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.dark + 'F2', paddingHorizontal: 12, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary + '44',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
  navIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  navDistance: { fontSize: 16, lineHeight: 20, fontFamily: 'Poppins_700Bold', color: '#fff' },
  navInstruction: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_400Regular', color: '#fff' },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },

  // Progress bar
  progressTrack: {
    height: 5, backgroundColor: Colors.borderLight, borderRadius: 3,
    overflow: 'hidden', marginBottom: 12,
  },
  progressFill: { height: 5, borderRadius: 3 },

  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  passengerName: { ...Typography.h5, color: Colors.textPrimary },
  passengerRating: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  callBtns: { flexDirection: 'row', gap: 8 },
  callBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.primary + '33',
  },
  panicBtn: { backgroundColor: Colors.danger + '1A', borderColor: Colors.danger + '55' },
  chatBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  chatBadgeTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#fff' },
  routeCard: { padding: 12, marginBottom: 14 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routePointAddr: { ...Typography.bodyMedium, color: Colors.textPrimary, flex: 1 },
  routeDivider: { width: 2, height: 14, backgroundColor: Colors.border, marginLeft: 4, marginVertical: 4 },
  routeActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  changeRouteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '0D',
  },
  changeRouteTxt: { ...Typography.smallMedium, color: Colors.primary, fontWeight: '700' },
  navigateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.info + '55', backgroundColor: Colors.info + '0D',
  },
  navigateTxt: { ...Typography.smallMedium, color: Colors.info, fontWeight: '700' },
  fareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  fareLabel: { ...Typography.caption, color: Colors.textSecondary },
  fareSub: { ...Typography.caption, color: Colors.textMuted },
  fareValue: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  etaTxt: { ...Typography.caption, color: Colors.primary, flex: 1 },
  progressTxt: { ...Typography.caption, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.danger + '55',
    backgroundColor: Colors.danger + '0E',
  },
  cancelBtnTxt: { ...Typography.smallMedium, color: Colors.danger, fontWeight: '600' },
  completedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, backgroundColor: Colors.success + '22', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  completedText: { ...Typography.bodyMedium, color: Colors.success, fontWeight: '700' },
  completedFareLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: 6 },
  completedFare: { fontSize: 28, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  completedPay: { ...Typography.caption, color: Colors.textSecondary },

  // Cancel modal
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  cancelSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, maxHeight: '85%',
  },
  routeEditorSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, maxHeight: '88%',
  },
  routeEditorHint: { ...Typography.caption, color: Colors.textMuted, marginTop: 3 },
  routeInputWrap: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.primary + '77', borderRadius: Radius.md,
    paddingHorizontal: 14, backgroundColor: Colors.card,
  },
  routeInput: {
    flex: 1, color: Colors.textPrimary, fontFamily: 'Poppins_400Regular', fontSize: 14,
    paddingVertical: 12,
  },
  routeResults: { maxHeight: 360, marginTop: 12, marginBottom: 14 },
  routeResult: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  routeResultIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary + '14',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  routeResultTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '600' },
  routeResultAddress: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  routeEmpty: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24, lineHeight: 19 },
  routeEditorCancel: { flex: 0, width: '100%' },
  cancelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cancelTitle: { ...Typography.h4, color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  warningBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.warning + '18', borderRadius: Radius.md,
    padding: 12, marginBottom: 18, borderWidth: 1, borderColor: Colors.warning + '35',
  },
  warningTxt: { ...Typography.caption, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  sectionLabel: { ...Typography.smallMedium, color: Colors.textSecondary, marginBottom: 10 },
  reasonItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  reasonSelected: { backgroundColor: Colors.danger + '08' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, flexShrink: 0 },
  radioFilled: { borderColor: Colors.danger, backgroundColor: Colors.danger },
  reasonTxt: { ...Typography.bodyMedium, color: Colors.textPrimary, flex: 1 },
  reasonTxtSelected: { color: Colors.danger, fontFamily: 'Poppins_600SemiBold' },
  descInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 100, color: Colors.textPrimary,
    fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 20,
    backgroundColor: Colors.card,
  },
  charCount: { ...Typography.caption, color: Colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 4 },
  cancelActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dismissBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissTxt: { ...Typography.bodyMedium, color: Colors.textSecondary },
  confirmCancelBtn: {
    flex: 2, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  confirmCancelDisabled: { backgroundColor: Colors.textMuted },
  confirmCancelTxt: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
});

export default DriverActiveRideScreen;
