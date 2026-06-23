import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Users,
  Navigation,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Activity,
  Bell,
  ChevronRight,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getAdminKpis, type AdminKpis } from '../../services/admin';

interface AdminDashboardProps {
  onDrivers: () => void;
  onPayments: () => void;
  onMonitoring: () => void;
  onReports: () => void;
  onManagers: () => void;
  onSupport?: () => void;
}

const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${Math.round(v)}`;

const CATEGORY_LABELS: { key: 'moto' | 'economy' | 'comfort' | 'premium'; label: string }[] = [
  { key: 'moto', label: 'Moto' },
  { key: 'economy', label: 'Econômico' },
  { key: 'comfort', label: 'Conforto' },
  { key: 'premium', label: 'Premium' },
];

const AdminDashboardScreen: React.FC<AdminDashboardProps> = ({
  onDrivers,
  onPayments,
  onMonitoring,
  onReports,
  onManagers,
  onSupport,
}) => {
  const [kpis, setKpis] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKpis(await getAdminKpis()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real actionable activity feed derived from KPIs.
  const events = kpis ? [
    kpis.drivers_pending > 0 && { id: 'p', text: `${kpis.drivers_pending} motorista(s) aguardando verificação`, time: 'Ação necessária', icon: Users, color: Colors.warning, onPress: onDrivers },
    kpis.support_open > 0 && { id: 's', text: `${kpis.support_open} chamado(s) de suporte aberto(s)`, time: 'Pendente', icon: AlertTriangle, color: Colors.danger, onPress: onSupport },
    kpis.subs_expired > 0 && { id: 'e', text: `${kpis.subs_expired} motorista(s) com mensalidade vencida`, time: 'Inadimplência', icon: Clock, color: Colors.warning, onPress: onPayments },
    { id: 'r', text: `${kpis.rides_completed} corridas concluídas no total`, time: `${kpis.rides_today} hoje`, icon: Navigation, color: Colors.info, onPress: onMonitoring },
    { id: 'c', text: `${kpis.rides_cancelled} corridas canceladas no total`, time: 'Histórico', icon: XCircle, color: Colors.danger, onPress: onMonitoring },
  ].filter(Boolean) as { id: string; text: string; time: string; icon: any; color: string; onPress?: () => void }[] : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSub}>Painel Administrativo</Text>
            <Text style={styles.headerTitle}>ROTTA URBANA</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} onPress={onSupport}>
            <Bell size={22} color={Colors.textPrimary} />
            {kpis && kpis.support_open > 0 && (
              <View style={styles.bellBadge}><Text style={styles.bellCount}>{kpis.support_open}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {loading && !kpis ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : (
        <>
        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          <LinearGradient colors={[Colors.dark, Colors.darkElevated]} style={styles.kpiCard}>
            <Navigation size={20} color={Colors.primary} />
            <Text style={styles.kpiValue}>{kpis?.rides_today ?? 0}</Text>
            <Text style={styles.kpiLabel}>Corridas hoje</Text>
            <Text style={styles.kpiTrend}>{kpis?.rides_week ?? 0} na semana</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.success, Colors.successLight]} style={styles.kpiCard}>
            <Users size={20} color="rgba(255,255,255,0.85)" />
            <Text style={styles.kpiValue}>{kpis?.drivers_online ?? 0}</Text>
            <Text style={styles.kpiLabel}>Motoristas online</Text>
            <Text style={styles.kpiTrend}>de {kpis?.drivers_total ?? 0} total</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.info, '#1a6af0']} style={styles.kpiCard}>
            <DollarSign size={20} color="rgba(255,255,255,0.85)" />
            <Text style={styles.kpiValue}>{fmtK(kpis?.revenue_subscriptions ?? 0)}</Text>
            <Text style={styles.kpiLabel}>Receita assinaturas</Text>
            <Text style={styles.kpiTrend}>aprovadas</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.warning, '#d97706']} style={styles.kpiCard}>
            <AlertTriangle size={20} color="rgba(255,255,255,0.85)" />
            <Text style={styles.kpiValue}>{kpis?.subs_expired ?? 0}</Text>
            <Text style={styles.kpiLabel}>Inadimplentes</Text>
            <Text style={styles.kpiTrend}>{kpis?.drivers_pending ?? 0} p/ verificar</Text>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Acesso rápido</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: 'Motoristas', icon: Users, color: Colors.primary, onPress: onDrivers },
            { label: 'Pagamentos', icon: DollarSign, color: Colors.success, onPress: onPayments },
            { label: 'Monitoramento', icon: Activity, color: Colors.info, onPress: onMonitoring },
            { label: 'Relatórios', icon: TrendingUp, color: Colors.warning, onPress: onReports },
            { label: 'Gerentes', icon: Users, color: '#7C3AED', onPress: onManagers },
            { label: 'Suporte', icon: Bell, color: Colors.danger, onPress: onSupport },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionCard} onPress={a.onPress}>
              <View style={[styles.actionIcon, { backgroundColor: a.color + '22' }]}>
                <a.icon size={22} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Extended KPIs */}
        <Text style={styles.sectionTitle}>Motoristas</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiSmall}>
            <Text style={styles.kpiSmallVal}>{kpis?.drivers_total ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Total</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.success }]}>{kpis?.drivers_verified ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Verificados</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.warning }]}>{kpis?.drivers_pending ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Pendentes</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.info }]}>{kpis?.drivers_on_ride ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Em corrida</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Corridas</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiSmall}>
            <Text style={styles.kpiSmallVal}>{kpis?.rides_total ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Total</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.success }]}>{kpis?.rides_completed ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Concluídas</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.danger }]}>{kpis?.rides_cancelled ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Canceladas</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.primary }]}>{kpis?.rides_month ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Esse mês</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Assinaturas</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.success }]}>{kpis?.subs_active ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Ativas</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.danger }]}>{kpis?.subs_expired ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Vencidas</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={styles.kpiSmallVal}>{fmtK(kpis?.revenue_subscriptions ?? 0)}</Text>
            <Text style={styles.kpiSmallLabel}>Receita</Text>
          </View>
          <View style={styles.kpiSmall}>
            <Text style={[styles.kpiSmallVal, { color: Colors.warning }]}>{kpis?.support_open ?? 0}</Text>
            <Text style={styles.kpiSmallLabel}>Suporte</Text>
          </View>
        </View>

        {/* Platform Status */}
        <Card style={styles.statusCard}>
          <Text style={styles.cardTitle}>Status da plataforma</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <CheckCircle size={16} color={Colors.success} />
              <Text style={styles.statusText}>API Online</Text>
            </View>
            <View style={styles.statusItem}>
              <CheckCircle size={16} color={Colors.success} />
              <Text style={styles.statusText}>Maps OK</Text>
            </View>
            <View style={styles.statusItem}>
              <CheckCircle size={16} color={Colors.success} />
              <Text style={styles.statusText}>PIX OK</Text>
            </View>
            <View style={styles.statusItem}>
              <CheckCircle size={16} color={Colors.success} />
              <Text style={styles.statusText}>Push OK</Text>
            </View>
          </View>
        </Card>

        {/* Active Rides */}
        <Card style={styles.liveCard}>
          <View style={styles.liveHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.liveDot} />
              <Text style={styles.cardTitle}>Corridas ao vivo</Text>
            </View>
            <TouchableOpacity onPress={onMonitoring}>
              <Text style={styles.viewAll}>Ver mapa</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.liveStats}>
            <View style={styles.liveStat}>
              <Text style={styles.liveStatValue}>{kpis?.rides_in_progress ?? 0}</Text>
              <Text style={styles.liveStatLabel}>Em andamento</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={[styles.liveStatValue, { color: Colors.info }]}>{kpis?.drivers_on_ride ?? 0}</Text>
              <Text style={styles.liveStatLabel}>Em corrida</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={[styles.liveStatValue, { color: Colors.success }]}>{kpis?.drivers_online ?? 0}</Text>
              <Text style={styles.liveStatLabel}>Motoristas disp.</Text>
            </View>
          </View>
        </Card>

        {/* Rides by category (last 30 days) — full visibility incl. moto */}
        <Card style={styles.liveCard}>
          <Text style={styles.cardTitle}>Corridas por categoria (30 dias)</Text>
          {CATEGORY_LABELS.map((c) => {
            const count = kpis?.rides_by_type?.[c.key] ?? 0;
            const gross = kpis?.gross_fares_by_type?.[c.key] ?? 0;
            return (
              <View key={c.key} style={styles.catRow}>
                <Text style={styles.catLabel}>{c.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Text style={styles.catCount}>{count} corridas</Text>
                  <Text style={styles.catGross}>{fmtK(gross)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Recent Events */}
        <Text style={styles.sectionTitle}>Atividade recente</Text>
        {events.map((event) => (
          <TouchableOpacity key={event.id} style={styles.eventItem} onPress={event.onPress}>
            <View style={[styles.eventIcon, { backgroundColor: event.color + '22' }]}>
              <event.icon size={16} color={event.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventText}>{event.text}</Text>
              <Text style={styles.eventTime}>{event.time}</Text>
            </View>
            <ChevronRight size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
        </>
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerSub: { ...Typography.small, color: Colors.textMuted, marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 3 },
  bellBtn: { position: 'relative' },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.background,
  },
  bellCount: { fontSize: 10, color: '#fff', fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  kpiCard: {
    width: '47%', borderRadius: Radius.lg, padding: 16, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  kpiValue: { fontSize: 26, fontWeight: '800', color: '#fff' },
  kpiLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.8)' },
  kpiTrend: { ...Typography.caption, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  actionCard: {
    width: '47%', backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: 16, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...Typography.smallMedium, color: Colors.textPrimary },
  statusCard: { marginBottom: 12, padding: 16 },
  cardTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: 12 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { ...Typography.small, color: Colors.textSecondary },
  liveCard: { marginBottom: 16, padding: 16 },
  liveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  viewAll: { ...Typography.small, color: Colors.primary },
  liveStats: { flexDirection: 'row', justifyContent: 'space-around' },
  liveStat: { alignItems: 'center' },
  liveStatValue: { ...Typography.h3, color: Colors.textPrimary, fontWeight: '800' },
  liveStatLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  catLabel: { ...Typography.smallMedium, color: Colors.textPrimary },
  catCount: { ...Typography.small, color: Colors.textSecondary },
  catGross: { ...Typography.smallMedium, color: Colors.primaryDark, minWidth: 60, textAlign: 'right' },
  eventItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  eventIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  eventText: { ...Typography.small, color: Colors.textPrimary, flex: 1 },
  eventTime: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  kpiRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, paddingHorizontal: 8, marginBottom: 16,
  },
  kpiSmall: { flex: 1, alignItems: 'center' },
  kpiSmallVal: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  kpiSmallLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 3, textAlign: 'center' },
});

export default AdminDashboardScreen;
