import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  ChevronLeft,
  Search,
  X,
  ShieldCheck,
  XCircle,
  Car,
  Phone,
  Star,
  Navigation,
  ChevronRight,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getAdminDrivers, verifyDriver, type AdminDriver } from '../../services/admin';

type FilterKey = 'Todos' | 'Pendentes' | 'Verificados';
const FILTERS: FilterKey[] = ['Todos', 'Pendentes', 'Verificados'];

function vehicleText(d: AdminDriver): string {
  return [d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') || 'Sem veículo';
}

function docLabel(s: string): string {
  if (s === 'approved') return 'Aprovados';
  if (s === 'pending') return 'Em análise';
  if (s === 'rejected') return 'Rejeitados';
  return s;
}

interface Props {
  onBack: () => void;
}

const ManagerDriversScreen: React.FC<Props> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('Todos');
  const [selected, setSelected] = useState<AdminDriver | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDrivers(await getAdminDrivers(300)); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => drivers.filter((d) => {
    const matchSearch = (d.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'Todos' ||
      (filter === 'Pendentes' && !d.is_verified) ||
      (filter === 'Verificados' && d.is_verified);
    return matchSearch && matchFilter;
  }), [drivers, search, filter]);

  const pendingCount = useMemo(() => drivers.filter((d) => !d.is_verified).length, [drivers]);

  const doVerify = async (approve: boolean) => {
    if (!selected || acting) return;
    setActing(true);
    try {
      await verifyDriver(selected.driver_id, approve);
      setDrivers((prev) =>
        prev.map((d) =>
          d.driver_id === selected.driver_id
            ? { ...d, is_verified: approve, documents_status: approve ? 'approved' : 'rejected' }
            : d,
        ),
      );
      setSelected(null);
      Alert.alert(
        approve ? 'Motorista aprovado' : 'Motorista rejeitado',
        approve
          ? 'O motorista já pode ficar online e receber corridas.'
          : 'O cadastro foi marcado como rejeitado.',
      );
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível atualizar o motorista.');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>Motoristas</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingPillText}>{pendingCount} pendentes</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
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

      {/* ── Filter chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f}
              {f === 'Pendentes' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && drivers.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        >
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>Nenhum motorista encontrado</Text>
          )}
          {filtered.map((driver) => (
            <TouchableOpacity key={driver.driver_id} onPress={() => setSelected(driver)} activeOpacity={0.8}>
              <Card style={styles.driverCard}>
                <View style={styles.driverHeader}>
                  <Avatar name={driver.full_name ?? 'Motorista'} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{driver.full_name ?? 'Motorista'}</Text>
                    <View style={styles.metaRow}>
                      <Car size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText} numberOfLines={1}>{vehicleText(driver)}</Text>
                    </View>
                    {driver.vehicle_plate ? (
                      <View style={styles.metaRow}>
                        <Text style={styles.plateText}>{driver.vehicle_plate}</Text>
                      </View>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Phone size={12} color={Colors.textMuted} />
                      <Text style={styles.metaText}>{driver.phone ?? '—'}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {driver.is_verified
                      ? <Badge label="Verificado" variant="success" />
                      : <Badge label="Pendente" variant="warning" />}
                  </View>
                </View>

                <View style={styles.driverFooter}>
                  <View style={styles.statItem}>
                    <Navigation size={13} color={Colors.textMuted} />
                    <Text style={styles.statText}>{driver.total_rides} corridas</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Star size={13} color={Colors.warning} fill={Colors.warning} />
                    <Text style={styles.statText}>{(driver.rating ?? 5).toFixed(1)}</Text>
                  </View>
                  <ChevronRight size={14} color={Colors.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Detail modal ── */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Detalhes do motorista</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Driver top */}
                <View style={styles.detailTop}>
                  <Avatar name={selected.full_name ?? 'Motorista'} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{selected.full_name ?? 'Motorista'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {selected.is_verified
                        ? <Badge label="Verificado" variant="success" size="md" />
                        : <Badge label="Pendente" variant="warning" size="md" />}
                    </View>
                  </View>
                </View>

                {/* Detail rows */}
                {[
                  { lbl: 'Telefone', val: selected.phone ?? '—' },
                  { lbl: 'Avaliação', val: `${(selected.rating ?? 5).toFixed(1)} estrelas` },
                  { lbl: 'Total de corridas', val: String(selected.total_rides) },
                  { lbl: 'Status', val: selected.status === 'online' ? 'Online' : selected.status === 'on_ride' ? 'Em corrida' : 'Offline' },
                  { lbl: 'Documentos', val: docLabel(selected.documents_status) },
                  { lbl: 'Veículo', val: [selected.vehicle_model, selected.vehicle_color, selected.vehicle_year].filter(Boolean).join(' ') || '—' },
                  { lbl: 'Placa', val: selected.vehicle_plate ?? '—' },
                ].map((row) => (
                  <View key={row.lbl} style={styles.detailRow}>
                    <Text style={styles.detailLbl}>{row.lbl}</Text>
                    <Text style={styles.detailVal} numberOfLines={1}>{row.val}</Text>
                  </View>
                ))}

                {/* Action buttons — only show if not verified */}
                {!selected.is_verified ? (
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: Colors.success }]}
                      onPress={() => doVerify(true)}
                      disabled={acting}
                      activeOpacity={0.85}
                    >
                      <ShieldCheck size={17} color="#fff" />
                      <Text style={styles.modalBtnText}>
                        {acting ? 'Aprovando...' : 'Aprovar'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: Colors.danger }]}
                      onPress={() => doVerify(false)}
                      disabled={acting}
                      activeOpacity={0.85}
                    >
                      <XCircle size={17} color="#fff" />
                      <Text style={styles.modalBtnText}>
                        {acting ? 'Rejeitando...' : 'Rejeitar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.verifiedNote}>
                    <ShieldCheck size={16} color={Colors.success} />
                    <Text style={styles.verifiedNoteText}>Motorista verificado — nenhuma ação necessária</Text>
                  </View>
                )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  pendingPill: {
    backgroundColor: Colors.warning + '22', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.warning + '55',
  },
  pendingPillText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.warning },

  searchWrap: { paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary },

  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, height: 34,
  },
  chipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  chipText: { ...Typography.smallMedium, color: Colors.textMuted },
  chipTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  emptyText: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center', paddingVertical: 40 },

  driverCard: { padding: 14 },
  driverHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  driverName: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  metaText: { ...Typography.caption, color: Colors.textMuted, flex: 1 },
  plateText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary, letterSpacing: 1 },

  driverFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  statText: { ...Typography.small, color: Colors.textSecondary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },

  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailName: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  detailLbl: { ...Typography.small, color: Colors.textMuted },
  detailVal: { ...Typography.smallMedium, color: Colors.textPrimary, maxWidth: '60%' },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: Radius.md, paddingVertical: 14,
  },
  modalBtnText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },

  verifiedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 20, padding: 14, borderRadius: Radius.md,
    backgroundColor: Colors.success + '15',
  },
  verifiedNoteText: { ...Typography.small, color: Colors.success, flex: 1 },
});

export default ManagerDriversScreen;
