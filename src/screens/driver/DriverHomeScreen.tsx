import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  useWindowDimensions,
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
import RouteMap, { homeMapPadding } from '../../components/RouteMap';
import { useAuth } from '../../contexts/AuthContext';
import { getMyDriver, getEarnings } from '../../services/drivers';
import { getSubscription, isSubscriptionCurrent, planAutoRenews, planHoursLeft } from '../../services/payments';
import { PLAN_LABELS, cutoffPhrase, fmtDate } from '../../components/PlanPayment';
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
  const { height } = useWindowDimensions();
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

  // Plan status. The due date is a UTC day that ends at 21:00 in Brasília,
  // so it is shown through cutoffPhrase, not as a local date.
  const subCurrent = isSubscriptionCurrent(sub);
  const subAutoRenews = planAutoRenews(sub);
  const hoursLeft = subCurrent ? planHoursLeft(sub) : null;
  const subDueSoon = subCurrent && !subAutoRenews && hoursLeft !== null && hoursLeft > 0 && (
    (sub?.plan === 'daily' && hoursLeft <= 12)
    || (sub?.plan === 'weekly' && hoursLeft <= 24)
    || (sub?.plan === 'monthly' && hoursLeft <= 72)
  );
  const subTitle = sub?.plan ? `Plano ${PLAN_LABELS[sub.plan]}` : 'Mensalidade';
  const subBadge = subCurrent
    ? (subDueSoon ? { label: 'Vence logo', variant: 'warning' as const } : { label: 'Em dia', variant: 'success' as const })
    : sub?.status === 'pending'
      ? { label: 'Pendente', variant: 'warning' as const }
      : sub?.status === 'suspended'
        ? { label: 'Suspenso', variant: 'warning' as const }
        : { label: 'Vencido', variant: 'danger' as const };
  const subLine = !sub
    ? 'Toque para ver detalhes'
    : sub.plan === 'commission'
      ? 'Comissão por corrida, sem vencimento'
      : subCurrent
        ? (subAutoRenews
          ? `Renova sozinho em ${fmtDate(sub.due_date)}`
          : `Vence ${cutoffPhrase(sub.due_date)}${subDueSoon ? ' · toque para renovar' : ''}`)
        : sub.status === 'pending'
          ? 'Aguardando pagamento · toque para ver'
          : 'Toque para renovar';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live map (Mapbox no dev build) */}
      <RouteMap origin={coords} followUser restrictToSinop {...homeMapPadding(insets.top, height)} style={styles.map} />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity onPress={onProfile} style={styles.avatarBtn}>
          <Avatar name={driverName} size={42} />
          <View style={[styles.statusDot, { backgroundColor: online ? Colors.success : Colors.offline }]} />
        </TouchableOpacity>

        <View style={styles.onlinePill}>
          <View style={[styles.onlineDot, { backgroundColor: online ? Colors.success : Colors.offline }]} />
          <Text style={[styles.onlineText, { color: online ? Colors.success : Colors.offline }]}>
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
          accessibilityRole="button"
          accessibilityLabel={online ? 'Ficar offline' : 'Ficar online'}
        >
          <LinearGradient
            colors={online ? [Colors.success, Colors.successLight] : [Colors.danger, Colors.dangerLight]}
            style={styles.toggleGradient}
          >
            <Power size={22} color="#fff" />
            <Text style={styles.toggleText}>{online ? 'Online' : 'Offline'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.handle} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        >
          {/* Today's Stats */}
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Resumo</Text>
              <Text style={styles.sectionSubtitle}>Seu desempenho recente</Text>
            </View>
            <View style={[styles.sheetStatus, { backgroundColor: online ? Colors.success + '16' : Colors.danger + '12' }]}>
              <View style={[styles.sheetStatusDot, { backgroundColor: online ? Colors.success : Colors.danger }]} />
              <Text style={[styles.sheetStatusText, { color: online ? Colors.success : Colors.danger }]}>
                {online ? 'Ativo' : 'Em pausa'}
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}><DollarSign size={17} color={Colors.primary} /></View>
              <Text style={styles.statValue}>{earnings ? fmtMoney(earnings.today) : '—'}</Text>
              <Text style={styles.statLabel}>Hoje</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}><TrendingUp size={17} color={Colors.primary} /></View>
              <Text style={styles.statValue}>{earnings ? fmtMoney(earnings.week) : '—'}</Text>
              <Text style={styles.statLabel}>Semana</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}><Navigation size={17} color={Colors.primary} /></View>
              <Text style={styles.statValue}>{driver?.total_rides ?? earnings?.rides ?? 0}</Text>
              <Text style={styles.statLabel}>Corridas</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}><Star size={17} color={Colors.primary} /></View>
              <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Nota</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.subSectionTitle}>Acesso rápido</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction} onPress={onEarnings}>
              <View style={styles.quickIcon}><DollarSign size={19} color={Colors.primary} /></View>
              <Text style={styles.quickActionText}>Ganhos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={onRides}>
              <View style={styles.quickIcon}><MapPin size={19} color={Colors.primary} /></View>
              <Text style={styles.quickActionText}>Corridas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={onRatings}>
              <View style={styles.quickIcon}><Star size={19} color={Colors.primary} /></View>
              <Text style={styles.quickActionText}>Avaliações</Text>
            </TouchableOpacity>
          </View>

          {/* Subscription Status */}
          <TouchableOpacity onPress={onSubscription} activeOpacity={0.8}>
            <Card style={subDueSoon ? { ...styles.subCard, borderWidth: 1, borderColor: Colors.warning } : styles.subCard}>
              <View style={styles.subCardContent}>
                <View style={styles.subCopy}>
                  <Text style={styles.subEyebrow}>PLANO ATUAL</Text>
                  <Text style={styles.subTitle}>{subTitle}</Text>
                  <Text style={[styles.subDate, subDueSoon && { color: Colors.warning, fontWeight: '600' }]}>
                    {subLine}
                  </Text>
                </View>
                <View style={styles.subAction}>
                  {sub && <Badge label={subBadge.label} variant={subBadge.variant} />}
                  <ChevronRight size={18} color={Colors.textMuted} />
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
        </ScrollView>
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
    position: 'absolute', top: '37%', alignSelf: 'center', width: '58%', zIndex: 4,
  },
  toggleBtn: { borderRadius: Radius.full, overflow: 'hidden' },
  toggleGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 52, paddingVertical: 12, paddingHorizontal: 20,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 10,
  },
  toggleText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FCFCFC',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    borderWidth: 1, borderBottomWidth: 0, borderColor: Colors.border,
    paddingHorizontal: 16, paddingTop: 12,
    maxHeight: '56%', zIndex: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 12,
  },
  sheetContent: { paddingTop: 2 },
  handle: { width: 38, height: 4, backgroundColor: '#D5D5D5', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { ...Typography.overline, color: Colors.textPrimary, marginBottom: 2, letterSpacing: 1.4 },
  sectionSubtitle: { ...Typography.caption, color: Colors.textMuted },
  sheetStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  sheetStatusDot: { width: 7, height: 7, borderRadius: 4 },
  sheetStatusText: { ...Typography.caption, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border,
    minHeight: 98,
  },
  statIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  statValue: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  statLabel: { ...Typography.caption, color: Colors.textMuted },
  subSectionTitle: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '700', marginBottom: 8 },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  quickAction: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border,
  },
  quickIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  quickActionText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  subCard: { padding: 14, marginBottom: 4, borderRadius: Radius.lg },
  subCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subCopy: { flex: 1 },
  subEyebrow: { ...Typography.overline, color: Colors.textMuted, fontSize: 9, letterSpacing: 1.1, marginBottom: 2 },
  subTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '700' },
  subDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  subAction: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  simulateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, marginTop: 2,
  },
  simulateText: { ...Typography.caption, color: Colors.textMuted },
});

export default DriverHomeScreen;
