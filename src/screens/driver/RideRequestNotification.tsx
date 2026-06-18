import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Navigation, Clock, DollarSign, X, Check } from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';
import { Avatar } from '../../components/ui';
import { getRideCounterpart, getRidePoints, type RideCounterpart } from '../../services/rides';
import type { RideRow } from '../../types/db';

interface RideRequestNotificationProps {
  ride: RideRow;
  driverCoords?: [number, number]; // [lng, lat]
  onAccept: () => void;
  onReject: () => void;
}

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

const RideRequestNotification: React.FC<RideRequestNotificationProps> = ({
  ride,
  driverCoords,
  onAccept,
  onReject,
}) => {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [counterpart, setCounterpart] = useState<RideCounterpart | null>(null);
  const [pickupDist, setPickupDist] = useState<string | null>(null);

  // Real passenger info
  useEffect(() => {
    let active = true;
    getRideCounterpart(ride.id).then((c) => { if (active) setCounterpart(c); }).catch(() => {});
    // distance from driver to pickup, if we know both
    if (driverCoords) {
      getRidePoints(ride.id).then((p) => {
        if (!active || !p) return;
        const km = haversineKm(driverCoords, [p.originLng, p.originLat]);
        setPickupDist(km < 1 ? `${Math.round(km * 1000)}m de você` : `${km.toFixed(1)} km de você`);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [ride.id, driverCoords?.[0], driverCoords?.[1]]);

  useEffect(() => {
    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Progress bar
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 20000,
      useNativeDriver: false,
    }).start();

    // Countdown — visual only, does NOT auto-reject.
    // The ride stays visible until the driver explicitly accepts/rejects,
    // or until the passenger cancels (handled by the parent subscription).
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const passengerName = counterpart?.name ?? 'Passageiro';
  const passengerRating = (counterpart?.rating ?? 5).toFixed(1);
  const priceText = fmtMoney(ride.price);
  const distText = ride.distance_km != null ? `${ride.distance_km.toFixed(1)} km` : '—';
  const durText = ride.duration_min != null ? `~${ride.duration_min} min` : '—';

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" />

      {/* Blurred background */}
      <View style={styles.backdrop} />

      <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>

        {/* Timer */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>Nova corrida!</Text>
          <View style={styles.timerBadge}>
            <Clock size={12} color={Colors.warning} />
            <Text style={styles.timerText}>{secondsLeft}s</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Passenger */}
        <View style={styles.passengerRow}>
          <Avatar name={passengerName} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>{passengerName}</Text>
            <View style={styles.ratingRow}>
              <Text style={{ color: Colors.warning, fontSize: 11 }}>★</Text>
              <Text style={styles.ratingText}>{passengerRating}</Text>
            </View>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceValue}>{priceText}</Text>
            <Text style={styles.priceLabel}>Estimativa</Text>
          </View>
        </View>

        {/* Route */}
        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>EMBARQUE</Text>
              <Text style={styles.routeAddr} numberOfLines={1}>{ride.origin_address}</Text>
              {pickupDist && <Text style={styles.routeDist}>{pickupDist}</Text>}
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.danger }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>DESTINO</Text>
              <Text style={styles.routeAddr} numberOfLines={1}>{ride.destination_address}</Text>
              <Text style={styles.routeDist}>{distText}</Text>
            </View>
          </View>
        </View>

        {/* Trip Stats */}
        <View style={styles.tripStats}>
          <View style={styles.tripStat}>
            <Navigation size={14} color={Colors.textMuted} />
            <Text style={styles.tripStatText}>{distText}</Text>
          </View>
          <View style={styles.tripStat}>
            <Clock size={14} color={Colors.textMuted} />
            <Text style={styles.tripStatText}>{durText}</Text>
          </View>
          <View style={styles.tripStat}>
            <DollarSign size={14} color={Colors.success} />
            <Text style={[styles.tripStatText, { color: Colors.success }]}>{priceText}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
            <X size={22} color={Colors.danger} />
            <Text style={styles.rejectText}>Recusar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.85}>
            <LinearGradient
              colors={[Colors.success, Colors.successLight]}
              style={styles.acceptGradient}
            >
              <Check size={22} color="#fff" />
              <Text style={styles.acceptText}>Aceitar</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  timerLabel: { ...Typography.h4, color: Colors.textPrimary },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warning + '22', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.warning + '44',
  },
  timerText: { ...Typography.smallMedium, color: Colors.warning, fontWeight: '700' },
  progressTrack: { height: 3, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 20, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.warning, borderRadius: 2 },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  passengerName: { ...Typography.h5, color: Colors.textPrimary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  ratingText: { ...Typography.caption, color: Colors.textSecondary, marginLeft: 4 },
  priceTag: { alignItems: 'flex-end' },
  priceValue: { ...Typography.h4, color: Colors.success },
  priceLabel: { ...Typography.caption, color: Colors.textMuted },
  routeCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border,
  },
  routePoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLabel: { ...Typography.caption, color: Colors.textMuted, letterSpacing: 0.5 },
  routeAddr: { ...Typography.bodyMedium, color: Colors.textPrimary },
  routeDist: { ...Typography.caption, color: Colors.primary, marginTop: 2 },
  routeLine: { width: 2, height: 20, backgroundColor: Colors.border, marginLeft: 4, marginVertical: 6 },
  tripStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  tripStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripStatText: { ...Typography.smallMedium, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 12 },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '11',
  },
  rejectText: { ...Typography.bodyMedium, color: Colors.danger, fontWeight: '600' },
  acceptBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  acceptGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6,
  },
  acceptText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
});

export default RideRequestNotification;
