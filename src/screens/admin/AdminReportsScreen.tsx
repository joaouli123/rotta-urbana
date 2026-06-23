import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import {
  ArrowLeft, Star, Navigation, Users, TrendingUp, DollarSign,
  MessageSquare, Award, Bike,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getAdminKpis, getFullReport, getDriverRanking, type AdminKpis, type FullReport, type DriverRankingEntry } from '../../services/admin';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'ranking' | 'rides' | 'support';
type RankBy = 'rating' | 'rides';

interface Props {
  onBack: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'rides', label: 'Corridas' },
  { key: 'support', label: 'Suporte' },
];

const CATEGORY_ITEMS: { key: 'moto' | 'economy' | 'comfort' | 'premium'; label: string }[] = [
  { key: 'moto', label: 'Moto' },
  { key: 'economy', label: 'Econômico' },
  { key: 'comfort', label: 'Conforto' },
  { key: 'premium', label: 'Premium' },
];

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00';
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function fmtMoneyShort(v: number | null | undefined): string {
  if (v == null) return 'R$ 0';
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${Math.round(v)}`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const AdminReportsScreen: React.FC<Props> = ({ onBack }) => {
  const [kpis, setKpis] = useState<AdminKpis | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [ranking, setRanking] = useState<DriverRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [rankBy, setRankBy] = useState<RankBy>('rating');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, r, rank] = await Promise.all([
        getAdminKpis(),
        getFullReport(),
        getDriverRanking(),
      ]);
      setKpis(k);
      setReport(r);
      setRanking(rank);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sortedRanking = [...ranking].sort((a, b) =>
    rankBy === 'rating'
      ? (b.rating ?? 0) - (a.rating ?? 0)
      : (b.total_rides ?? 0) - (a.total_rides ?? 0)
  );

  // ── Ride bar chart ──────────────────────────────────────────────────────────
  const byMonth: Array<{ label: string; count: number; gross: number }> =
    (report as any)?.rides?.by_month ?? [];
  const maxCount = byMonth.length > 0 ? Math.max(...byMonth.map((m) => m.count)) : 1;

  // ── Category data ───────────────────────────────────────────────────────────
  const totalRidesByType = CATEGORY_ITEMS.reduce(
    (acc, c) => acc + ((kpis?.rides_by_type as any)?.[c.key] ?? 0),
    0
  );

  // ── Support stats ───────────────────────────────────────────────────────────
  const supportOpen = (report as any)?.complaints?.open ?? kpis?.support_open ?? 0;
  const supportInProgress = (report as any)?.complaints?.in_progress ?? 0;
  const supportClosed = (report as any)?.complaints?.closed ?? 0;
  const supportTotal = supportOpen + supportInProgress + supportClosed;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Relatórios</Text>
          <Text style={styles.headerSubtitle}>Dados completos da plataforma</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabItem, active && styles.tabItemActive]}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Body */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando relatórios…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <>
              {/* Usuários */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Users size={18} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Usuários</Text>
                </View>
                <View style={styles.statsGrid}>
                  <StatBox label="Passageiros" value={kpis?.passengers ?? 0} />
                  <StatBox label="Motoristas" value={kpis?.drivers_total ?? 0} />
                </View>
                <View style={styles.statsGrid}>
                  <StatBox label="Verificados" value={kpis?.drivers_verified ?? 0} color={Colors.success} />
                  <StatBox label="Pendentes" value={kpis?.drivers_pending ?? 0} color={Colors.warning} />
                </View>
                {((report as any)?.drivers?.gender_split) && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.subLabel}>Distribuição por gênero</Text>
                    <View style={styles.statsGrid}>
                      <StatBox label="Mulheres" value={(report as any).drivers.gender_split.female ?? 0} />
                      <StatBox label="Homens" value={(report as any).drivers.gender_split.male ?? 0} />
                      <StatBox label="Outros" value={(report as any).drivers.gender_split.other ?? 0} />
                    </View>
                  </>
                )}
              </Card>

              {/* Corridas */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Navigation size={18} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Corridas</Text>
                </View>
                <View style={styles.statsGrid}>
                  <StatBox label="Total" value={kpis?.rides_total ?? 0} />
                  <StatBox label="Concluídas" value={kpis?.rides_completed ?? 0} color={Colors.success} />
                  <StatBox label="Canceladas" value={kpis?.rides_cancelled ?? 0} color={Colors.danger} />
                </View>
                <View style={styles.divider} />
                <View style={styles.metricsRow}>
                  <MetricPill label="Preço médio" value={`R$ ${(report as any)?.rides?.avg_price ?? 0}`} />
                  <MetricPill label="Duração média" value={`${(report as any)?.rides?.avg_duration_min ?? 0} min`} />
                  <MetricPill label="Distância média" value={`${(report as any)?.rides?.avg_distance_km ?? 0} km`} />
                </View>
              </Card>

              {/* Receita */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <DollarSign size={18} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Receita</Text>
                </View>
                <View style={styles.statsGrid}>
                  <StatBox label="Corridas/mês" value={kpis?.rides_month ?? 0} />
                  <StatBox label="Corridas/semana" value={kpis?.rides_week ?? 0} />
                </View>
                <View style={styles.divider} />
                <View style={styles.revenueRow}>
                  <View style={styles.revenueItem}>
                    <Text style={styles.revenueLabel}>Faturamento bruto</Text>
                    <Text style={styles.revenueValue}>
                      {fmtMoney((report as any)?.rides?.gross_total)}
                    </Text>
                  </View>
                  <View style={styles.revenueItem}>
                    <Text style={styles.revenueLabel}>Assinaturas</Text>
                    <Text style={styles.revenueValue}>
                      {fmtMoney(kpis?.revenue_subscriptions)}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Avaliações */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Star size={18} color={Colors.warning} />
                  <Text style={styles.cardTitle}>Avaliações médias</Text>
                </View>
                <View style={styles.ratingRow}>
                  <Star size={28} color={Colors.warning} fill={Colors.warning} />
                  <Text style={styles.ratingBig}>
                    {((report as any)?.drivers?.avg_rating ?? 0).toFixed(1)}
                  </Text>
                  <Text style={styles.ratingOut}>/5</Text>
                </View>
                <Text style={styles.ratingSubtext}>
                  Avaliação média dos motoristas da plataforma
                </Text>
                <View style={styles.divider} />
                <View style={styles.statsGrid}>
                  <StatBox label="Total avaliações" value={(report as any)?.drivers?.total_ratings ?? 0} />
                  <StatBox label="Motoristas ativos" value={kpis?.drivers_verified ?? 0} />
                </View>
              </Card>
            </>
          )}

          {/* ── RANKING ─────────────────────────────────────────────────────── */}
          {tab === 'ranking' && (
            <>
              <View style={styles.sectionHeader}>
                <Award size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Top motoristas por avaliação</Text>
              </View>

              {/* Sub-tabs */}
              <View style={styles.subTabBar}>
                <TouchableOpacity
                  onPress={() => setRankBy('rating')}
                  style={[styles.subTab, rankBy === 'rating' && styles.subTabActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.subTabLabel, rankBy === 'rating' && styles.subTabLabelActive]}>
                    Por Avaliação
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRankBy('rides')}
                  style={[styles.subTab, rankBy === 'rides' && styles.subTabActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.subTabLabel, rankBy === 'rides' && styles.subTabLabelActive]}>
                    Por Corridas
                  </Text>
                </TouchableOpacity>
              </View>

              {sortedRanking.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Nenhum motorista encontrado</Text>
                </View>
              ) : (
                sortedRanking.map((driver, idx) => {
                  const rankColor = idx < 3 ? RANK_COLORS[idx] : Colors.textMuted;
                  return (
                    <Card key={(driver as any).driver_id ?? idx} style={styles.rankCard}>
                      <View style={styles.rankRow}>
                        <Text style={[styles.rankNumber, { color: rankColor }]}>
                          #{idx + 1}
                        </Text>
                        <View style={styles.rankInfo}>
                          <Text style={styles.rankName}>{driver.full_name}</Text>
                          <Text style={styles.rankPhone}>{(driver as any).phone ?? '—'}</Text>
                          <Text style={styles.rankVehicle}>
                            {(driver as any).vehicle_model ?? ''}{(driver as any).vehicle_plate ? ` · ${(driver as any).vehicle_plate}` : ''}
                          </Text>
                        </View>
                        <View style={styles.rankStats}>
                          <View style={styles.rankStatRow}>
                            <Star size={13} color={Colors.warning} fill={Colors.warning} />
                            <Text style={styles.rankStatText}>
                              {(driver.rating ?? 0).toFixed(1)}
                            </Text>
                          </View>
                          <View style={styles.rankStatRow}>
                            <Navigation size={13} color={Colors.primary} />
                            <Text style={styles.rankStatText}>{driver.total_rides ?? 0}</Text>
                          </View>
                        </View>
                      </View>
                    </Card>
                  );
                })
              )}
            </>
          )}

          {/* ── RIDES ───────────────────────────────────────────────────────── */}
          {tab === 'rides' && (
            <>
              {/* Monthly chart */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <TrendingUp size={18} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Corridas por mês (últimos 6 meses)</Text>
                </View>
                {byMonth.length === 0 ? (
                  <Text style={styles.emptyText}>Sem dados disponíveis</Text>
                ) : (
                  byMonth.map((m, i) => {
                    const barPct = maxCount > 0 ? m.count / maxCount : 0;
                    return (
                      <View key={i} style={styles.barRow}>
                        <Text style={styles.barLabel}>{m.label}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${Math.round(barPct * 100)}%` },
                            ]}
                          />
                        </View>
                        <View style={styles.barMeta}>
                          <Text style={styles.barCount}>{m.count}</Text>
                          <Text style={styles.barGross}>{fmtMoneyShort(m.gross)}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>

              {/* By category */}
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Navigation size={18} color={Colors.primary} />
                  <Text style={styles.cardTitle}>Corridas por categoria (30 dias)</Text>
                </View>
                {CATEGORY_ITEMS.map((cat) => {
                  const count = (kpis?.rides_by_type as any)?.[cat.key] ?? 0;
                  const gross = (kpis?.gross_fares_by_type as any)?.[cat.key] ?? 0;
                  const pct = totalRidesByType > 0 ? count / totalRidesByType : 0;
                  return (
                    <View key={cat.key} style={styles.catRow}>
                      <View style={styles.catIconWrap}>
                        {cat.key === 'moto' ? (
                          <Bike size={16} color={Colors.primary} />
                        ) : (
                          <Navigation size={16} color={Colors.primary} />
                        )}
                      </View>
                      <View style={styles.catInfo}>
                        <View style={styles.catTopRow}>
                          <Text style={styles.catLabel}>{cat.label}</Text>
                          <Text style={styles.catCount}>{count} corridas</Text>
                          <Text style={styles.catGross}>{fmtMoneyShort(gross)}</Text>
                        </View>
                        <View style={styles.catTrack}>
                          <View
                            style={[
                              styles.catBar,
                              { width: `${Math.round(pct * 100)}%` },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          {/* ── SUPPORT ─────────────────────────────────────────────────────── */}
          {tab === 'support' && (
            <>
              <View style={styles.sectionHeader}>
                <MessageSquare size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Tickets de suporte</Text>
              </View>

              {/* Stat cards */}
              <View style={styles.supportStats}>
                <SupportStatCard
                  label="Abertos"
                  value={supportOpen}
                  dotColor={Colors.danger}
                />
                <SupportStatCard
                  label="Em andamento"
                  value={supportInProgress}
                  dotColor={Colors.warning}
                />
                <SupportStatCard
                  label="Fechados"
                  value={supportClosed}
                  dotColor={Colors.success}
                />
              </View>

              {/* Total */}
              <Card style={styles.card}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total de tickets</Text>
                  <Text style={styles.totalValue}>{supportTotal}</Text>
                </View>
              </Card>

              {/* Note */}
              <View style={styles.noteBox}>
                <MessageSquare size={16} color={Colors.textMuted} />
                <Text style={styles.noteText}>
                  Para responder tickets, acesse a seção Suporte
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatBoxProps {
  label: string;
  value: number | string;
  color?: string;
}

const StatBox: React.FC<StatBoxProps> = ({ label, value, color }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

interface MetricPillProps {
  label: string;
  value: string;
}

const MetricPill: React.FC<MetricPillProps> = ({ label, value }) => (
  <View style={styles.metricPill}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

interface SupportStatCardProps {
  label: string;
  value: number;
  dotColor: string;
}

const SupportStatCard: React.FC<SupportStatCardProps> = ({ label, value, dotColor }) => (
  <View style={styles.supportCard}>
    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
    <Text style={styles.supportValue}>{value}</Text>
    <Text style={styles.supportLabel}>{label}</Text>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 1,
  },
  headerRight: {
    width: 36,
  },

  // Tab bar
  tabBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: Colors.primary,
  },
  tabLabel: {
    ...Typography.smallMedium,
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },

  // Cards
  card: {
    marginBottom: 0,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    ...Typography.bodySemiBold,
    color: Colors.textPrimary,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },

  subLabel: {
    ...Typography.captionMedium,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: Colors.primary + '14',
    borderRadius: Radius.md,
    padding: 10,
    alignItems: 'center',
  },
  metricValue: {
    ...Typography.smallMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  metricLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  // Revenue
  revenueRow: {
    flexDirection: 'row',
    gap: 8,
  },
  revenueItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 12,
  },
  revenueLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  revenueValue: {
    ...Typography.h5,
    color: Colors.textPrimary,
  },

  // Rating
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  ratingBig: {
    fontSize: 40,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 48,
  },
  ratingOut: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  ratingSubtext: {
    ...Typography.small,
    color: Colors.textMuted,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.bodySemiBold,
    color: Colors.textPrimary,
  },

  // Sub-tabs (ranking)
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  subTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  subTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  subTabLabel: {
    ...Typography.smallMedium,
    color: Colors.textMuted,
  },
  subTabLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // Rank cards
  rankCard: {
    marginBottom: 8,
    padding: 14,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankNumber: {
    fontSize: 20,
    fontWeight: '700',
    width: 34,
    textAlign: 'center',
  },
  rankInfo: {
    flex: 1,
  },
  rankName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  rankPhone: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 1,
  },
  rankVehicle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 1,
  },
  rankStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rankStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rankStatText: {
    ...Typography.smallMedium,
    color: Colors.textPrimary,
  },

  // Bar chart
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  barLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    width: 46,
  },
  barTrack: {
    flex: 1,
    height: 28,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    minWidth: 6,
  },
  barMeta: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  barCount: {
    ...Typography.smallMedium,
    color: Colors.textPrimary,
  },
  barGross: {
    ...Typography.caption,
    color: Colors.textMuted,
  },

  // Category rows
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInfo: {
    flex: 1,
  },
  catTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  catLabel: {
    ...Typography.smallMedium,
    color: Colors.textPrimary,
    flex: 1,
  },
  catCount: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  catGross: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  catTrack: {
    height: 6,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  catBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 4,
  },

  // Support
  supportStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  supportCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
  },
  supportValue: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },
  supportLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  totalValue: {
    ...Typography.h4,
    color: Colors.textPrimary,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 14,
    marginTop: 4,
  },
  noteText: {
    ...Typography.small,
    color: Colors.textMuted,
    flex: 1,
  },

  // Empty state
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
});

export default AdminReportsScreen;
