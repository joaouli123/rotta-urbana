import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Navigation,
  DollarSign,
  Star,
  MapPin,
  Power,
  ChevronRight,
  Clock,
  TrendingUp,
} from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap from '../../components/RouteMap';
import { useAuth } from '../../contexts/AuthContext';
import { getMyDriver, getEarnings } from '../../services/drivers';
import { getSubscription } from '../../services/payments';
import type { DriverRow, SubscriptionRow } from '../../types/db';

interface DriverHomeScreenProps {
  online: boolean;
  onToggleOnline: () => void;
  coords?: [number, number];
  onRideRequest: () => void;
  onEarnings: () => void;
  onProfile: () => void;
  onRides?: () => void;
  onRatings?: () => void;
  onSubscription?: () => void;
}

const fmtMoney = (v: number, decimals = 0) =>
  'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function fmtDueDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const DriverHomeScreen: React.FC<DriverHomeScreenProps> = ({
  online,
  onToggleOnline,
  coords,
  onRideRequest,
  onEarnings,
  onProfile,
  onRides,
  onRatings,
  onSubscription,
}) => {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [earnings, setEarnings] = useState<{ today: number; week: number; rides: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [d, s, e] = await Promise.all([
        getMyDriver().catch(() => null),
        getSubscription().catch(() => null),
        getEarnings().catch(() => null),
      ]);
      if (d) setDriver(d);
      if (s) setSub(s);
      if (e) setEarnings({ today: e.today, week: e.week, rides: e.rides });
    } catch { /* ignore */ }
  }, []);

  // Reload whenever the driver toggles online (also runs on mount).
  useEffect(() => { loadData(); }, [loadData, online]);

  const driverName = profile?.full_name ?? 'Motorista';
  const rating = profile?.rating ?? 5;

  // Subscription status: derive badge from real status + due date.
  const subActive = sub?.status === 'active';
  const subDue = sub?.due_date ? new Date(sub.due_date) : null;
  const subOverdue = subDue ? subDue < new Date() && !subActive : sub?.status === 'expired';
  const subBadge = subOverdue
    ? { label: 'Vencida', variant: 'danger' as const }
    : sub?.status === 'suspended'
      ? { label: 'Suspensa', variant: 'warning' as const }
      : { label: subActive ? 'Em dia' : '—', variant: 'success' as const };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live map (Mapbox no dev build) */}
      <RouteMap origin={coords} followUser paddingTop={insets.top + 80} paddingBottom={360} style={styles.map} />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity onPress={onProfile} style={styles.avatarBtn}>
          <Avatar name={driverName} size={42} />
          <View style={[styles.statusDot, { backgroundColor: online ? Colors.success : Colors.offline }]} />
        </TouchableOpacity>

        <View style={styles.onlinePill}>
          <View style={[styles.onlineDot, { backgroundColor: online ? Colors.success : Colors.offline }]} />
          <Text style={[styles.onlineText, { color: online ? Colors.success : Colors.textMuted }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>

        <TouchableOpacity style={styles.notifBtn}>
          <Bell size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Toggle Button */}
      <View style={styles.toggleWrapper}>
        <TouchableOpacity
          onPress={onToggleOnline}
          style={styles.toggleBtn}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={online ? [Colors.danger, Colors.dangerLight] : [Colors.success, Colors.successLight]}
            style={styles.toggleGradient}
          >
            <Power size={22} color="#fff" />
            <Text style={styles.toggleText}>{online ? 'Ficar Offline' : 'Ficar Online'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.handle} />

        {/* Today's Stats */}
        <Text style={styles.sectionTitle}>Resumo</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <DollarSign size={18} color={Colors.textPrimary} />
            <Text style={styles.statValue}>{earnings ? fmtMoney(earnings.today) : '—'}</Text>
            <Text style={styles.statLabel}>Hoje</Text>
          </View>
          <View style={styles.statCard}>
            <TrendingUp size={18} color={Colors.textPrimary} />
            <Text style={styles.statValue}>{earnings ? fmtMoney(earnings.week) : '—'}</Text>
            <Text style={styles.statLabel}>Semana</Text>
          </View>
          <View style={styles.statCard}>
            <Navigation size={18} color={Colors.textPrimary} />
            <Text style={styles.statValue}>{driver?.total_rides ?? earnings?.rides ?? 0}</Text>
            <Text style={styles.statLabel}>Corridas</Text>
          </View>
          <View style={styles.statCard}>
            <Star size={18} color={Colors.textPrimary} />
            <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Nota</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={onEarnings}>
            <DollarSign size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Ganhos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={onRides}>
            <MapPin size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Corridas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={onRatings}>
            <Star size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Avaliações</Text>
          </TouchableOpacity>
        </View>

        {/* Subscription Status */}
        <TouchableOpacity onPress={onSubscription} activeOpacity={0.8}>
          <Card style={styles.subCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={styles.subTitle}>Mensalidade</Text>
                <Text style={styles.subDate}>
                  {sub ? `Vence em ${fmtDueDate(sub.due_date)}` : 'Toque para ver detalhes'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {sub && <Badge label={subBadge.label} variant={subBadge.variant} />}
                <ChevronRight size={16} color={Colors.textMuted} />
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Simulate Ride Request Button */}
        {online && (
          <TouchableOpacity style={styles.simulateBtn} onPress={onRideRequest}>
            <Navigation size={16} color={Colors.textMuted} />
            <Text style={styles.simulateText}>Ver solicitações disponíveis</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { ...StyleSheet.absoluteFillObject },
  mapLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  driverPin: { position: 'absolute', top: '35%', left: '46%', alignItems: 'center' },
  driverPinInner: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  driverPinShadow: { width: 16, height: 8, borderRadius: 8, marginTop: 2 },
  topBar: {
    position: 'absolute', top: 52, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  avatarBtn: { position: 'relative' },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.background,
  },
  onlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card + 'EE', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { ...Typography.smallMedium, fontWeight: '600' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.card + 'EE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  toggleWrapper: {
    position: 'absolute', top: '42%', alignSelf: 'center', width: '60%',
  },
  toggleBtn: { borderRadius: Radius.full, overflow: 'hidden' },
  toggleGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  toggleText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 65,
    borderTopRightRadius: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: '#76C442',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 12, marginLeft: 12 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '700' },
  statLabel: { ...Typography.caption, color: Colors.textMuted },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickAction: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border,
  },
  quickActionText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  subCard: { padding: 14, marginBottom: 8 },
  subTitle: { ...Typography.bodyMedium, color: Colors.textPrimary },
  subDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  simulateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4,
  },
  simulateText: { ...Typography.caption, color: Colors.textMuted },
});

export default DriverHomeScreen;
