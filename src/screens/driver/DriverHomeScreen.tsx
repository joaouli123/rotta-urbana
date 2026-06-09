import React from 'react';
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
} from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import RouteMap from '../../components/RouteMap';

interface DriverHomeScreenProps {
  online: boolean;
  onToggleOnline: () => void;
  coords?: [number, number];
  onRideRequest: () => void;
  onEarnings: () => void;
  onProfile: () => void;
}

const DriverHomeScreen: React.FC<DriverHomeScreenProps> = ({
  online,
  onToggleOnline,
  coords,
  onRideRequest,
  onEarnings,
  onProfile,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live map (Mapbox no dev build) */}
      <RouteMap origin={coords} followUser paddingTop={insets.top + 80} paddingBottom={360} style={styles.map} />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity onPress={onProfile} style={styles.avatarBtn}>
          <Avatar name="Carlos Mendes" size={42} />
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
        <Text style={styles.sectionTitle}>Hoje</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <DollarSign size={18} color={Colors.success} />
            <Text style={styles.statValue}>R$ 142</Text>
            <Text style={styles.statLabel}>Ganhos</Text>
          </View>
          <View style={styles.statCard}>
            <Navigation size={18} color={Colors.info} />
            <Text style={styles.statValue}>8</Text>
            <Text style={styles.statLabel}>Corridas</Text>
          </View>
          <View style={styles.statCard}>
            <Clock size={18} color={Colors.warning} />
            <Text style={styles.statValue}>5h 20m</Text>
            <Text style={styles.statLabel}>Online</Text>
          </View>
          <View style={styles.statCard}>
            <Star size={18} color={Colors.warning} />
            <Text style={styles.statValue}>4.9</Text>
            <Text style={styles.statLabel}>Nota</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={onEarnings}>
            <DollarSign size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Ganhos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <MapPin size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Corridas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <Star size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Avaliações</Text>
          </TouchableOpacity>
        </View>

        {/* Subscription Status */}
        <Card style={styles.subCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={styles.subTitle}>Mensalidade</Text>
              <Text style={styles.subDate}>Vence em 10/06/2026</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge label="Em dia" variant="success" />
              <ChevronRight size={16} color={Colors.textMuted} />
            </View>
          </View>
        </Card>

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
  notifBtn: {},
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
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 12 },
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
