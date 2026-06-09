import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Clock,
  Camera,
} from 'lucide-react-native';
import { Avatar, Button, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap from '../../components/RouteMap';
import { getRoute } from '../../services/geo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatModal from '../../components/ChatModal';
import { getRideCounterpart, type RideCounterpart } from '../../services/rides';
import { subscribeMessages, currentUserId } from '../../services/chat';

type DriverRideStatus = 'to_passenger' | 'passenger_pickup' | 'in_ride' | 'completed';

interface DriverActiveRideProps {
  onCompleted: () => void;
  onPanic: () => void;
  origin?: [number, number];
  destination?: [number, number];
  rideId?: string;
}

const DriverActiveRideScreen: React.FC<DriverActiveRideProps> = ({ onCompleted, onPanic, origin, destination, rideId }) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<DriverRideStatus>('to_passenger');
  const [route, setRoute] = useState<{ type: 'LineString'; coordinates: [number, number][] } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [counterpart, setCounterpart] = useState<RideCounterpart | null>(null);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const meRef = useRef<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) return;
    let active = true;
    getRoute(origin, destination).then((r) => { if (active && r) setRoute(r.geometry); }).catch(() => {});
    return () => { active = false; };
  }, [origin?.[0], origin?.[1], destination?.[0], destination?.[1]]);

  useEffect(() => {
    if (!rideId) return;
    let active = true;
    getRideCounterpart(rideId).then((c) => { if (active && c) setCounterpart(c); }).catch(() => {});
    return () => { active = false; };
  }, [rideId]);

  useEffect(() => { currentUserId().then((id) => { meRef.current = id; }); }, []);
  useEffect(() => {
    if (!rideId) return;
    return subscribeMessages(rideId, (m) => {
      if (m.sender_id !== meRef.current && !chatOpenRef.current) setUnread((c) => c + 1);
    }, 'unread');
  }, [rideId]);

  const callPassenger = () => {
    const d = (counterpart?.phone ?? '').replace(/\D/g, '');
    if (d) Linking.openURL(`tel:${d}`);
    else Alert.alert('Indisponível', 'Telefone do passageiro não disponível.');
  };

  const statusConfig: Record<DriverRideStatus, { label: string; sub: string; color: string; nextLabel: string }> = {
    to_passenger: {
      label: 'A caminho do passageiro',
      sub: 'Rua das Palmeiras, 220 • 300m',
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
      sub: 'Shopping Sinop • 2.1 km',
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

  const goNext = () => {
    if (status === 'to_passenger') setStatus('passenger_pickup');
    else if (status === 'passenger_pickup') setStatus('in_ride');
    else if (status === 'in_ride') {
      setStatus('completed');
      setTimeout(onCompleted, 3000);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent />

      {/* Mapa (Mapbox no dev build) com embarque, destino e rota */}
      <RouteMap origin={origin} destination={destination} route={route} paddingTop={70} paddingBottom={320} style={styles.map} />

      {/* Status Pill */}
      <View style={[styles.statusPill, { borderColor: config.color + '44', top: insets.top + 8 }]}>
        <View style={[styles.statusDot, { backgroundColor: config.color }]} />
        <View>
          <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.statusSub}>{config.sub}</Text>
        </View>
      </View>

      {/* Panic */}
      <TouchableOpacity style={[styles.panicBtn, { top: insets.top + 56 }]} onPress={onPanic}>
        <AlertTriangle size={18} color={Colors.danger} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.handle} />

        {/* Passenger info */}
        <View style={styles.passengerRow}>
          <Avatar name={counterpart?.name ?? 'Passageiro'} size={50} />
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>{counterpart?.name ?? 'Passageiro'}</Text>
            <Text style={styles.passengerRating}>★ {(counterpart?.rating ?? 5).toFixed(1)} • Passageiro</Text>
          </View>
          <View style={styles.callBtns}>
            <TouchableOpacity style={styles.callBtn} onPress={callPassenger}>
              <Phone size={16} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={() => { setUnread(0); setChatOpen(true); }}>
              <MessageCircle size={16} color={Colors.primary} />
              {unread > 0 && <View style={styles.chatBadge}><Text style={styles.chatBadgeTxt}>{unread}</Text></View>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Route summary */}
        <Card style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
            <View>
              <Text style={styles.routePointLabel}>EMBARQUE</Text>
              <Text style={styles.routePointAddr}>Rua das Palmeiras, 220</Text>
            </View>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.danger }]} />
            <View>
              <Text style={styles.routePointLabel}>DESTINO</Text>
              <Text style={styles.routePointAddr}>Shopping Sinop</Text>
            </View>
          </View>
        </Card>

        {/* Earnings preview */}
        <View style={styles.earningsRow}>
          <View style={styles.earningsItem}>
            <DollarSign size={16} color={Colors.success} />
            <Text style={styles.earningsValue}>R$ 14,00</Text>
            <Text style={styles.earningsLabel}>Corrida</Text>
          </View>
          <View style={styles.earningsItem}>
            <Clock size={16} color={Colors.textMuted} />
            <Text style={styles.earningsValue}>~12 min</Text>
            <Text style={styles.earningsLabel}>Duração</Text>
          </View>
          <View style={styles.earningsItem}>
            <Navigation size={16} color={Colors.textMuted} />
            <Text style={styles.earningsValue}>2.1 km</Text>
            <Text style={styles.earningsLabel}>Distância</Text>
          </View>
        </View>

        {status !== 'completed' && (
          <Button
            title={config.nextLabel}
            onPress={goNext}
            style={{ marginTop: 8 }}
          />
        )}

        {status === 'completed' && (
          <View style={styles.completedBox}>
            <CheckCircle size={24} color={Colors.success} />
            <Text style={styles.completedText}>Corrida concluída! Aguardando avaliação...</Text>
          </View>
        )}
      </View>

      <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} rideId={rideId} title={counterpart?.name ?? 'Passageiro'} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { ...StyleSheet.absoluteFillObject },
  mapLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  pin: { position: 'absolute', alignItems: 'center' },
  passengerPin: { bottom: '42%', left: '44%' },
  destPin: { top: '22%', right: '26%' },
  pinInner: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  driverPin: { position: 'absolute', bottom: '46%', left: '52%' },
  driverPinInner: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  routeLine: {
    position: 'absolute', bottom: '44%', left: '44%', right: '24%', height: 3, borderRadius: 2,
  },
  statusPill: {
    position: 'absolute', top: 56, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card + 'EE', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { ...Typography.smallMedium, fontWeight: '600' },
  statusSub: { ...Typography.caption, color: Colors.textMuted },
  panicBtn: {
    position: 'absolute', top: 100, right: 16,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.danger + '22', borderWidth: 1.5, borderColor: Colors.danger + '66',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
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
  routeCard: { padding: 14, marginBottom: 14 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routePointLabel: { ...Typography.caption, color: Colors.textMuted },
  routePointAddr: { ...Typography.bodyMedium, color: Colors.textPrimary },
  routeDivider: { width: 2, height: 16, backgroundColor: Colors.border, marginLeft: 4, marginVertical: 4 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  earningsItem: { alignItems: 'center', gap: 4 },
  earningsValue: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '700' },
  earningsLabel: { ...Typography.caption, color: Colors.textMuted },
  completedBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 16, backgroundColor: Colors.success + '22', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '44',
  },
  completedText: { ...Typography.bodyMedium, color: Colors.success },
});

export default DriverActiveRideScreen;
