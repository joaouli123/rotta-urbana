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
  MapPin,
  LogOut,
  Navigation,
  Users,
  Activity,
  HeadphonesIcon,
  ChevronRight,
  CheckCircle,
  Clock,
  Headphones,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getManagerKpis, type ManagerKpis } from '../../services/manager';

interface ManagerDashboardProps {
  onDrivers: () => void;
  onRides: () => void;
  onReports: () => void;
  onSupport: () => void;
  onSignOut: () => void;
  cityName: string;
}

const ManagerDashboardScreen: React.FC<ManagerDashboardProps> = ({
  onDrivers,
  onRides,
  onReports,
  onSupport,
  onSignOut,
  cityName,
}) => {
  const [kpis, setKpis] = useState<ManagerKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKpis(await getManagerKpis()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const scopeLabel = kpis?.context?.manager_type === 'network' ? 'Toda a rede' : kpis?.context?.cities?.join(' / ') || cityName;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
      >

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>Bem-vindo, Gerente</Text>
            <View style={styles.cityRow}>
              <MapPin size={18} color={Colors.primary} />
              <Text style={styles.cityName}>{scopeLabel}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.75}>
            <LogOut size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading && !kpis ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <>
            {/* ── KPI Grid ── */}
            <View style={styles.kpiGrid}>
              {/* Corridas hoje */}
              <LinearGradient colors={[Colors.dark, Colors.darkElevated]} style={styles.kpiCard}>
                <Navigation size={20} color={Colors.primary} />
                <Text style={styles.kpiValue}>{kpis?.rides_today ?? 0}</Text>
                <Text style={styles.kpiLabel}>Corridas hoje</Text>
                <Text style={styles.kpiSub}>{kpis?.rides_month ?? 0} no mês</Text>
              </LinearGradient>

              {/* Motoristas total */}
              <LinearGradient colors={[Colors.dark, Colors.darkElevated]} style={styles.kpiCard}>
                <Users size={20} color={Colors.primary} />
                <Text style={styles.kpiValue}>{kpis?.drivers_total ?? 0}</Text>
                <Text style={styles.kpiLabel}>Motoristas</Text>
                <Text style={styles.kpiSub}>{kpis?.drivers_verified ?? 0} verificados</Text>
              </LinearGradient>

              {/* Em andamento */}
              <LinearGradient colors={[Colors.dark, Colors.darkElevated]} style={styles.kpiCard}>
                <Activity size={20} color={Colors.primary} />
                <Text style={styles.kpiValue}>{kpis?.rides_in_progress ?? 0}</Text>
                <Text style={styles.kpiLabel}>Em andamento</Text>
                <Text style={styles.kpiSub}>corridas ativas</Text>
              </LinearGradient>

              {/* Suporte aberto */}
              <LinearGradient colors={[Colors.dark, Colors.darkElevated]} style={styles.kpiCard}>
                <Headphones size={20} color={Colors.primary} />
                <Text style={styles.kpiValue}>{kpis?.support_open ?? 0}</Text>
                <Text style={styles.kpiLabel}>Suporte aberto</Text>
                <Text style={styles.kpiSub}>chamados</Text>
              </LinearGradient>
            </View>

            {/* ── Acesso rápido ── */}
            <Text style={styles.sectionTitle}>Acesso rápido</Text>
            <View style={styles.actionsGrid}>
              {[
                { label: 'Motoristas', icon: Users, color: Colors.primary, onPress: onDrivers },
                { label: 'Corridas', icon: Navigation, color: Colors.info, onPress: onRides },
                { label: 'Relatorios', icon: Activity, color: Colors.success, onPress: onReports },
                { label: 'Suporte', icon: Headphones, color: Colors.warning, onPress: onSupport },
              ].map((a) => (
                <TouchableOpacity key={a.label} style={styles.actionCard} onPress={a.onPress} activeOpacity={0.8}>
                  <View style={[styles.actionIcon, { backgroundColor: a.color + '22' }]}>
                    <a.icon size={24} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                  <ChevronRight size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Resumo da semana ── */}
            <Text style={styles.sectionTitle}>Resumo da semana</Text>
            <Card style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.info + '22' }]}>
                  <Navigation size={18} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryValue}>{kpis?.rides_week ?? 0}</Text>
                  <Text style={styles.summaryLabel}>corridas na semana</Text>
                </View>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.success + '22' }]}>
                  <CheckCircle size={18} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryValue}>{kpis?.drivers_verified ?? 0}</Text>
                  <Text style={styles.summaryLabel}>motoristas verificados</Text>
                </View>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.warning + '22' }]}>
                  <Clock size={18} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryValue}>{kpis?.drivers_pending ?? 0}</Text>
                  <Text style={styles.summaryLabel}>motoristas pendentes</Text>
                </View>
                {(kpis?.drivers_pending ?? 0) > 0 && (
                  <TouchableOpacity onPress={onDrivers} activeOpacity={0.75}>
                    <Text style={styles.summaryAction}>Revisar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            {/* ── Footer note ── */}
            <Text style={styles.footerNote}>
              Acesso restrito à cidade de {cityName}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  headerSub: { ...Typography.small, color: Colors.textMuted, marginBottom: 6 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cityName: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, letterSpacing: -0.3 },
  signOutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  kpiCard: {
    width: '47%', borderRadius: Radius.lg, padding: 16, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28, shadowRadius: 6, elevation: 4,
  },
  kpiValue: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 6 },
  kpiLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.8)' },
  kpiSub: { ...Typography.caption, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 12 },

  actionsGrid: { gap: 8, marginBottom: 24 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionIcon: { width: 46, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...Typography.bodyMedium, color: Colors.textPrimary, flex: 1 },

  summaryCard: { padding: 16, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  summaryIconWrap: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  summaryLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
  summaryAction: { ...Typography.smallMedium, color: Colors.primary },
  summaryDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 10 },

  footerNote: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
});

export default ManagerDashboardScreen;
