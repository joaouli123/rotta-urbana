import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { Avatar, Button, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap, { useRideMapPadding } from '../../components/RouteMap';
import type { LngLat } from '../../components/RouteMap';
import type { RideStatusDb } from '../../types/db';
import { getRoute, isCoordinateWithinServiceArea, placeLabel, resolvePlace, searchPlaces, type PlaceSuggestion } from '../../services/geo';
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

function polyLen(coords: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineM(coords[i - 1], coords[i]);
  return d;
}

/** Slice route from the point closest to `pos` forward */
function trimPolyline(coords: LngLat[], pos: LngLat): LngLat[] {
  if (coords.length < 2) return coords;
  let minD = Infinity, best = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineM(coords[i], pos);
    if (d < minD) { minD = d; best = i; }
  }
  // keep one point behind so the line doesn't visually jump forward
  return coords.slice(Math.max(0, best - 1));
}

const fmtMoney = (v?: number | null) =>
  v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteGeometry = { type: 'LineString'; coordinates: LngLat[] };
type DriverRideStatus = 'to_passenger' | 'passenger_pickup' | 'in_ride' | 'completed';

// A ride reopened after an app restart resumes at the step saved in the database.
const STEP_BY_RIDE_STATUS: Partial<Record<RideStatusDb, DriverRideStatus>> = {
  driver_arrived: 'passenger_pickup',
  in_progress: 'in_ride',
};
const STEP_ORDER: DriverRideStatus[] = ['to_passenger', 'passenger_pickup', 'in_ride', 'completed'];

const APPROACH_RETRY_MS = 8_000;

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
  // The status pill ends 66 px below the status bar; the SOS button under it
  // takes 64 px of the right edge (16 px margin + 48 px button).
  const { mapPadding, onSheetLayout } = useRideMapPadding(66, 64);
  const [status, setStatus] = useState<DriverRideStatus>(
    () => (rideStatus && STEP_BY_RIDE_STATUS[rideStatus]) || 'to_passenger',
  );
  const [tripRoute, setTripRoute] = useState<RouteGeometry | null>(null);
  const [approachRoute, setApproachRoute] = useState<RouteGeometry | null>(null);
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
  const totalDistRef = useRef(0);          // full trip distance (meters)
  const approachRef = useRef<{ req: number; from: LngLat | null; retryAt: number; timer?: ReturnType<typeof setTimeout> }>(
    { req: 0, from: null, retryAt: 0 },
  );
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

  // ── Fetch trip route (pickup → destination) only after pickup ────────────────
  useEffect(() => {
    // Don't show or request the passenger's trip route until they are aboard.
    // Before pickup the driver's only route is their live position → pickup.
    if (status !== 'in_ride' || !origin || !currentDestination) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // A route to the previous destination would contradict the moved flag.
    setTripRoute(null);
    const load = (attempt: number) => {
      getRoute(origin, currentDestination)
        .then((r) => {
          if (!active) return;
          if (!r) throw new Error('route unavailable');
          setTripRoute(r.geometry as RouteGeometry);
          totalDistRef.current = polyLen(r.geometry.coordinates as LngLat[]);
        })
        .catch(() => {
          // Offline or timed out: try again after 3 s, 6 s, 12 s… up to 30 s.
          if (active) retry = setTimeout(() => load(attempt + 1), Math.min(30_000, 3_000 * 2 ** attempt));
        });
    };
    load(0);
    return () => { active = false; clearTimeout(retry); };
  }, [status, origin?.[0], origin?.[1], currentDestination?.[0], currentDestination?.[1]]);

  // ── Fetch approach route (driver → pickup) when heading to passenger ─────────
  // Re-fetch only when driver moves > 80m to avoid hammering the API. A newer
  // GPS fix must not discard the request in flight; only a newer request does.
  useEffect(() => {
    if (status !== 'to_passenger' || !driverPos || !origin) return;
    const s = approachRef.current;
    if (s.from ? haversineM(s.from, driverPos) < 80 : Date.now() < s.retryAt) return;
    s.from = driverPos;
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
    getRoute(driverPos, origin)
      .then((r) => {
        if (req !== approachRef.current.req) return;
        if (r) setApproachRoute(r.geometry as RouteGeometry);
        else failed();
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
          setDriverPos([pos.coords.longitude, pos.coords.latitude]);
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

  // ── Computed: trimmed route + progress + ETA ─────────────────────────────────
  const { activeRoute, approachLine, progress, etaText } = useMemo(() => {
    // --- approaching passenger: only the street route to the pickup ---
    if (status === 'to_passenger') {
      const base = approachRoute;
      if (!base || !driverPos) return { activeRoute: null, approachLine: base, progress: 0, etaText: null };
      const trimmed: RouteGeometry = { ...base, coordinates: trimPolyline(base.coordinates, driverPos) };
      const remaining = polyLen(trimmed.coordinates);
      const total = polyLen(base.coordinates) || 1;
      const spd = driverSpeedMs > 0.5 ? driverSpeedMs : 8.33; // fallback 30 km/h
      const eta = Math.max(1, Math.ceil(remaining / spd / 60));
      return {
        activeRoute: null,
        approachLine: trimmed,
        progress: Math.min(1, (total - remaining) / total),
        etaText: `~${eta} min para o passageiro`,
      };
    }

    // --- in ride: trim trip route as driver moves ---
    if (status === 'in_ride') {
      const base = tripRoute;
      if (!base || !driverPos) return { activeRoute: base, approachLine: null, progress: 0, etaText: null };
      const trimmed: RouteGeometry = { ...base, coordinates: trimPolyline(base.coordinates, driverPos) };
      const remaining = polyLen(trimmed.coordinates);
      const total = totalDistRef.current || polyLen(base.coordinates) || 1;
      const spd = driverSpeedMs > 0.5 ? driverSpeedMs : 8.33;
      const eta = Math.max(1, Math.ceil(remaining / spd / 60));
      return {
        activeRoute: trimmed,
        approachLine: null,
        progress: Math.min(1, (total - remaining) / total),
        etaText: `~${eta} min para o destino`,
      };
    }

    return { activeRoute: status === 'in_ride' ? tripRoute : null, approachLine: null, progress: 0, etaText: null };
  }, [status, tripRoute, approachRoute, driverPos, driverSpeedMs]);

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

  const goNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (status === 'to_passenger') {
        if (rideId) await updateRideStatus(rideId, 'driver_arrived');
        setStatus('passenger_pickup');
      } else if (status === 'passenger_pickup') {
        if (rideId) await updateRideStatus(rideId, 'in_progress');
        setStatus('in_ride');
      } else if (status === 'in_ride') {
        const done = rideId ? await updateRideStatus(rideId, 'completed') : null;
        finish(done?.price ?? price ?? null);
      }
    } catch (e: any) {
      // With a weak signal the server can save the step while the answer never
      // arrives. Check the saved ride before reporting an error.
      const saved = rideId ? await getRide(rideId).catch(() => null) : null;
      const step = saved && (saved.status === 'completed' ? 'completed' : STEP_BY_RIDE_STATUS[saved.status]);
      if (step === 'completed') finish(saved?.price ?? price ?? null);
      else if (step && STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(status)) setStatus(step);
      else Alert.alert('Erro ao atualizar corrida', friendlyError(e?.message));
    } finally {
      setBusy(false);
    }
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

      {/* Panic button */}
      <TouchableOpacity style={[styles.panicBtn, { top: insets.top + 64 }]} onPress={onPanic}>
        <AlertTriangle size={18} color={Colors.danger} />
      </TouchableOpacity>

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
          {canChangeRoute && (
            <TouchableOpacity style={styles.changeRouteBtn} onPress={openRouteEditor} activeOpacity={0.8}>
              <Navigation size={15} color={Colors.primary} />
              <Text style={styles.changeRouteTxt}>Alterar a rota</Text>
            </TouchableOpacity>
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
                disabled={busy}
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
  panicBtn: {
    position: 'absolute', right: 16,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.danger + '22', borderWidth: 1.5, borderColor: Colors.danger + '66',
    alignItems: 'center', justifyContent: 'center',
  },
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
  changeRouteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 12, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '0D',
  },
  changeRouteTxt: { ...Typography.smallMedium, color: Colors.primary, fontWeight: '700' },
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
