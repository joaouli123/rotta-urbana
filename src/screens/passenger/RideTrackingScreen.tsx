import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Vibration,
  Animated,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Phone,
  MessageCircle,
  Navigation,
  MapPin,
  AlertTriangle,
  ChevronDown,
  Car,
  X,
  Send,
  Star,
  Flag,
  ChevronRight,
  CheckCircle,
  Clock,
  Shield,
  Search,
  MapPinned,
  Route as RouteIcon,
} from 'lucide-react-native';
import { Avatar, Rating, Card } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import RouteMap, { useRideMapPadding } from '../../components/RouteMap';
import { getRoute, isCoordinateWithinServiceArea, placeLabel, resolvePlace, searchPlaces, type LngLat, type PlaceSuggestion } from '../../services/geo';
import { getServiceArea, serviceAreaLabel } from '../../services/serviceArea';
import { getRideDriverLocation, getRideCounterpart, updateRideDestination, getRideQueueVia, type RideCounterpart } from '../../services/rides';
import { openSupportTicket } from '../../services/profile';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatModal from '../../components/ChatModal';
import RouteChangeLog from '../../components/RouteChangeLog';
import { subscribeMessages, currentUserId } from '../../services/chat';

interface RideTrackingScreenProps {
  onRideCompleted: () => void;
  onCancel: (reason?: string) => Promise<boolean> | void;
  onPanic: () => void;
  origin?: [number, number];
  destination?: [number, number];
  rideId?: string;
  status?: string;
  price?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  destinationAddress?: string;
  onDestinationChanged?: (
    destination: LngLat,
    address: string,
    pricing?: { price: number | null; distanceKm: number | null; durationMin: number | null },
  ) => void;
}

type RideStatus = 'on_way' | 'arrived' | 'in_ride';

const fmtMoney = (v?: number | null) =>
  v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180, lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Share of the route already covered, up to the route point closest to `pos`. */
function routeProgress(coords: [number, number][], pos: [number, number]): number | null {
  if (coords.length < 2) return null;
  let closest = 0, closestKm = Infinity;
  coords.forEach((c, i) => {
    const km = haversineKm(c, pos);
    if (km < closestKm) { closestKm = km; closest = i; }
  });
  let done = 0, total = 0;
  for (let i = 1; i < coords.length; i++) {
    const km = haversineKm(coords[i - 1], coords[i]);
    total += km;
    if (i <= closest) done += km;
  }
  return total > 0 ? done / total : null;
}

const REPORT_REASONS = [
  'Comportamento inadequado',
  'Rota diferente do combinado',
  'Veículo em má condição',
  'Motorista sob efeito de álcool',
  'Assédio ou ameaça',
  'Outro motivo',
];

const CANCEL_REASONS = [
  'Desisti da corrida',
  'Motorista demorou muito',
  'Encontrei outro transporte',
  'Preciso alterar o destino',
  'Outro motivo',
];

const RideTrackingScreen: React.FC<RideTrackingScreenProps> = ({ onRideCompleted, onCancel, onPanic, origin, destination, rideId, status, price, distanceKm, durationMin, destinationAddress, onDestinationChanged }) => {
  const insets = useSafeAreaInsets();
  // The panic button ends 54 px below the status bar (top 8 + 46 px).
  const { mapPadding, onSheetLayout } = useRideMapPadding(54);
  // Bumped by the button that frames the whole trip again.
  const [recenterKey, setRecenterKey] = useState(0);
  const [rideStatus, setRideStatus] = useState<RideStatus>('on_way');
  const [route, setRoute] = useState<{ type: 'LineString'; coordinates: [number, number][] } | null>(null);
  const [driverLoc, setDriverLoc] = useState<[number, number] | null>(null);

  // ── Route recalculation (passenger can redirect the driver mid-ride) ─────
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);
  const [routeQuery, setRouteQuery] = useState('');
  const [routeSuggestions, setRouteSuggestions] = useState<PlaceSuggestion[]>([]);
  const [routeSearching, setRouteSearching] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);
  // Bumped after a successful change so the log reloads with the new entry.
  const [routeChangeKey, setRouteChangeKey] = useState(0);

  const canChangeRoute = rideId && (rideStatus === 'on_way' || rideStatus === 'arrived' || rideStatus === 'in_ride');

  useEffect(() => {
    if (!routeEditorOpen) return;
    const query = routeQuery.trim();
    if (query.length < 2) { setRouteSuggestions([]); setRouteSearching(false); return; }
    let cancelled = false;
    setRouteSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(query, origin)
        .then((places) => { if (!cancelled) setRouteSuggestions(places); })
        .catch(() => { if (!cancelled) setRouteSuggestions([]); })
        .finally(() => { if (!cancelled) setRouteSearching(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [routeQuery, routeEditorOpen, origin?.[0], origin?.[1]]);

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

  // Reflete o status REAL da corrida (controlado pelo motorista) na tela do passageiro.
  useEffect(() => {
    if (!status) return;
    setRideStatus(status === 'driver_arrived' ? 'arrived' : status === 'in_progress' ? 'in_ride' : 'on_way');
  }, [status]);

  // The trip route (pickup → destination) is on the map from the start, so the
  // passenger sees the whole ride and not only a lone pin.
  useEffect(() => {
    if (!origin || !destination) return;
    let active = true;
    getRoute(origin, destination).then((r) => { if (active && r) setRoute(r.geometry); }).catch(() => {});
    return () => { active = false; };
  }, [origin?.[0], origin?.[1], destination?.[0], destination?.[1]]);

  // Localização do motorista ao vivo (poll a cada 4s) + linha até o embarque.
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    const tick = async () => {
      const loc = await getRideDriverLocation(rideId);
      if (active && loc) setDriverLoc([loc.lng, loc.lat]);
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { active = false; clearInterval(iv); };
  }, [rideId]);

  // Driver finishing another ride first (queued trip): where that ride ends.
  // The car goes there, then comes to the pickup.
  const [queueVia, setQueueVia] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!rideId || rideStatus !== 'on_way') { setQueueVia(null); return; }
    let active = true;
    const load = () => getRideQueueVia(rideId).then((v) => {
      if (!active) return;
      setQueueVia((cur) => (cur?.[0] === v?.[0] && cur?.[1] === v?.[1] ? cur : v));
    }).catch(() => {});
    load();
    const iv = setInterval(load, 8000);
    return () => { active = false; clearInterval(iv); };
  }, [rideId, rideStatus]);

  // Street route from the car to the pickup while the driver is coming, asked
  // again only after the car moved ~150 m. With a queued trip it passes
  // through the other ride's drop-off.
  const [approach, setApproach] = useState<{ type: 'LineString'; coordinates: [number, number][] } | null>(null);
  const [approachMin, setApproachMin] = useState<number | null>(null);
  const approachFromRef = useRef<[number, number] | null>(null);
  useEffect(() => { approachFromRef.current = null; }, [queueVia?.[0], queueVia?.[1]]);
  useEffect(() => {
    if (rideStatus !== 'on_way' || !driverLoc || !origin) {
      if (rideStatus !== 'on_way') setApproach(null);
      return;
    }
    const last = approachFromRef.current;
    if (last && Math.abs(last[0] - driverLoc[0]) + Math.abs(last[1] - driverLoc[1]) < 0.0015) return;
    approachFromRef.current = driverLoc;
    let active = true;
    if (queueVia) {
      Promise.all([getRoute(driverLoc, queueVia), getRoute(queueVia, origin)]).then(([a, b]) => {
        if (!active || !a || !b) return;
        setApproach({ type: 'LineString', coordinates: [...a.geometry.coordinates, ...b.geometry.coordinates] });
        setApproachMin(a.durationMin + b.durationMin);
      }).catch(() => {});
    } else {
      getRoute(driverLoc, origin).then((r) => { if (active && r) { setApproach(r.geometry); setApproachMin(r.durationMin); } }).catch(() => {});
    }
    return () => { active = false; };
  }, [rideStatus, driverLoc?.[0], driverLoc?.[1], origin?.[0], origin?.[1], queueVia?.[0], queueVia?.[1]]);

  // Real driver contact (name / phone / vehicle).
  const [counterpart, setCounterpart] = useState<RideCounterpart | null>(null);
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    getRideCounterpart(rideId).then((c) => { if (active && c) setCounterpart(c); }).catch(() => {});
    return () => { active = false; };
  }, [rideId]);

  const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
  const callNow = () => {
    const d = digits(counterpart?.phone);
    if (d) Linking.openURL(`tel:${d}`);
    else Alert.alert('Indisponível', 'Telefone do motorista não disponível.');
  };
  const chatNow = () => {
    const d = digits(counterpart?.phone);
    if (!d) { Alert.alert('Indisponível', 'WhatsApp do motorista não disponível.'); return; }
    const full = d.startsWith('55') ? d : `55${d}`;
    Linking.openURL(`https://wa.me/${full}`);
  };

  const driverName = counterpart?.name ?? 'Motorista';
  const vehicleInfo = counterpart
    ? `${counterpart.vehicleModel ?? ''}${counterpart.vehiclePlate ? ' • ' + counterpart.vehiclePlate : ''}`.trim() || 'Veículo'
    : 'Veículo';
  const [chatOpen, setChatOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDescription, setCancelDescription] = useState('');
  // Only "Outro motivo" needs a written reason; the others already say it.
  const needsCancelDetail = cancelReason === 'Outro motivo';
  const canConfirmCancel = !!cancelReason && (!needsCancelDetail || cancelDescription.trim().length > 0);
  const [cancelling, setCancelling] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const meRef = useRef<string | null>(null);
  useEffect(() => { currentUserId().then((id) => { meRef.current = id; }); }, []);
  useEffect(() => {
    if (!rideId) return;
    return subscribeMessages(rideId, (m) => {
      if (m.sender_id !== meRef.current && !chatOpenRef.current) setUnreadCount((c) => c + 1);
    }, 'unread');
  }, [rideId]);

  // Arrived pulse animation
  const arrivedPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (rideStatus === 'arrived') {
      Vibration.vibrate([0, 100, 80, 200]);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(arrivedPulse, { toValue: 1.06, duration: 600, useNativeDriver: true }),
          Animated.timing(arrivedPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [rideStatus]);

  const openChat = () => {
    setUnreadCount(0);
    setChatOpen(true);
  };

  // Persist the report as a support ticket so the admin can act on it.
  const sendReport = async () => {
    if (!selectedReason || reportSending) return;
    setReportSending(true);
    try {
      const message = `Denúncia durante a corrida.\nMotivo: ${selectedReason}\nMotorista: ${driverName}${rideId ? `\n[Corrida: ${rideId}]` : ''}`;
      await openSupportTicket(`Denúncia: ${selectedReason}`, message);
      setReportSent(true);
      Vibration.vibrate(60);
      setTimeout(() => { setReportOpen(false); setReportSent(false); setSelectedReason(''); }, 1800);
    } catch (e: any) {
      Alert.alert('Erro ao enviar', e?.message ?? 'Não foi possível registrar a denúncia. Tente novamente.');
    } finally {
      setReportSending(false);
    }
  };

  const confirmCancel = async () => {
    if (!canConfirmCancel || cancelling) return;
    setCancelling(true);
    try {
      const detail = cancelDescription.trim();
      const result = await onCancel(detail ? `[${cancelReason}] ${detail}` : cancelReason);
      if (result !== false) {
        setCancelOpen(false);
        setCancelReason('');
        setCancelDescription('');
      }
    } finally {
      setCancelling(false);
    }
  };

  // Live ETA to pickup, computed from the driver's last known position.
  // Road time from the approach route, else straight line at 30 km/h. Anything
  // over an hour means a stale or wrong driver position, so show no number.
  const rawEtaMin = approachMin ?? (driverLoc && origin ? (haversineKm(driverLoc, origin) / 30) * 60 : null);
  const pickupEtaMin = rawEtaMin != null && rawEtaMin <= 60 ? Math.max(1, Math.round(rawEtaMin)) : null;

  // Trip progress and time left, from the driver's last known position.
  const rideProgress = rideStatus === 'in_ride' && route && driverLoc
    ? routeProgress(route.coordinates, driverLoc)
    : null;
  const arrivalMin = durationMin != null && rideProgress != null
    ? Math.max(1, Math.ceil(durationMin * (1 - rideProgress)))
    : durationMin;

  // ── Status config ─────────────────────────────────────────
  const statusConfig = {
    on_way: { label: 'Motorista a caminho', color: Colors.info, eta: '3 min' },
    arrived: { label: 'Motorista chegou!', color: Colors.success, eta: null },
    in_ride: { label: 'Em corrida', color: Colors.primary, eta: null },
  }[rideStatus];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Mapa (Mapbox no dev build; placeholder no Expo Go) com a rota traçada */}
      <RouteMap
        origin={origin}
        destination={destination}
        route={route}
        approachRoute={approach}
        restrictToSinop
        driverLocation={driverLoc ?? undefined}
        recenterKey={recenterKey}
        {...mapPadding}
        style={styles.map}
      />

      {/* Frame the whole trip again after moving the map */}
      <TouchableOpacity
        style={[styles.recenterBtn, { bottom: mapPadding.paddingBottom + 12 }]}
        onPress={() => setRecenterKey((k) => k + 1)}
        activeOpacity={0.85}
        accessibilityLabel="Centralizar a rota"
      >
        <RouteIcon size={20} color={Colors.textPrimary} />
      </TouchableOpacity>

      {/* Panic button */}
      <TouchableOpacity style={[styles.panicBtn, { top: insets.top + 8 }]} onPress={onPanic}>
        <Shield size={18} color={Colors.danger} />
      </TouchableOpacity>

      {/* ── Bottom Sheet ──────────────────────────────────────── */}
      <View style={styles.sheet} onLayout={onSheetLayout}>
        <View style={styles.handle} />

        {/* ── ON WAY state ─────────────────────────── */}
        {rideStatus === 'on_way' && (
          <View>
            {/* ETA strip */}
            <View style={styles.etaBanner}>
              <Clock size={15} color={Colors.info} />
              <Text style={styles.etaBannerTxt}>
                {queueVia
                  ? 'Motorista finalizando outra corrida'
                  : pickupEtaMin ? <>Chegando em <Text style={{ fontFamily: 'Poppins_700Bold', color: Colors.info }}>~{pickupEtaMin} min</Text></> : 'Motorista a caminho'}
              </Text>
            </View>
            {queueVia && (
              <Text style={styles.queueSub}>
                Ele vem até você em seguida{pickupEtaMin ? <> · chega em <Text style={{ fontFamily: 'Poppins_700Bold', color: Colors.info }}>~{pickupEtaMin} min</Text></> : ''}
              </Text>
            )}
            {/* Driver card */}
            <DriverCard
              driverName={driverName}
              vehicleInfo={vehicleInfo}
              rating={counterpart?.rating ?? 5}
              onPressName={() => setProfileOpen(true)}
              onPhone={callNow}
              onChat={openChat}
              unreadCount={unreadCount}
            />
            {/* Trip summary */}
            <TripSummary price={fmtMoney(price)} distance={distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'} duration={durationMin != null ? `~${durationMin} min` : '—'} />
          </View>
        )}

        {/* ── ARRIVED state ────────────────────────── */}
        {rideStatus === 'arrived' && (
          <View>
            <Animated.View style={[styles.arrivedBanner, { transform: [{ scale: arrivedPulse }] }]}>
              <CheckCircle size={22} color={Colors.success} />
              <Text style={styles.arrivedTxt}>Motorista chegou! Entre no veículo.</Text>
            </Animated.View>
            <DriverCard
              driverName={driverName}
              vehicleInfo={vehicleInfo}
              rating={counterpart?.rating ?? 5}
              onPressName={() => setProfileOpen(true)}
              onPhone={callNow}
              onChat={openChat}
              unreadCount={unreadCount}
            />
            <TripSummary price={fmtMoney(price)} distance={distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'} duration={durationMin != null ? `~${durationMin} min` : '—'} />
            <View style={styles.boardHint}>
              <Clock size={14} color={Colors.textMuted} />
              <Text style={styles.boardHintTxt}>Entre no veículo. A corrida inicia quando o motorista confirmar.</Text>
            </View>
          </View>
        )}

        {/* ── IN RIDE state ────────────────────────── */}
        {rideStatus === 'in_ride' && (
          <View>
            <View style={styles.inRideHeader}>
              <LinearGradient colors={[Colors.primary + '22', Colors.primary + '08']} style={styles.inRidePill}>
                <Car size={15} color={Colors.primaryDark} />
                <Text style={styles.inRidePillTxt}>Em corrida</Text>
              </LinearGradient>
              <Text style={styles.inRideEta}>{arrivalMin != null ? `Chegada em ~${arrivalMin} min` : 'Em andamento'}</Text>
            </View>
            {/* Progress */}
            <View style={styles.progressRow}>
              <View style={[styles.progressDot, { backgroundColor: Colors.primary }]} />
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((rideProgress ?? 0) * 100)}%` }]} />
              </View>
              <View style={[styles.progressDot, { backgroundColor: Colors.danger }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLbl}>Sua localização</Text>
              <Text style={styles.progressLbl} numberOfLines={1}>{destinationAddress?.split(',')[0] ?? 'Destino'}</Text>
            </View>
            <TripSummary price={fmtMoney(price)} distance={distanceKm != null ? `${distanceKm.toFixed(1)} km` : '—'} duration={durationMin != null ? `~${durationMin} min` : '—'} />
            <View style={styles.inRideActions}>
              <TouchableOpacity style={styles.inRideBtn} onPress={openChat} activeOpacity={0.8}>
                <MessageCircle size={15} color={Colors.primary} strokeWidth={2.5} />
                <Text style={styles.inRideBtnTxt}>Chat</Text>
                {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{unreadCount}</Text></View>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.inRideBtn, styles.inRideBtnDanger]} onPress={() => setReportOpen(true)} activeOpacity={0.8}>
                <Flag size={15} color={Colors.danger} strokeWidth={2.5} />
                <Text style={[styles.inRideBtnTxt, { color: Colors.danger }]}>Reportar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {canChangeRoute && (
          <TouchableOpacity style={styles.changeRouteBtn} onPress={openRouteEditor} activeOpacity={0.8}>
            <MapPinned size={15} color={Colors.primary} />
            <Text style={styles.changeRouteTxt}>Alterar destino</Text>
          </TouchableOpacity>
        )}

        <RouteChangeLog rideId={rideId ?? null} refreshKey={routeChangeKey} />

        {rideId && (
          <TouchableOpacity style={styles.cancelRideBtn} onPress={() => setCancelOpen(true)} activeOpacity={0.8}>
            <X size={15} color={Colors.danger} />
            <Text style={styles.cancelRideTxt}>Cancelar corrida</Text>
          </TouchableOpacity>
        )}

      </View>

      {/* ── CHAT (in-app, realtime) ───────────────────────────── */}
      <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} rideId={rideId} title={driverName} />

      {/* ── ROUTE EDITOR MODAL ────────────────────────────────── */}
      <Modal visible={routeEditorOpen} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrap}>
          <View style={styles.modalOverlay} />
          <View style={[styles.routeEditorSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.reportHeader}>
              <View>
                <Text style={styles.reportTitle}>Alterar destino</Text>
                <Text style={styles.routeEditorHint}>Escolha o novo destino da corrida.</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setRouteEditorOpen(false)} disabled={routeSaving}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.routeInputWrap}>
              <Search size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.routeInput}
                placeholder="Buscar novo endereço..."
                placeholderTextColor={Colors.textMuted}
                value={routeQuery}
                onChangeText={setRouteQuery}
                autoFocus
                editable={!routeSaving}
              />
              {routeSearching && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.routeResults}>
              {routeSuggestions.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.routeResult}
                  onPress={() => selectNewDestination(place)}
                  disabled={routeSaving}
                  activeOpacity={0.75}
                >
                  <View style={styles.routeResultIcon}>
                    <MapPin size={16} color={Colors.primary} />
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
              <Text style={styles.dismissTxt}>{routeSaving ? 'Salvando...' : 'Cancelar'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── REPORT MODAL ──────────────────────────────────────── */}
      <Modal visible={cancelOpen} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrap}>
          <View style={styles.modalOverlay} />
          <View style={[styles.cancelSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>Cancelar corrida</Text>
              <TouchableOpacity onPress={() => setCancelOpen(false)} disabled={cancelling} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.cancelWarning}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.cancelWarningTxt}>O cancelamento será registrado no histórico da corrida.</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              <Text style={styles.reportSub}>Por que você quer cancelar?</Text>
              {CANCEL_REASONS.map((reason) => (
                <TouchableOpacity key={reason} style={[styles.reasonItem, cancelReason === reason && styles.reasonSelected]} onPress={() => setCancelReason(reason)}>
                  <View style={[styles.reasonRadio, cancelReason === reason && styles.reasonRadioFilled]} />
                  <Text style={[styles.reasonTxt, cancelReason === reason && { color: Colors.danger, fontFamily: 'Poppins_600SemiBold' }]}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.reportSub, { marginTop: 14 }]}>{needsCancelDetail ? 'Detalhe o motivo *' : 'Detalhes (opcional)'}</Text>
              <TextInput
                style={styles.cancelInput}
                placeholder="Explique brevemente..."
                placeholderTextColor={Colors.textMuted}
                value={cancelDescription}
                onChangeText={setCancelDescription}
                multiline
                maxLength={300}
              />
            </ScrollView>
            <View style={styles.cancelActions}>
              <TouchableOpacity style={styles.dismissCancelBtn} onPress={() => setCancelOpen(false)} disabled={cancelling}>
                <Text style={styles.dismissCancelTxt}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, (!canConfirmCancel || cancelling) && styles.confirmCancelDisabled]}
                onPress={confirmCancel}
                disabled={!canConfirmCancel || cancelling}
              >
                <Text style={styles.confirmCancelTxt}>{cancelling ? 'Cancelando...' : 'Confirmar cancelamento'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={reportOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.reportSheet}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>Reportar problema</Text>
              <TouchableOpacity onPress={() => { setReportOpen(false); setSelectedReason(''); setReportSent(false); }} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {!reportSent ? (
              <>
                <Text style={styles.reportSub}>Selecione o motivo da denúncia:</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {REPORT_REASONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.reasonItem, selectedReason === r && styles.reasonSelected]}
                      onPress={() => setSelectedReason(r)}
                    >
                      <View style={[styles.reasonRadio, selectedReason === r && styles.reasonRadioFilled]} />
                      <Text style={[styles.reasonTxt, selectedReason === r && { color: Colors.danger, fontFamily: 'Poppins_600SemiBold' }]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.reportSubmitBtn, { opacity: selectedReason && !reportSending ? 1 : 0.45 }]}
                  onPress={sendReport}
                  disabled={!selectedReason || reportSending}
                  activeOpacity={0.8}
                >
                  <Flag size={16} color="#FFF" />
                  <Text style={styles.reportSubmitTxt}>{reportSending ? 'Enviando...' : 'Enviar denúncia'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.reportSuccess}>
                <CheckCircle size={48} color={Colors.success} />
                <Text style={styles.reportSuccessTxt}>Denúncia enviada!</Text>
                <Text style={styles.reportSuccessSub}>O administrador irá analisar e resolver o seu caso.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── DRIVER PROFILE MODAL ──────────────────────────────── */}
      <Modal visible={profileOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileSheet}>
            <View style={styles.profileHeader}>
              <Text style={styles.profileTitle}>Perfil do motorista</Text>
              <TouchableOpacity onPress={() => setProfileOpen(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Driver info */}
              <View style={styles.profileInfo}>
                <Avatar name={driverName} size={60} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName}>{driverName}</Text>
                  <Text style={styles.profileVehicle}>{vehicleInfo}</Text>
                  <View style={styles.profileStatsRow}>
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatVal}>{(counterpart?.rating ?? 5).toFixed(1)}</Text>
                      <Text style={styles.profileStatLbl}>Nota</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Contact actions */}
              <View style={styles.profileActions}>
                <TouchableOpacity style={styles.profileActionBtn} onPress={callNow} activeOpacity={0.8}>
                  <Phone size={17} color={Colors.textInverse} />
                  <Text style={styles.profileActionTxt}>Ligar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.profileActionBtn, { backgroundColor: Colors.primary }]} onPress={() => { setProfileOpen(false); openChat(); }} activeOpacity={0.8}>
                  <MessageCircle size={17} color={Colors.textInverse} />
                  <Text style={styles.profileActionTxt}>Mensagem</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────
const DriverCard: React.FC<{
  driverName: string;
  vehicleInfo: string;
  rating: number;
  onPressName: () => void;
  onPhone: () => void;
  onChat: () => void;
  unreadCount: number;
}> = ({ driverName, vehicleInfo, rating, onPressName, onPhone, onChat, unreadCount }) => (
  <View style={styles.driverCard}>
    {/* Top row: avatar + name + rating (tappable for profile) */}
    <TouchableOpacity style={styles.driverInfo} onPress={onPressName} activeOpacity={0.75}>
      <Avatar name={driverName} size={48} />
      <View style={{ flex: 1 }}>
        <View style={styles.driverNameRow}>
          <Text style={styles.driverName}>{driverName}</Text>
          <ChevronRight size={14} color={Colors.textMuted} />
        </View>
        <Rating value={rating} />
      </View>
    </TouchableOpacity>
    {/* Bottom row: vehicle info + action buttons aligned together */}
    <View style={styles.driverBottomRow}>
      <Text style={styles.vehicleInfo}>{vehicleInfo}</Text>
      <View style={styles.actionBtns}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPhone}>
          <Phone size={15} color="#FFF" strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onChat}>
          <MessageCircle size={15} color="#FFF" strokeWidth={2} />
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadTxt}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const TripSummary: React.FC<{ price: string; distance: string; duration: string }> = ({ price, distance, duration }) => (
  <View style={styles.tripSummary}>
    {[{ val: price, lbl: 'Valor' }, { val: distance, lbl: 'Distância' }, { val: duration, lbl: 'Tempo est.' }].map(
      (s, i, arr) => (
        <React.Fragment key={s.lbl}>
          <View style={styles.tripStat}>
            <Text style={styles.tripStatVal}>{s.val}</Text>
            <Text style={styles.tripStatLbl}>{s.lbl}</Text>
          </View>
          {i < arr.length - 1 && <View style={styles.tripStatDiv} />}
        </React.Fragment>
      ),
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.025)' },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.025)' },
  driverPin: { position: 'absolute', top: '42%', left: '38%' },
  destPin: { position: 'absolute', top: '26%', right: '24%' },
  pinInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  routeLine: {
    position: 'absolute', top: '36%', left: '40%', right: '22%',
    height: 3, borderRadius: 2,
  },

  statusPill: {
    position: 'absolute', top: 56, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: Radius.full, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  etaTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  panicBtn: {
    position: 'absolute', top: 52, right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.danger + '18', borderWidth: 1.5, borderColor: Colors.danger + '55',
    alignItems: 'center', justifyContent: 'center',
  },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },

  // ETA banner
  etaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.info + '10', borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.info + '25',
  },
  recenterBtn: {
    position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: Colors.borderLight,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  queueSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: -6, marginBottom: 8, paddingHorizontal: 4 },
  etaBannerTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary, flex: 1 },
  etaProgressBg: { width: 60, height: 4, backgroundColor: Colors.info + '25', borderRadius: 2, overflow: 'hidden' },
  etaProgressFill: { height: '100%', borderRadius: 2 },

  // Arrived banner
  arrivedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.success + '12', borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.success + '30',
  },
  arrivedTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.success, flex: 1 },

  // Driver card
  driverCard: {
    paddingVertical: 10, marginBottom: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverBottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 60,
  },
  driverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  driverName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  vehicleInfo: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, flex: 1 },
  actionBtns: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#111', alignItems: 'center', justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute', top: -3, right: -3,
    width: 17, height: 17, borderRadius: 8.5,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  unreadTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#FFF' },

  // Board hint (passenger waits for driver to start the ride)
  boardHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 4,
  },
  boardHintTxt: { flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, lineHeight: 17 },

  // In-ride
  inRideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  inRidePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  inRidePillTxt: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.primaryDark },
  inRideEta: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  progressTrack: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  inRideActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  inRideBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary + '35',
  },
  inRideBtnDanger: { backgroundColor: Colors.danger + '08', borderColor: Colors.danger + '30' },
  inRideBtnTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.primary },
  badge: {
    position: 'absolute', top: -3, right: -3,
    width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#FFF' },

  // Trip summary
  tripSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: '#F8F8F8', borderRadius: Radius.md, paddingVertical: 10, marginBottom: 6,
  },
  tripStat: { alignItems: 'center', flex: 1 },
  tripStatVal: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  tripStatLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 1 },
  tripStatDiv: { width: 1, height: 24, backgroundColor: Colors.border },
  cancelRideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, marginTop: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.danger + '35', backgroundColor: Colors.danger + '08',
  },
  cancelRideTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.danger },

  // Change destination (route recalculation)
  changeRouteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, marginTop: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '35', backgroundColor: Colors.primary + '08',
  },
  changeRouteTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.primary },
  routeEditorSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 4, maxHeight: '82%',
  },
  routeEditorHint: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 3 },
  routeInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
  },
  routeInput: {
    flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
  },
  routeResults: { maxHeight: 360, marginTop: 12, marginBottom: 14 },
  routeResult: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  routeResultIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  routeResultTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  routeResultAddress: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  routeEmpty: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'center', paddingVertical: 24, lineHeight: 19 },
  routeEditorCancel: { width: '100%' },
  dismissBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 13,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 4,
  },
  dismissTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },

  simulateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8,
  },
  simulateTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  // ── Modals ──────────────────────────────────────────────────
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },

  // Chat
  chatFull: { flex: 1, backgroundColor: '#FFF' },
  chatSheet: { flex: 1 },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  chatDriverInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatAvatarTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textInverse },
  chatDriverName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  chatDriverSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  chatList: { flex: 1 },
  msgBubble: { maxWidth: '78%', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16 },
  msgMe: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  msgDriver: { alignSelf: 'flex-start', backgroundColor: '#111', borderBottomLeftRadius: 4 },
  msgTxt: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
  msgMeTxt: { color: Colors.textInverse },
  msgDriverTxt: { color: '#FFF' },
  msgTime: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 3, textAlign: 'right' },
  chatInput: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  chatInputField: {
    flex: 1, height: 42, backgroundColor: Colors.surface, borderRadius: 21,
    paddingHorizontal: 16, fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },

  // Report
  reportSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, maxHeight: '75%',
  },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  reportTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  reportSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, marginTop: 12, marginBottom: 8 },
  cancelSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 4, maxHeight: '82%',
  },
  cancelWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warning + '12', borderRadius: Radius.md,
    padding: 11, marginTop: 12,
  },
  cancelWarningTxt: { flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  cancelInput: {
    minHeight: 82, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
    textAlignVertical: 'top', marginBottom: 4,
  },
  cancelActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dismissCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  dismissCancelTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },
  confirmCancelBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: Radius.md, backgroundColor: Colors.danger },
  confirmCancelDisabled: { opacity: 0.45 },
  confirmCancelTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFF' },
  reasonItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  reasonSelected: { backgroundColor: Colors.danger + '06' },
  reasonRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border },
  reasonRadioFilled: { borderColor: Colors.danger, backgroundColor: Colors.danger },
  reasonTxt: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, flex: 1 },
  reportSubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 14, marginTop: 16,
  },
  reportSubmitTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#FFF' },
  reportSuccess: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  reportSuccessTxt: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  reportSuccessSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Driver profile
  profileSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, maxHeight: '80%',
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  profileTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  profileInfo: { flexDirection: 'row', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 16 },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileAvatarTxt: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.textInverse },
  profileName: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  profileVehicle: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, marginTop: 2 },
  profileStatsRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  profileStat: { alignItems: 'center' },
  profileStatVal: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  profileStatLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  profileActions: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
  profileActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#111', borderRadius: Radius.md, paddingVertical: 13,
  },
  profileActionTxt: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textInverse },
  reviewsTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 12, letterSpacing: 0.3 },
  reviewItem: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  reviewLeft: {},
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  reviewAvatarTxt: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },
  reviewRight: { flex: 1 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewAuthor: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  reviewDate: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  reviewStars: { flexDirection: 'row', gap: 2, marginVertical: 3 },
  reviewTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, lineHeight: 18 },
});

export default RideTrackingScreen;
