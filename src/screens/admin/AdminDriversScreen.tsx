import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator, Modal, Alert, RefreshControl, Switch,
} from 'react-native';
import {
  ChevronLeft, Search, CheckCircle, ChevronRight, Car, Phone,
  Star, Navigation, X, ShieldCheck, Ban, Settings, Zap, Clock, AlertCircle,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import {
  getAdminDrivers, verifyDriver, getAppSettings, setApprovalMode,
  setMinVehicleYear, approveAllPending, setCommissionPct, setPlanWeeklyPrice,
  type AdminDriver, type AppSettings,
} from '../../services/admin';

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

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - i);

const AdminDriversScreen: React.FC<AdminDriversScreenProps> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<typeof STATUS_FILTERS[number]>('Todos');
  const [selected, setSelected] = useState<AdminDriver | null>(null);
  const [acting, setActing] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [commissionInput, setCommissionInput] = useState('');
  const [weeklyInput, setWeeklyInput] = useState('');
  const [savingCommission, setSavingCommission] = useState(false);
  const [savingWeekly, setSavingWeekly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setDrivers(await getAdminDrivers(300)); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar motoristas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const s = await getAppSettings();
      setSettings(s);
      setCommissionInput(s.commission_pct != null ? String(s.commission_pct) : '15');
      setWeeklyInput(s.plan_weekly_price != null ? String(s.plan_weekly_price) : '50');
    }
    catch { /* ignore */ }
    finally { setSettingsLoading(false); }
  }, []);

  const openSettings = () => { setShowSettings(true); loadSettings(); };

  const saveCommissionPct = async () => {
    const val = parseFloat(commissionInput.replace(',', '.'));
    if (isNaN(val) || val < 0 || val > 100) {
      Alert.alert('Valor inválido', 'Informe um percentual entre 0 e 100.');
      return;
    }
    setSavingCommission(true);
    try {
      await setCommissionPct(val);
      setSettings((s) => s ? { ...s, commission_pct: val } : s);
      Alert.alert('Salvo', `Comissão definida para ${val}%.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingCommission(false);
    }
  };

  const saveWeeklyPrice = async () => {
    const val = parseFloat(weeklyInput.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      Alert.alert('Valor inválido', 'Informe um valor positivo.');
      return;
    }
    setSavingWeekly(true);
    try {
      await setPlanWeeklyPrice(val);
      setSettings((s) => s ? { ...s, plan_weekly_price: val } : s);
      Alert.alert('Salvo', `Preço semanal definido para R$ ${val.toFixed(2)}.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível salvar.');
    } finally {
      setSavingWeekly(false);
    }
  };

  const toggleMode = async () => {
    if (!settings || togglingMode) return;
    const newMode = settings.driver_approval_mode === 'auto' ? 'manual' : 'auto';
    setTogglingMode(true);
    try {
      await setApprovalMode(newMode);
      setSettings((s) => s ? { ...s, driver_approval_mode: newMode } : s);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível alterar o modo.');
    } finally {
      setTogglingMode(false);
    }
  };

  const changeMinYear = async (year: number) => {
    if (!settings) return;
    try {
      await setMinVehicleYear(year);
      setSettings((s) => s ? { ...s, min_vehicle_year: year } : s);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível alterar o ano mínimo.');
    }
  };

  const doApproveAll = () => {
    const pendingCount = drivers.filter((d) => !d.is_verified).length;
    if (pendingCount === 0) { Alert.alert('Nenhum pendente', 'Não há motoristas aguardando aprovação.'); return; }
    Alert.alert(
      'Aprovar todos',
      `Isso vai aprovar ${pendingCount} motorista(s) pendente(s) sem revisão individual de documentos. Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Aprovar ${pendingCount}`,
          style: 'destructive',
          onPress: async () => {
            setApprovingAll(true);
            try {
              const count = await approveAllPending();
              setDrivers((prev) => prev.map((d) =>
                !d.is_verified ? { ...d, is_verified: true, documents_status: 'approved' } : d));
              Alert.alert('Pronto!', `${count} motorista(s) aprovado(s) com sucesso.`);
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Não foi possível aprovar todos.');
            } finally {
              setApprovingAll(false);
            }
          },
        },
      ],
    );
  };

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

  const pendingCount = useMemo(() => drivers.filter((d) => !d.is_verified).length, [drivers]);

  const doVerify = async (approve: boolean) => {
    if (!selected || acting) return;
    setActing(true);
    try {
      await verifyDriver(selected.driver_id, approve);
      setDrivers((prev) => prev.map((d) => d.driver_id === selected.driver_id
        ? { ...d, is_verified: approve, documents_status: approve ? 'approved' : 'rejected' }
        : d));
      setSelected(null);
      Alert.alert(
        approve ? 'Motorista aprovado ✓' : 'Motorista rejeitado',
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

  const vehicleText = (d: AdminDriver) =>
    [d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') || 'Sem veículo';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>Motoristas</Text>
          <Badge label={`${drivers.length}`} variant="primary" size="md" />
        </View>
        <TouchableOpacity onPress={openSettings} style={styles.settingsBtn}>
          <Settings size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Pending alert banner */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => setActiveFilter('Pendentes')}
          activeOpacity={0.85}
        >
          <AlertCircle size={16} color={Colors.warning} />
          <Text style={styles.pendingBannerText}>
            {pendingCount} motorista(s) aguardando aprovação
          </Text>
          <TouchableOpacity
            style={styles.approveAllBtn}
            onPress={doApproveAll}
            disabled={approvingAll}
            activeOpacity={0.8}
          >
            {approvingAll
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.approveAllTxt}>Aprovar todos</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      )}

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
            <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>
              {f}{f === 'Pendentes' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
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

      {/* ── Detail modal ── */}
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

      {/* ── Settings / Regras modal ── */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Regras de cadastro</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {settingsLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : settings ? (
              <ScrollView showsVerticalScrollIndicator={false}>

                {/* Approval mode toggle */}
                <View style={styles.settingSection}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingIcon}>
                      {settings.driver_approval_mode === 'auto'
                        ? <Zap size={18} color={Colors.primary} />
                        : <Clock size={18} color={Colors.warning} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingLabel}>Modo de aprovação</Text>
                      <Text style={styles.settingDesc}>
                        {settings.driver_approval_mode === 'auto'
                          ? 'Automático — aprovado ao se cadastrar'
                          : 'Manual — admin aprova individualmente'}
                      </Text>
                    </View>
                    <Switch
                      value={settings.driver_approval_mode === 'auto'}
                      onValueChange={toggleMode}
                      disabled={togglingMode}
                      trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                      thumbColor={settings.driver_approval_mode === 'auto' ? Colors.primary : Colors.textMuted}
                    />
                  </View>
                  {settings.driver_approval_mode === 'auto' && (
                    <View style={styles.autoWarning}>
                      <AlertCircle size={14} color={Colors.warning} />
                      <Text style={styles.autoWarningText}>
                        Modo automático não verifica documentos. Use apenas para testes ou se confiar nos cadastros.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Min vehicle year */}
                <View style={styles.settingSection}>
                  <Text style={styles.settingLabel}>Ano mínimo do veículo</Text>
                  <Text style={styles.settingDesc}>
                    Atual: <Text style={{ fontFamily: 'Poppins_700Bold', color: Colors.textPrimary }}>{settings.min_vehicle_year}</Text>
                    {'  ·  '}Lei 13.640/2018 recomenda no máximo 10 anos de uso.
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {YEAR_OPTIONS.map((y) => (
                        <TouchableOpacity
                          key={y}
                          style={[styles.yearChip, settings.min_vehicle_year === y && styles.yearChipActive]}
                          onPress={() => changeMinYear(y)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.yearChipTxt, settings.min_vehicle_year === y && styles.yearChipTxtActive]}>
                            {y}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Bulk approve */}
                <View style={styles.settingSection}>
                  <Text style={styles.settingLabel}>Aprovar todos os pendentes</Text>
                  <Text style={styles.settingDesc}>
                    Aprova todos os motoristas pendentes de uma vez, sem revisão individual dos documentos.
                  </Text>
                  <TouchableOpacity
                    style={[styles.bulkBtn, pendingCount === 0 && { opacity: 0.4 }]}
                    onPress={() => { setShowSettings(false); setTimeout(doApproveAll, 300); }}
                    disabled={pendingCount === 0 || approvingAll}
                    activeOpacity={0.85}
                  >
                    <CheckCircle size={16} color="#fff" />
                    <Text style={styles.bulkBtnTxt}>
                      {pendingCount > 0 ? `Aprovar ${pendingCount} pendente(s)` : 'Nenhum pendente'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Commission % */}
                <View style={styles.settingSection}>
                  <Text style={styles.settingLabel}>Comissão por corrida (%)</Text>
                  <Text style={styles.settingDesc}>
                    Percentual cobrado do motorista por corrida concluída no plano comissão.{'\n'}
                    Atual: <Text style={{ fontFamily: 'Poppins_700Bold', color: Colors.textPrimary }}>
                      {settings.commission_pct ?? 15}%
                    </Text>
                  </Text>
                  <View style={styles.numericRow}>
                    <TextInput
                      style={styles.numericInput}
                      value={commissionInput}
                      onChangeText={setCommissionInput}
                      keyboardType="decimal-pad"
                      placeholder="15"
                      placeholderTextColor={Colors.textMuted}
                      maxLength={5}
                    />
                    <Text style={styles.numericUnit}>%</Text>
                    <TouchableOpacity
                      style={[styles.saveBtn, savingCommission && { opacity: 0.6 }]}
                      onPress={saveCommissionPct}
                      disabled={savingCommission}
                      activeOpacity={0.85}
                    >
                      {savingCommission
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveBtnTxt}>Salvar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Weekly plan price */}
                <View style={styles.settingSection}>
                  <Text style={styles.settingLabel}>Preço plano semanal (R$)</Text>
                  <Text style={styles.settingDesc}>
                    Valor cobrado dos motoristas que escolhem o plano semanal.{'\n'}
                    Atual: <Text style={{ fontFamily: 'Poppins_700Bold', color: Colors.textPrimary }}>
                      R$ {(settings.plan_weekly_price ?? 50).toFixed(2)}
                    </Text>
                  </Text>
                  <View style={styles.numericRow}>
                    <Text style={styles.numericUnit}>R$</Text>
                    <TextInput
                      style={[styles.numericInput, { flex: 1 }]}
                      value={weeklyInput}
                      onChangeText={setWeeklyInput}
                      keyboardType="decimal-pad"
                      placeholder="50,00"
                      placeholderTextColor={Colors.textMuted}
                      maxLength={8}
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, savingWeekly && { opacity: 0.6 }]}
                      onPress={saveWeeklyPrice}
                      disabled={savingWeekly}
                      activeOpacity={0.85}
                    >
                      {savingWeekly
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveBtnTxt}>Salvar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>

              </ScrollView>
            ) : (
              <Text style={[styles.emptyTxt, { paddingVertical: 24 }]}>Erro ao carregar configurações.</Text>
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
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 6,
    backgroundColor: Colors.warning + '18', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.warning + '44',
  },
  pendingBannerText: { ...Typography.small, color: Colors.warning, flex: 1 },
  approveAllBtn: {
    backgroundColor: Colors.success, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 90, alignItems: 'center',
  },
  approveAllTxt: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#fff' },

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

  // Settings modal
  settingSection: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: 4 },
  settingDesc: { ...Typography.small, color: Colors.textMuted, lineHeight: 18 },
  autoWarning: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginTop: 10, padding: 10, borderRadius: Radius.sm,
    backgroundColor: Colors.warning + '15', borderWidth: 1, borderColor: Colors.warning + '44',
  },
  autoWarningText: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.warning, flex: 1, lineHeight: 16 },
  yearChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  yearChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  yearChipTxt: { ...Typography.smallMedium, color: Colors.textMuted },
  yearChipTxtActive: { color: '#fff' },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 14, borderRadius: Radius.md, backgroundColor: Colors.success },
  bulkBtnTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },
  numericRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  numericInput: {
    width: 90, height: 44, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface,
    paddingHorizontal: 12, fontFamily: 'Poppins_400Regular', fontSize: 15,
    color: Colors.textPrimary,
  },
  numericUnit: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveBtnTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' },
});

export default AdminDriversScreen;
