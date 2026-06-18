import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, TrendingUp, TrendingDown, Navigation, RefreshCw,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getDriverCompletedRides } from '../../services/rides';
import type { RideRow } from '../../types/db';

interface DriverEarningsScreenProps {
  onBack: () => void;
}

type Period = 'week' | 'month' | 'year';

// ── Date helpers (local time) ──────────────────────────────────────────────────
const rideDate = (r: RideRow) => new Date(r.completed_at ?? r.requested_at);
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };
const startOfMonth = (d: Date) => { const x = startOfDay(d); x.setDate(1); return x; };
const startOfYear = (d: Date) => { const x = startOfDay(d); x.setMonth(0, 1); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtMoney = (v: number, decimals = 2) =>
  'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const sumPrice = (rides: RideRow[]) => rides.reduce((s, r) => s + (Number(r.price) || 0), 0);

const PERIOD_LABEL: Record<Period, string> = { week: 'Total da semana', month: 'Total do mês', year: 'Total do ano' };

const DriverEarningsScreen: React.FC<DriverEarningsScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('week');
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRides(await getDriverCompletedRides(500));
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar ganhos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Aggregations ─────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const now = new Date();
    const inRange = (from: Date, to: Date) =>
      rides.filter(r => { const t = rideDate(r); return t >= from && t < to; });

    // Windows for the selected period + previous (for the delta)
    const weekStart = startOfWeek(now), monthStart = startOfMonth(now), yearStart = startOfYear(now);
    const dayStart = startOfDay(now);

    let curRides: RideRow[], prevRides: RideRow[], chart: { label: string; amount: number; rides: number }[];

    if (period === 'week') {
      curRides = inRange(weekStart, addDays(weekStart, 7));
      prevRides = inRange(addDays(weekStart, -7), weekStart);
      chart = WEEK_LABELS.map((label, i) => {
        const d0 = addDays(weekStart, i); const r = inRange(d0, addDays(d0, 1));
        return { label, amount: sumPrice(r), rides: r.length };
      });
    } else if (period === 'month') {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      curRides = inRange(monthStart, nextMonth);
      prevRides = inRange(prevMonth, monthStart);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const weeks = Math.ceil(daysInMonth / 7);
      chart = Array.from({ length: weeks }, (_, w) => {
        const wStart = addDays(monthStart, w * 7);
        const wEnd = w === weeks - 1 ? nextMonth : addDays(wStart, 7);
        const r = inRange(wStart, wEnd);
        return { label: `S${w + 1}`, amount: sumPrice(r), rides: r.length };
      });
    } else {
      const nextYear = new Date(now.getFullYear() + 1, 0, 1);
      const prevYear = new Date(now.getFullYear() - 1, 0, 1);
      curRides = inRange(yearStart, nextYear);
      prevRides = inRange(prevYear, yearStart);
      chart = MONTH_LABELS.map((label, m) => {
        const mStart = new Date(now.getFullYear(), m, 1);
        const mEnd = new Date(now.getFullYear(), m + 1, 1);
        const r = inRange(mStart, mEnd);
        return { label, amount: sumPrice(r), rides: r.length };
      });
    }

    const curTotal = sumPrice(curRides), prevTotal = sumPrice(prevRides);
    const delta = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : (curTotal > 0 ? 100 : 0);

    // Always-on quick stats
    const today = inRange(dayStart, addDays(dayStart, 1));
    const week = inRange(weekStart, addDays(weekStart, 7));
    const month = inRange(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1));

    return {
      chart,
      periodTotal: curTotal,
      periodCount: curRides.length,
      delta,
      quick: {
        today: { total: sumPrice(today), count: today.length },
        week: { total: sumPrice(week), count: week.length },
        month: { total: sumPrice(month), count: month.length },
        all: { total: sumPrice(rides), count: rides.length },
      },
      recent: rides.slice(0, 6),
    };
  }, [rides, period]);

  const maxAmount = Math.max(1, ...agg.chart.map(c => c.amount));
  const deltaUp = agg.delta >= 0;
  const prevLabel = period === 'week' ? 'sem.' : period === 'month' ? 'mês' : 'ano';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Meus Ganhos</Text>
        <TouchableOpacity onPress={load} style={styles.iconBtn}>
          <RefreshCw size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Period tabs */}
      <View style={styles.periodTabs}>
        {(['week', 'month', 'year'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}
            activeOpacity={0.8}
          >
            <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
              {p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryTxt}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

          {/* Hero summary card — dark for readability */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>{PERIOD_LABEL[period]}</Text>
            <Text style={styles.heroValue}>{fmtMoney(agg.periodTotal)}</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroItem}>
                <Navigation size={14} color={Colors.primary} />
                <Text style={styles.heroItemText}>{agg.periodCount} corridas</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroItem}>
                {deltaUp ? <TrendingUp size={14} color={Colors.success} /> : <TrendingDown size={14} color={Colors.danger} />}
                <Text style={[styles.heroItemText, { color: deltaUp ? Colors.success : Colors.danger }]}>
                  {deltaUp ? '+' : ''}{agg.delta.toFixed(0)}% vs {prevLabel} ant.
                </Text>
              </View>
            </View>
          </View>

          {/* Bar chart */}
          <Card style={styles.chartCard}>
            <Text style={styles.chartTitle}>
              {period === 'week' ? 'Ganhos por dia' : period === 'month' ? 'Ganhos por semana' : 'Ganhos por mês'}
            </Text>
            {agg.periodCount === 0 ? (
              <View style={styles.chartEmpty}>
                <Text style={styles.chartEmptyTxt}>Sem ganhos neste período</Text>
              </View>
            ) : (
              <View style={styles.chart}>
                {agg.chart.map((d, i) => (
                  <View key={`${d.label}-${i}`} style={styles.bar}>
                    <Text style={styles.barValue} numberOfLines={1}>
                      {d.amount > 0 ? (d.amount >= 1000 ? `${Math.round(d.amount / 100) / 10}k` : `${Math.round(d.amount)}`) : ''}
                    </Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, {
                        height: `${Math.max(d.amount > 0 ? 6 : 0, (d.amount / maxAmount) * 100)}%` as any,
                      }]} />
                    </View>
                    <Text style={styles.barLabel}>{d.label}</Text>
                    <Text style={styles.barRides}>{d.rides > 0 ? d.rides : ''}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Quick stats */}
          <View style={styles.statsGrid}>
            {[
              { label: 'Hoje', value: fmtMoney(agg.quick.today.total, 0), sub: `${agg.quick.today.count} corridas`, color: Colors.textPrimary },
              { label: 'Semana', value: fmtMoney(agg.quick.week.total, 0), sub: `${agg.quick.week.count} corridas`, color: Colors.success },
              { label: 'Mês', value: fmtMoney(agg.quick.month.total, 0), sub: `${agg.quick.month.count} corridas`, color: Colors.info },
              { label: 'Total', value: fmtMoney(agg.quick.all.total, 0), sub: `${agg.quick.all.count} corridas`, color: Colors.warning },
            ].map((stat) => (
              <Card key={stat.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, { color: stat.color }]} numberOfLines={1} adjustsFontSizeToFit>
                  {stat.value}
                </Text>
                <Text style={styles.statSub}>{stat.sub}</Text>
              </Card>
            ))}
          </View>

          {/* Recent rides */}
          <Text style={styles.sectionTitle}>Corridas recentes</Text>
          {agg.recent.length === 0 ? (
            <Text style={styles.emptyTxt}>Nenhuma corrida concluída ainda</Text>
          ) : (
            agg.recent.map((r) => (
              <Card key={r.id} style={styles.rideItem}>
                <View style={styles.rideIcon}>
                  <Navigation size={16} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rideDest} numberOfLines={1}>
                    {r.destination_address.split(',')[0]}
                  </Text>
                  <Text style={styles.rideTime}>
                    {rideDate(r).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} • {rideDate(r).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.rideAmount}>{fmtMoney(Number(r.price) || 0)}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorTxt: { ...Typography.bodyMedium, color: Colors.danger, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  retryTxt: { ...Typography.smallMedium, color: Colors.primary },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },

  periodTabs: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 4, marginHorizontal: 16, marginTop: 4, marginBottom: 12,
  },
  periodTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.sm },
  periodTabActive: { backgroundColor: Colors.dark },
  periodTabText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },
  periodTabTextActive: { color: '#fff', fontFamily: 'Poppins_600SemiBold' },

  content: { paddingHorizontal: 16 },

  // Hero (dark, readable)
  heroCard: {
    backgroundColor: Colors.dark, borderRadius: Radius.xl, padding: 24, marginBottom: 16,
  },
  heroLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  heroValue: { fontSize: 38, fontFamily: 'Poppins_700Bold', color: '#fff', marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  heroItemText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.85)' },
  heroDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 12 },

  // Chart
  chartCard: { padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  chartTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 16 },
  chartEmpty: { height: 120, alignItems: 'center', justifyContent: 'center' },
  chartEmptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 4 },
  bar: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary, textAlign: 'center' },
  barTrack: {
    flex: 1, width: '68%', backgroundColor: Colors.surface,
    borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 5, backgroundColor: Colors.primary },
  barLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary },
  barRides: { fontSize: 9, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, height: 12 },

  // Quick stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statCard: { width: '47.5%', padding: 14, borderWidth: 1, borderColor: Colors.border },
  statLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
  statSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  sectionTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase' },
  emptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  rideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rideIcon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  rideDest: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  rideTime: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  rideAmount: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: Colors.success },
});

export default DriverEarningsScreen;
