import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator, Modal, Alert, RefreshControl,
} from 'react-native';
import {
  ChevronLeft, Search, CheckCircle, ChevronRight, Car, Phone,
  Star, Navigation, X, ShieldCheck, Ban,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getAdminDrivers, verifyDriver, type AdminDriver } from '../../services/admin';

const STATUS_FILTERS = ['Todos', 'Verificados', 'Pendentes', 'Inadimplentes', 'Online'] as const;

const subBadge = (s: AdminDriver['subscription_status']) =>
  s === 'active' ? { label: 'Em dia', variant: 'success' as const }
  : s === 'expired' ? { label: 'Vencida', variant: 'danger' as const }
  : s === 'suspended' ? { label: 'Suspensa', variant: 'warning' as const }
  : { label: 'Sem plano', variant: 'muted' as const };

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface AdminDriversScreenProps {
  onBack: () => void;
  onDriverDetail?: (driverId: string) => void;
}

const AdminDriversScreen: React.FC<AdminDriversScreenProps> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<typeof STATUS_FILTERS[number]>('Todos');
  const [selected, setSelected] = useState<AdminDriver | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setDrivers(await getAdminDrivers(300)); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar motoristas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => drivers.filter((d) => {
    const matchSearch = (d.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      activeFilter === 'Todos' ||
      (activeFilter === 'Verificados' && d.is_verified) ||
      (activeFilter === 'Pendentes' && !d.is_verified) ||
      (activeFilter === 'Inadimplentes' && d.subscription_status === 'expired') ||
      (activeFilter === 'Online' && d.status === 'online');
    return matchSearch && matchFilter;
  }), [drivers, search, activeFilter]);

  const doVerify = async (approve: boolean) => {
    if (!selected || acting) return;
    setActing(true);
    try {
      await verifyDriver(selected.driver_id, approve);
      // Optimistic local update
      setDrivers((prev) => prev.map((d) => d.driver_id === selected.driver_id
        ? { ...d, is_verified: approve, documents_status: approve ? 'approved' : 'rejected' }
        : d));
      setSelected(null);
      Alert.alert(approve ? 'Motorista aprovado' : 'Motorista rejeitado', approve
        ? 'O motorista já pode ficar online e receber corridas.'
        : 'O cadastro foi marcado como rejeitado.');
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível atualizar o motorista.');
    } finally {
      setActing(false);
    }
  };

  const vehicleText = (d: AdminDriver) =>
    [d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') || 'Sem veículo';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Motoristas</Text>
        <Badge label={`${drivers.length}`} variant="primary" size="md" />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar motorista..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[styles.chip, activeFilter === f && styles.chipActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && drivers.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}><Text style={styles.retryTxt}>Tentar novamente</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        >
          {filtered.length === 0 && (
            <Text style={styles.emptyTxt}>Nenhum motorista encontrado</Text>
          )}
          {filtered.map((driver) => {
            const sub = subBadge(driver.subscription_status);
            return (
              <TouchableOpacity key={driver.driver_id} onPress={() => setSelected(driver)} activeOpacity={0.8}>
                <Card style={styles.driverCard}>
                  <View style={styles.driverHeader}>
                    <Avatar name={driver.full_name ?? 'Motorista'} size={48} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName}>{driver.full_name ?? 'Motorista'}</Text>
                      <View style={styles.driverMeta}>
                        <Car size={12} color={Colors.textMuted} />
                        <Text style={styles.driverMetaText} numberOfLines={1}>{vehicleText(driver)}</Text>
                      </View>
                      <View style={styles.driverMeta}>
                        <Phone size={12} color={Colors.textMuted} />
                        <Text style={styles.driverMetaText}>{driver.phone ?? '—'}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Badge label={sub.label} variant={sub.variant} />
                      {driver.is_verified
                        ? <Badge label="Verificado" variant="success" />
                        : <Badge label="Pendente" variant="warning" />}
                    </View>
                  </View>

                  <View style={styles.driverStats}>
                    <View style={styles.driverStat}>
                      <Navigation size={13} color={Colors.textMuted} />
                      <Text style={styles.driverStatText}>{driver.total_rides} corridas</Text>
                    </View>
                    <View style={styles.driverStat}>
                      <Star size={13} color={Colors.warning} fill={Colors.warning} />
                      <Text style={styles.driverStatText}>{(driver.rating ?? 5).toFixed(1)}</Text>
                    </View>
                    <ChevronRight size={14} color={Colors.textMuted} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Detalhes do motorista</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailTop}>
                  <Avatar name={selected.full_name ?? 'Motorista'} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{selected.full_name ?? 'Motorista'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {selected.is_verified
                        ? <Badge label="Verificado" variant="success" />
                        : <Badge label="Pendente" variant="warning" />}
                      <Badge label={subBadge(selected.subscription_status).label} variant={subBadge(selected.subscription_status).variant} />
                    </View>
                  </View>
                </View>

                {[
                  { lbl: 'Telefone', val: selected.phone ?? '—' },
                  { lbl: 'Avaliação', val: `${(selected.rating ?? 5).toFixed(1)} estrelas` },
                  { lbl: 'Corridas', val: String(selected.total_rides) },
                  { lbl: 'Status', val: selected.status === 'online' ? 'Online' : selected.status === 'on_ride' ? 'Em corrida' : 'Offline' },
                  { lbl: 'Documentos', val: selected.documents_status === 'approved' ? 'Aprovados' : selected.documents_status === 'pending' ? 'Em análise' : 'Rejeitados' },
                  { lbl: 'Veículo', val: [selected.vehicle_model, selected.vehicle_color, selected.vehicle_year].filter(Boolean).join(' ') || '—' },
                  { lbl: 'Placa', val: selected.vehicle_plate ?? '—' },
                  { lbl: 'Assinatura', val: subBadge(selected.subscription_status).label },
                  { lbl: 'Vencimento', val: fmtDate(selected.subscription_due) },
                ].map((row) => (
                  <View key={row.lbl} style={styles.detailRow}>
                    <Text style={styles.detailLbl}>{row.lbl}</Text>
                    <Text style={styles.detailVal} numberOfLines={1}>{row.val}</Text>
                  </View>
                ))}

                {/* Actions */}
                <View style={styles.actionRow}>
                  {!selected.is_verified ? (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.success }]} onPress={() => doVerify(true)} disabled={acting} activeOpacity={0.85}>
                      <ShieldCheck size={17} color="#fff" />
                      <Text style={styles.actionTxt}>{acting ? 'Aprovando...' : 'Aprovar motorista'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.danger }]} onPress={() => doVerify(false)} disabled={acting} activeOpacity={0.85}>
                      <Ban size={17} color="#fff" />
                      <Text style={styles.actionTxt}>{acting ? 'Processando...' : 'Revogar verificação'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, height: 34 },
  chipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  chipText: { ...Typography.smallMedium, color: Colors.textMuted },
  chipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  emptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center', paddingVertical: 40 },
  errorTxt: { ...Typography.bodyMedium, color: Colors.danger, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  retryTxt: { ...Typography.smallMedium, color: Colors.primary },
  driverCard: { padding: 14 },
  driverHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  driverName: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: 4 },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  driverMetaText: { ...Typography.caption, color: Colors.textMuted, flex: 1 },
  driverStats: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  driverStat: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  driverStatText: { ...Typography.small, color: Colors.textSecondary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailName: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLbl: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  detailVal: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, maxWidth: '60%' },
  actionRow: { marginTop: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, paddingVertical: 15 },
  actionTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' },
});

export default AdminDriversScreen;
