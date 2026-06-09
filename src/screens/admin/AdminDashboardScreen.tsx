import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Users,
  Navigation,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Activity,
  MapPin,
  Bell,
  ChevronRight,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react-native';
import { Card, Badge } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

interface AdminDashboardProps {
  onDrivers: () => void;
  onPayments: () => void;
  onMonitoring: () => void;
  onReports: () => void;
  onSupport?: () => void;
}

const RECENT_EVENTS = [
  { id: '1', type: 'driver_joined', text: 'Novo motorista cadastrado: Pedro Lima', time: '2 min atrás', icon: Users, color: Colors.success },
  { id: '2', type: 'payment', text: 'Mensalidade paga: Carlos Mendes — R$ 150,00', time: '15 min atrás', icon: DollarSign, color: Colors.primary },
  { id: '3', type: 'ride', text: '12 corridas concluídas na última hora', time: '1h atrás', icon: Navigation, color: Colors.info },
  { id: '4', type: 'panic', text: 'Botão de pânico acionado — Corrida #4521', time: '2h atrás', icon: AlertTriangle, color: Colors.danger },
  { id: '5', type: 'overdue', text: 'Motorista inadimplente: João Santos (15 dias)', time: '3h atrás', icon: Clock, color: Colors.warning },
];

const AdminDashboardScreen: React.FC<AdminDashboardProps> = ({
  onDrivers,
  onPayments,
  onMonitoring,
  onReports,
  onSupport,
}) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSub}>Painel Administrativo</Text>
            <Text style={styles.headerTitle}>ROTTA URBANA</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn}>
            <Bell size={22} color={Colors.textPrimary} />
            <View style={styles.bellBadge}><Text style={styles.bellCount}>3</Text></View>
          </TouchableOpacity>
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.kpiCard}>
            <Navigation size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.kpiValue}>247</Text>
            <Text style={styles.kpiLabel}>Corridas hoje</Text>
            <Text style={styles.kpiTrend}>+18% ↑</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.success, Colors.successLight]} style={styles.kpiCard}>
            <Users size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.kpiValue}>89</Text>
            <Text style={styles.kpiLabel}>Motoristas online</Text>
            <Text style={styles.kpiTrend}>de 142 total</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.info, '#1a6af0']} style={styles.kpiCard}>
            <DollarSign size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.kpiValue}>R$ 4.2k</Text>
            <Text style={styles.kpiLabel}>Mensalidades</Text>
            <Text style={styles.kpiTrend}>este mês</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.warning, '#d97706']} style={styles.kpiCard}>
            <AlertTriangle size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.kpiValue}>7</Text>
            <Text style={styles.kpiLabel}>Inadimplentes</Text>
            <Text style={styles.kpiTrend}>ação necessária</Text>
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
          ].map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionCard} onPress={a.onPress}>
              <View style={[styles.actionIcon, { backgroundColor: a.color + '22' }]}>
                <a.icon size={22} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
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
              <Text style={styles.liveStatValue}>23</Text>
              <Text style={styles.liveStatLabel}>Em andamento</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={[styles.liveStatValue, { color: Colors.warning }]}>14</Text>
              <Text style={styles.liveStatLabel}>Procurando mot.</Text>
            </View>
            <View style={styles.liveStat}>
              <Text style={[styles.liveStatValue, { color: Colors.success }]}>89</Text>
              <Text style={styles.liveStatLabel}>Motoristas disp.</Text>
            </View>
          </View>
        </Card>

        {/* Recent Events */}
        <Text style={styles.sectionTitle}>Atividade recente</Text>
        {RECENT_EVENTS.map((event) => (
          <TouchableOpacity key={event.id} style={styles.eventItem}>
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

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerSub: { ...Typography.small, color: Colors.textMuted, marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, letterSpacing: 3 },
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
  eventItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  eventIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  eventText: { ...Typography.small, color: Colors.textPrimary, flex: 1 },
  eventTime: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
});

export default AdminDashboardScreen;
