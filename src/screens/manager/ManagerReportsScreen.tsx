import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart3, ChevronLeft, DollarSign, Navigation, Star, TrendingUp, Users } from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getManagerReport, type ManagerReport } from '../../services/manager';

interface Props { onBack: () => void; }

const fmtMoney = (value: number) => `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`;
const fmtNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);

const ManagerReportsScreen: React.FC<Props> = ({ onBack }) => {
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await getManagerReport()); } catch { setReport(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const kpis = report?.kpis;

  return (
    <View style={styles.container}>
      <View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={onBack}><ChevronLeft size={23} color={Colors.textPrimary} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={styles.title}>Relatórios gerenciais</Text><Text style={styles.subtitle}>Desempenho da sua rede</Text></View><BarChart3 size={21} color={Colors.primary} /></View>
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View> : !report ? <View style={styles.center}><Text style={styles.error}>Não foi possível carregar o relatório.</Text><TouchableOpacity onPress={load}><Text style={styles.retry}>Tentar novamente</Text></TouchableOpacity></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}>
          <View style={styles.kpiGrid}>
            <Kpi icon={<Navigation size={18} color="#fff" />} value={fmtNumber(kpis?.rides_month ?? 0)} label="Corridas concluídas no mês" color={Colors.dark} />
            <Kpi icon={<DollarSign size={18} color="#fff" />} value={fmtMoney(kpis?.gross_month ?? 0)} label="Faturamento bruto" color={Colors.success} />
            <Kpi icon={<Users size={18} color="#fff" />} value={fmtNumber(kpis?.drivers_total ?? 0)} label="Motoristas no escopo" color={Colors.info} />
            <Kpi icon={<Star size={18} color="#fff" />} value={(Number((kpis as any)?.avg_ticket) || 0).toFixed(1)} label="Ticket médio (R$)" color={Colors.warning} />
          </View>

          <Text style={styles.section}>Indicadores operacionais</Text>
          <Card style={styles.metricsCard} padding={14}>
            {[
              ['Motoristas verificados', fmtNumber(kpis?.drivers_verified ?? 0)],
              ['Motoristas pendentes', fmtNumber(kpis?.drivers_pending ?? 0)],
              ['Motoristas online agora', fmtNumber(kpis?.drivers_online ?? 0)],
              ['Corridas em andamento', fmtNumber(kpis?.rides_in_progress ?? 0)],
              ['Corridas canceladas', fmtNumber(kpis?.rides_cancelled ?? 0)],
              ['Distância média', `${(Number(kpis?.avg_distance_km) || 0).toFixed(1)} km`],
            ].map(([label, value]) => <View key={label} style={styles.metricRow}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>)}
          </Card>

          <Text style={styles.section}>Evolução mensal</Text>
          <Card style={styles.metricsCard} padding={14}>
            {(kpis?.by_month ?? []).map((month) => <View key={month.month} style={styles.monthRow}><View style={{ flex: 1 }}><Text style={styles.monthName}>{month.month}</Text><View style={styles.barTrack}><View style={[styles.bar, { width: `${Math.min(100, Math.max(4, (month.rides / Math.max(1, Math.max(...(kpis?.by_month ?? []).map((item) => item.rides)))) * 100))}%` }]} /></View></View><View style={styles.monthValues}><Text style={styles.monthRides}>{fmtNumber(month.rides)} corridas</Text><Text style={styles.monthGross}>{fmtMoney(month.gross)}</Text></View></View>)}
          </Card>

          <Text style={styles.section}>Motoristas em destaque</Text>
          <Card style={styles.metricsCard} padding={14}>
            {(report.drivers ?? []).slice(0, 10).map((driver, index) => <View key={`${driver.full_name}-${index}`} style={styles.driverRow}><View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.driverName}>{driver.full_name}</Text><Text style={styles.driverMeta}>{driver.operating_city ?? 'Cidade não informada'} · {fmtNumber(driver.total_rides)} corridas</Text></View><View style={styles.rating}><Star size={13} color={Colors.warning} fill={Colors.warning} /><Text style={styles.ratingText}>{Number(driver.rating || 0).toFixed(1)}</Text></View></View>)}
            {(!report.drivers || report.drivers.length === 0) && <Text style={styles.emptyText}>Ainda não há motoristas no escopo.</Text>}
          </Card>
          <View style={styles.note}><TrendingUp size={15} color={Colors.primary} /><Text style={styles.noteText}>Os dados são calculados no servidor e respeitam as cidades, os motoristas e o nível de acesso do gerente.</Text></View>
        </ScrollView>
      )}
    </View>
  );
};

const Kpi = ({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) => <View style={[styles.kpi, { backgroundColor: color }]}>{icon}<Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h5, color: Colors.textPrimary }, subtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, error: { ...Typography.small, color: Colors.textMuted }, retry: { ...Typography.smallMedium, color: Colors.primary },
  content: { padding: 16, gap: 10, paddingBottom: 40 }, kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, kpi: { width: '48%', minHeight: 118, borderRadius: Radius.lg, padding: 14, gap: 5 }, kpiValue: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 5 }, kpiLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.82)', lineHeight: 16 },
  section: { ...Typography.overline, color: Colors.textMuted, marginTop: 8 }, metricsCard: { gap: 0 }, metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }, metricLabel: { ...Typography.small, color: Colors.textSecondary }, metricValue: { ...Typography.smallMedium, color: Colors.textPrimary },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }, monthName: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 5 }, barTrack: { height: 7, borderRadius: 4, backgroundColor: Colors.surface, overflow: 'hidden' }, bar: { height: 7, borderRadius: 4, backgroundColor: Colors.primary }, monthValues: { width: 96, alignItems: 'flex-end' }, monthRides: { ...Typography.caption, color: Colors.textSecondary }, monthGross: { ...Typography.caption, color: Colors.primary, marginTop: 2 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }, rank: { width: 25, height: 25, borderRadius: 13, backgroundColor: Colors.primary + '16', alignItems: 'center', justifyContent: 'center' }, rankText: { ...Typography.caption, color: Colors.primary }, driverName: { ...Typography.smallMedium, color: Colors.textPrimary }, driverMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 }, rating: { flexDirection: 'row', alignItems: 'center', gap: 3 }, ratingText: { ...Typography.smallMedium, color: Colors.textPrimary }, emptyText: { ...Typography.small, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 }, note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: Radius.md, backgroundColor: Colors.primary + '10' }, noteText: { ...Typography.caption, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
});

export default ManagerReportsScreen;
