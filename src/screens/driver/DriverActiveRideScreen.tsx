import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { Avatar, Button, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap from '../../components/RouteMap';
import type { LngLat } from '../../components/RouteMap';
import { getRoute } from '../../services/geo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatModal from '../../components/ChatModal';
import {
  getRideCounterpart,
  updateRideStatus,
  cancelRide,
  type RideCounterpart,
} from '../../services/rides';
import { subscribeMessages, currentUserId } from '../../services/chat';
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

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteGeometry = { type: 'LineString'; coordinates: LngLat[] };
type DriverRideStatus = 'to_passenger' | 'passenger_pickup' | 'in_ride' | 'completed';

interface DriverActiveRideProps {
  onCompleted: () => void;
  onCancel: () => void;
  onPanic: () => void;
  origin?: LngLat;
  destination?: LngLat;
  rideId?: string;
  originAddress?: string;
  destinationAddress?: string;
  paymentMethod?: 'pix' | 'cash' | 'card' | 'boleto';
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'PIX direto na sua chave',
  cash: 'Dinheiro (receba na corrida)',
  card: 'Cartão',
  boleto: 'Boleto',
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
}) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<DriverRideStatus>('to_passenger');
  const [tripRoute, setTripRoute] = useState<RouteGeometry | null>(null);
  const [approachRoute, setApproachRoute] = useState<RouteGeometry | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [counterpart, setCounterpart] = useState<RideCounterpart | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  // Driver live position
  const [driverPos, setDriverPos] = useState<LngLat | null>(null);
  const [driverSpeedMs, setDriverSpeedMs] = useState(0);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDescription, setCancelDescription] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const meRef = useRef<string | null>(null);
  const totalDistRef = useRef(0);          // full trip distance (meters)
  const lastApproachPosRef = useRef<LngLat | null>(null);

  // ── Fetch trip route (pickup → destination) once ────────────────────────────
  useEffect(() => {
    if (!origin || !destination) return;
    let active = true;
    getRoute(origin, destination)
      .then((r) => {
        if (!active || !r) return;
        setTripRoute(r.geometry as RouteGeometry);
        totalDistRef.current = polyLen(r.geometry.coordinates as LngLat[]);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [origin?.[0], origin?.[1], destination?.[0], destination?.[1]]);

  // ── Fetch approach route (driver → pickup) when heading to passenger ─────────
  // Re-fetch only when driver moves > 80m to avoid hammering the API.
  useEffect(() => {
    if (status !== 'to_passenger' || !driverPos || !origin) return;
    const last = lastApproachPosRef.current;
    if (last && haversineM(last, driverPos) < 80) return;
    lastApproachPosRef.current = driverPos;
    let active = true;
    getRoute(driverPos, origin)
      .then((r) => { if (active && r) setApproachRoute(r.geometry as RouteGeometry); })
      .catch(() => {});
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPos, status]);

  // ── Live GPS watch ───────────────────────────────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 3000 },
        (pos) => {
          setDriverPos([pos.coords.longitude, pos.coords.latitude]);
          setDriverSpeedMs(Math.max(0, pos.coords.speed ?? 0));
        },
      );
    })();
    return () => { sub?.remove(); };
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

  useEffect(() => { currentUserId().then((id) => { meRef.current = id; }); }, []);
  useEffect(() => {
    if (!rideId) return;
    return subscribeMessages(rideId, (m) => {
      if (m.sender_id !== meRef.current && !chatOpenRef.current) setUnread((c) => c + 1);
    }, 'unread');
  }, [rideId]);

  // ── Computed: trimmed route + progress + ETA ─────────────────────────────────
  const { activeRoute, progress, etaText } = useMemo(() => {
    // --- approaching passenger ---
    if (status === 'to_passenger') {
      const base = approachRoute;
      if (!base || !driverPos) return { activeRoute: base, progress: 0, etaText: null };
      const trimmed: RouteGeometry = { ...base, coordinates: trimPolyline(base.coordinates, driverPos) };
      const remaining = polyLen(trimmed.coordinates);
      const total = polyLen(base.coordinates) || 1;
      const spd = driverSpeedMs > 0.5 ? driverSpeedMs : 8.33; // fallback 30 km/h
      const eta = Math.max(1, Math.ceil(remaining / spd / 60));
      return {
        activeRoute: trimmed,
        progress: Math.min(1, (total - remaining) / total),
        etaText: `~${eta} min para o passageiro`,
      };
    }

    // --- in ride: trim trip route as driver moves ---
    if (status === 'in_ride') {
      const base = tripRoute;
      if (!base || !driverPos) return { activeRoute: base, progress: 0, etaText: null };
      const trimmed: RouteGeometry = { ...base, coordinates: trimPolyline(base.coordinates, driverPos) };
      const remaining = polyLen(trimmed.coordinates);
      const total = totalDistRef.current || polyLen(base.coordinates) || 1;
      const spd = driverSpeedMs > 0.5 ? driverSpeedMs : 8.33;
      const eta = Math.max(1, Math.ceil(remaining / spd / 60));
      return {
        activeRoute: trimmed,
        progress: Math.min(1, (total - remaining) / total),
        etaText: `~${eta} min para o destino`,
      };
    }

    return { activeRoute: tripRoute, progress: 0, etaText: null };
  }, [status, tripRoute, approachRoute, driverPos, driverSpeedMs]);

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
        if (rideId) await updateRideStatus(rideId, 'completed');
        setStatus('completed');
        setTimeout(onCompleted, 3000);
      }
    } catch (e: any) {
      Alert.alert('Erro ao atualizar corrida', friendlyError(e?.message));
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
      sub: etaText ?? (destinationAddress ? `Destino: ${destinationAddress}` : 'Calculando...'),
      color: Colors.success,
      nextLabel: 'Finalizar corrida',
    },
    completed: {
      label: 'Corrida finalizada!',
      sub: 'Aguardando avaliação do passageiro',
      color: Colors.success,
      nextLabel: '',
    },
  };

  const config = statusConfig[status];
  const canCancel = status !== 'completed';
  const canConfirm = !!cancelReason && cancelDescription.trim().length > 0;
  const progressPct = Math.round(progress * 100);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent />

      <RouteMap
        origin={origin}
        destination={destination}
        route={activeRoute}
        driverLocation={driverPos ?? undefined}
        followUser
        paddingTop={70}
        paddingBottom={320}
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
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
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
              Destino: {destinationAddress ?? (destination ? `${destination[1].toFixed(4)}, ${destination[0].toFixed(4)}` : '—')}
            </Text>
          </View>
          {/* Payment method (how the driver gets paid) */}
          {paymentMethod && (
            <View style={styles.payRow}>
              <DollarSign size={12} color={Colors.success} />
              <Text style={styles.payTxt}>Recebimento: {PAYMENT_LABEL[paymentMethod] ?? paymentMethod}</Text>
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
            <CheckCircle size={24} color={Colors.success} />
            <Text style={styles.completedText}>Corrida concluída! Aguardando avaliação...</Text>
          </View>
        )}
      </View>

      <ChatModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        rideId={rideId}
        title={counterpart?.name ?? 'Passageiro'}
      />

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
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  payTxt: { ...Typography.caption, color: Colors.textSecondary, flex: 1 },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 16, backgroundColor: Colors.success + '22', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  completedText: { ...Typography.bodyMedium, color: Colors.success },

  // Cancel modal
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  cancelSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, maxHeight: '85%',
  },
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
