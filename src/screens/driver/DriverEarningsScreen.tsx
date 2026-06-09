import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, DollarSign, TrendingUp, Navigation, Calendar, ChevronDown } from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

const WEEKLY_DATA = [
  { day: 'Seg', amount: 92, rides: 5 },
  { day: 'Ter', amount: 115, rides: 7 },
  { day: 'Qua', amount: 78, rides: 4 },
  { day: 'Qui', amount: 142, rides: 9 },
  { day: 'Sex', amount: 198, rides: 12 },
  { day: 'Sáb', amount: 220, rides: 14 },
  { day: 'Dom', amount: 68, rides: 3 },
];

const RECENT_RIDES = [
  { id: '1', destination: 'Shopping Sinop', amount: 'R$ 14,00', time: '14:32', date: 'Hoje' },
  { id: '2', destination: 'Hospital Regional', amount: 'R$ 22,50', time: '11:15', date: 'Hoje' },
  { id: '3', destination: 'Terminal Rodoviário', amount: 'R$ 11,00', time: '09:00', date: 'Ontem' },
  { id: '4', destination: 'UNEMAT Sinop', amount: 'R$ 19,00', time: '07:45', date: 'Ontem' },
];

interface DriverEarningsScreenProps {
  onBack: () => void;
}

const DriverEarningsScreen: React.FC<DriverEarningsScreenProps> = ({ onBack }) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');

  const maxAmount = Math.max(...WEEKLY_DATA.map((d) => d.amount));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Meus Ganhos</Text>
        <TouchableOpacity style={styles.periodBtn}>
          <Text style={styles.periodText}>Esta semana</Text>
          <ChevronDown size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Summary Card */}
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          style={styles.summaryCard}
        >
          <Text style={styles.summaryLabel}>Total da semana</Text>
          <Text style={styles.summaryValue}>R$ 913,00</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Navigation size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.summaryItemText}>54 corridas</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <TrendingUp size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.summaryItemText}>+12% vs sem. ant.</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Period Tabs */}
        <View style={styles.periodTabs}>
          {(['week', 'month', 'year'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bar Chart */}
        <Card style={styles.chartCard}>
          <Text style={styles.chartTitle}>Ganhos por dia</Text>
          <View style={styles.chart}>
            {WEEKLY_DATA.map((d) => (
              <View key={d.day} style={styles.bar}>
                <Text style={styles.barValue}>R${d.amount}</Text>
                <View style={styles.barTrack}>
                  <LinearGradient
                    colors={[Colors.primary, Colors.primaryDark]}
                    style={[styles.barFill, { height: `${(d.amount / maxAmount) * 100}%` }]}
                  />
                </View>
                <Text style={styles.barLabel}>{d.day}</Text>
                <Text style={styles.barRides}>{d.rides}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Hoje', value: 'R$ 142', sub: '8 corridas', color: Colors.primary },
            { label: 'Semana', value: 'R$ 913', sub: '54 corridas', color: Colors.success },
            { label: 'Mês', value: 'R$ 3.420', sub: '210 corridas', color: Colors.info },
            { label: 'Total', value: 'R$ 28.500', sub: 'Desde jan/25', color: Colors.warning },
          ].map((stat) => (
            <Card key={stat.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statSub}>{stat.sub}</Text>
            </Card>
          ))}
        </View>

        {/* Recent Rides */}
        <Text style={styles.sectionTitle}>Corridas recentes</Text>
        {RECENT_RIDES.map((ride) => (
          <Card key={ride.id} style={styles.rideItem}>
            <View style={styles.rideIcon}>
              <Navigation size={16} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rideDest}>{ride.destination}</Text>
              <Text style={styles.rideTime}>{ride.date} • {ride.time}</Text>
            </View>
            <Text style={styles.rideAmount}>{ride.amount}</Text>
          </Card>
        ))}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  periodBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  periodText: { ...Typography.small, color: Colors.textSecondary },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  summaryCard: {
    borderRadius: Radius.xl, padding: 24, marginBottom: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  summaryLabel: { ...Typography.small, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  summaryValue: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  summaryItemText: { ...Typography.small, color: 'rgba(255,255,255,0.8)' },
  summaryDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 12 },
  periodTabs: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 4, marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  periodTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  periodTabActive: { backgroundColor: Colors.primary },
  periodTabText: { ...Typography.smallMedium, color: Colors.textMuted },
  periodTabTextActive: { color: Colors.white, fontWeight: '600' },
  chartCard: { padding: 16, marginBottom: 16 },
  chartTitle: { ...Typography.h5, color: Colors.textPrimary, marginBottom: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
  bar: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 8, color: Colors.textMuted, textAlign: 'center' },
  barTrack: {
    flex: 1, width: '70%', backgroundColor: Colors.border,
    borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { ...Typography.caption, color: Colors.textSecondary },
  barRides: { fontSize: 9, color: Colors.textMuted },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statCard: { width: '47%', padding: 14 },
  statLabel: { ...Typography.caption, color: Colors.textMuted, marginBottom: 4 },
  statValue: { ...Typography.h4, fontWeight: '700', marginBottom: 4 },
  statSub: { ...Typography.caption, color: Colors.textMuted },
  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 12 },
  rideItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, marginBottom: 8,
  },
  rideIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  rideDest: { ...Typography.bodyMedium, color: Colors.textPrimary },
  rideTime: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  rideAmount: { ...Typography.h5, color: Colors.success },
});

export default DriverEarningsScreen;
