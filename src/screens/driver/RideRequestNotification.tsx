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

interface RideRequestNotificationProps {
  onAccept: () => void;
  onReject: () => void;
}

const RideRequestNotification: React.FC<RideRequestNotificationProps> = ({
  onAccept,
  onReject,
}) => {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const [secondsLeft, setSecondsLeft] = useState(20);

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

    // Countdown
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onReject();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

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
          <Avatar name="Lucas Silva" size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>Lucas Silva</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Text key={i} style={{ color: Colors.warning, fontSize: 11 }}>★</Text>
              ))}
              <Text style={styles.ratingText}>4.9</Text>
            </View>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceValue}>R$ 14,00</Text>
            <Text style={styles.priceLabel}>Estimativa</Text>
          </View>
        </View>

        {/* Route */}
        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
            <View>
              <Text style={styles.routeLabel}>EMBARQUE</Text>
              <Text style={styles.routeAddr}>Rua das Palmeiras, 220</Text>
              <Text style={styles.routeDist}>300m de você</Text>
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: Colors.danger }]} />
            <View>
              <Text style={styles.routeLabel}>DESTINO</Text>
              <Text style={styles.routeAddr}>Shopping Sinop</Text>
              <Text style={styles.routeDist}>2.1 km</Text>
            </View>
          </View>
        </View>

        {/* Trip Stats */}
        <View style={styles.tripStats}>
          <View style={styles.tripStat}>
            <Navigation size={14} color={Colors.textMuted} />
            <Text style={styles.tripStatText}>2.1 km</Text>
          </View>
          <View style={styles.tripStat}>
            <Clock size={14} color={Colors.textMuted} />
            <Text style={styles.tripStatText}>~12 min</Text>
          </View>
          <View style={styles.tripStat}>
            <DollarSign size={14} color={Colors.success} />
            <Text style={[styles.tripStatText, { color: Colors.success }]}>R$ 14,00</Text>
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
