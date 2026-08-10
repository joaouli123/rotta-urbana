import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  ChevronLeft,
  Edit3,
  MapPin,
  Network,
  Plus,
  Search,
  Shield,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react-native';
import { Avatar, Badge, Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import {
  configureManager,
  createManagerAccount,
  getManagerScope,
  getAdminDrivers,
  listManagers,
  removeManager,
  setManagerActive,
  type AdminDriver,
  type CreateManagerAccountInput,
  type Manager,
} from '../../services/admin';

interface Props {
  onBack: () => void;
}

type ManagerType = 'city' | 'network';
type FormSource = 'driver' | 'new';

const DRIVER_FILTERS = ['Todos', 'Verificados', 'Pendentes'] as const;

function driverVehicle(driver: AdminDriver): string {
  return [driver.vehicle_model, driver.vehicle_plate].filter(Boolean).join(' · ') || 'Veículo não informado';
}

const AdminManagersNetworkScreen: React.FC<Props> = ({ onBack }) => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [source, setSource] = useState<FormSource>('driver');
  const [managerType, setManagerType] = useState<ManagerType>('city');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState<(typeof DRIVER_FILTERS)[number]>('Todos');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState('');
  const [cities, setCities] = useState<string[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [managerRows, driverRows] = await Promise.all([listManagers(), getAdminDrivers(500)]);
      setManagers(managerRows);
      setDrivers(driverRows);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível carregar a rede de gerentes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingProfileId(null);
    setSource('driver');
    setManagerType('city');
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setDriverSearch('');
    setDriverFilter('Todos');
    setSelectedProfileId(null);
    setSelectedDriverIds([]);
    setCityInput('');
    setCities([]);
  };

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = async (manager: Manager) => {
    setSaving(true);
    try {
      const scope = await getManagerScope(manager.profile_id);
      setEditingProfileId(manager.profile_id);
      setSource('driver');
      setManagerType(scope.manager_type);
      setFullName(manager.full_name);
      setEmail(manager.email ?? '');
      setPhone(manager.phone ?? '');
      setSelectedProfileId(manager.profile_id);
      setSelectedDriverIds(scope.driver_ids ?? []);
      setCities(scope.cities ?? []);
      setModalVisible(true);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível carregar o escopo do gerente.');
    } finally {
      setSaving(false);
    }
  };

  const addCity = () => {
    const city = cityInput.trim().replace(/\s+/g, ' ');
    if (!city) return;
    if (!cities.some((item) => item.toLowerCase() === city.toLowerCase())) {
      setCities((current) => [...current, city]);
    }
    setCityInput('');
  };

  const toggleDriver = (driverId: string) => {
    setSelectedDriverIds((current) => current.includes(driverId)
      ? current.filter((id) => id !== driverId)
      : [...current, driverId]);
  };

  const selectExistingDriver = (driver: AdminDriver) => {
    setSelectedProfileId(driver.driver_id);
    setFullName(driver.full_name ?? '');
    setPhone(driver.phone ?? '');
    setSelectedDriverIds((current) => current.includes(driver.driver_id) ? current : [...current, driver.driver_id]);
  };

  const visibleDrivers = useMemo(() => drivers.filter((driver) => {
    const query = driverSearch.trim().toLowerCase();
    const matchesSearch = !query || [driver.full_name, driver.phone, driver.vehicle_plate, driver.vehicle_model]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    const matchesFilter = driverFilter === 'Todos'
      || (driverFilter === 'Verificados' && driver.is_verified)
      || (driverFilter === 'Pendentes' && !driver.is_verified);
    return matchesSearch && matchesFilter;
  }).slice(0, 80), [drivers, driverFilter, driverSearch]);

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
    resetForm();
  };

  const save = async () => {
    if (managerType === 'city' && cities.length === 0 && selectedDriverIds.length === 0) {
      Alert.alert('Escopo obrigatório', 'Informe ao menos uma cidade ou vincule um motorista.');
      return;
    }
    if (source === 'driver' && !selectedProfileId) {
      Alert.alert('Selecione um motorista', 'Escolha um motorista do cadastro para transformar em gerente.');
      return;
    }
    if (source === 'new' && (!fullName.trim() || !email.trim() || password.length < 8)) {
      Alert.alert('Dados incompletos', 'Informe nome, e-mail e uma senha com pelo menos 8 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (source === 'new') {
        const input: CreateManagerAccountInput = {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          managerType,
          cities,
          driverIds: selectedDriverIds,
        };
        await createManagerAccount(input);
      } else {
        await configureManager({
          profileId: selectedProfileId!,
          managerType,
          cities,
          driverIds: selectedDriverIds,
        });
      }
      await load(true);
      closeModal();
      Alert.alert('Gerente salvo', source === 'new'
        ? 'O login foi criado e já pode ser usado pelo gerente.'
        : 'O motorista agora tem acesso ao painel gerencial.');
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível salvar o gerente.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (manager: Manager) => {
    Alert.alert(
      manager.is_active ? 'Desativar gerente' : 'Reativar gerente',
      `${manager.is_active ? 'Suspender' : 'Reativar'} o acesso de ${manager.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: manager.is_active ? 'Desativar' : 'Reativar',
          style: manager.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await setManagerActive(manager.profile_id, !manager.is_active);
              await load(true);
            } catch (error: any) {
              Alert.alert('Erro', error?.message ?? 'Não foi possível alterar o status.');
            }
          },
        },
      ],
    );
  };

  const remove = (manager: Manager) => {
    Alert.alert(
      'Remover gerente',
      `Remover o acesso de gerente de ${manager.full_name}? Se ele era motorista, o perfil de motorista será restaurado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeManager(manager.profile_id);
              await load(true);
            } catch (error: any) {
              Alert.alert('Erro', error?.message ?? 'Não foi possível remover o gerente.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={onBack}>
          <ChevronLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Gerentes da rede</Text>
          <Text style={styles.subtitle}>Acessos, cidades e grupos de motoristas</Text>
        </View>
        <TouchableOpacity style={styles.addIcon} onPress={openCreate}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          <TouchableOpacity style={styles.primaryButton} onPress={openCreate} activeOpacity={0.85}>
            <Plus size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Criar gerente ou promover motorista</Text>
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <Network size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Dois níveis de operação</Text>
              <Text style={styles.infoText}>Gerentes locais veem suas cidades e motoristas vinculados. Gerentes de rede acompanham toda a operação.</Text>
            </View>
          </View>

          {managers.length === 0 ? (
            <View style={styles.empty}>
              <Shield size={42} color={Colors.primary} />
              <Text style={styles.emptyTitle}>Nenhum gerente ainda</Text>
              <Text style={styles.emptyText}>Crie um login novo ou transforme um motorista cadastrado em gerente.</Text>
            </View>
          ) : managers.map((manager) => (
            <Card key={manager.profile_id} style={styles.managerCard} padding={14}>
              <View style={styles.managerTop}>
                <Avatar name={manager.full_name} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.managerName}>{manager.full_name}</Text>
                  <Text style={styles.managerEmail} numberOfLines={1}>{manager.email ?? 'E-mail não informado'}</Text>
                </View>
                <Badge label={manager.is_active ? 'Ativo' : 'Inativo'} variant={manager.is_active ? 'success' : 'danger'} />
              </View>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Network size={12} color={Colors.primary} /><Text style={styles.tagText}>{manager.manager_type === 'network' ? 'Gerente de rede' : 'Gerente local'}</Text></View>
                <View style={styles.tag}><Users size={12} color={Colors.info} /><Text style={styles.tagText}>{manager.explicit_driver_count ?? 0} vínculos diretos</Text></View>
              </View>
              <View style={styles.cityLine}>
                <MapPin size={14} color={Colors.textMuted} />
                <Text style={styles.cityText} numberOfLines={2}>
                  {manager.manager_type === 'network' && (!manager.cities || manager.cities.length === 0)
                    ? 'Toda a rede'
                    : (manager.cities ?? []).map((city) => city.city).join(' · ') || 'Somente motoristas vinculados'}
                </Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.secondaryAction} onPress={() => openEdit(manager)}>
                  <Edit3 size={15} color={Colors.textSecondary} /><Text style={styles.secondaryActionText}>Editar escopo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryAction} onPress={() => toggleActive(manager)}>
                  <Shield size={15} color={Colors.textSecondary} /><Text style={styles.secondaryActionText}>{manager.is_active ? 'Desativar' : 'Reativar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteAction} onPress={() => remove(manager)}>
                  <Trash2 size={15} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{editingProfileId ? 'Editar gerente' : 'Novo gerente'}</Text>
                <Text style={styles.sheetSubtitle}>Defina o login e o escopo de administração</Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={closeModal}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!editingProfileId && (
                <View style={styles.segmentRow}>
                  <TouchableOpacity style={[styles.segment, source === 'driver' && styles.segmentActive]} onPress={() => setSource('driver')}>
                    <UserRound size={16} color={source === 'driver' ? '#fff' : Colors.textSecondary} />
                    <Text style={[styles.segmentText, source === 'driver' && styles.segmentTextActive]}>Motorista cadastrado</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.segment, source === 'new' && styles.segmentActive]} onPress={() => setSource('new')}>
                    <Plus size={16} color={source === 'new' ? '#fff' : Colors.textSecondary} />
                    <Text style={[styles.segmentText, source === 'new' && styles.segmentTextActive]}>Criar novo login</Text>
                  </TouchableOpacity>
                </View>
              )}

              {source === 'new' && !editingProfileId ? (
                <>
                  <Text style={styles.sectionLabel}>Dados de acesso</Text>
                  <TextInput style={styles.input} placeholder="Nome completo" placeholderTextColor={Colors.textMuted} value={fullName} onChangeText={setFullName} />
                  <TextInput style={styles.input} placeholder="E-mail de login" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                  <TextInput style={styles.input} placeholder="Telefone (opcional)" placeholderTextColor={Colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <TextInput style={styles.input} placeholder="Senha temporária (mínimo 8 caracteres)" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Selecionar motorista do cadastro</Text>
                  {selectedProfileId ? (
                    <View style={styles.selectedPerson}>
                      <Avatar name={fullName || 'Motorista'} size={36} />
                      <View style={{ flex: 1 }}><Text style={styles.selectedName}>{fullName}</Text><Text style={styles.selectedMeta}>{phone || 'Telefone não informado'}</Text></View>
                      {!editingProfileId && <TouchableOpacity onPress={() => { setSelectedProfileId(null); setFullName(''); setPhone(''); }}><X size={18} color={Colors.textMuted} /></TouchableOpacity>}
                    </View>
                  ) : null}
                  {!editingProfileId && (
                    <>
                      <View style={styles.searchBox}><Search size={16} color={Colors.textMuted} /><TextInput style={styles.searchInput} placeholder="Buscar motorista por nome, telefone ou placa" placeholderTextColor={Colors.textMuted} value={driverSearch} onChangeText={setDriverSearch} /></View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                        {DRIVER_FILTERS.map((filter) => <TouchableOpacity key={filter} style={[styles.filterChip, driverFilter === filter && styles.filterChipActive]} onPress={() => setDriverFilter(filter)}><Text style={[styles.filterText, driverFilter === filter && styles.filterTextActive]}>{filter}</Text></TouchableOpacity>)}
                      </ScrollView>
                      <View style={styles.driverPicker}>
                        {visibleDrivers.slice(0, 12).map((driver) => (
                          <TouchableOpacity key={driver.driver_id} style={[styles.driverOption, selectedProfileId === driver.driver_id && styles.driverOptionSelected]} onPress={() => selectExistingDriver(driver)}>
                            <Avatar name={driver.full_name} size={32} />
                            <View style={{ flex: 1 }}><Text style={styles.driverOptionName} numberOfLines={1}>{driver.full_name}</Text><Text style={styles.driverOptionMeta} numberOfLines={1}>{driverVehicle(driver)}</Text></View>
                            {selectedProfileId === driver.driver_id && <Check size={18} color={Colors.primary} />}
                          </TouchableOpacity>
                        ))}
                        {visibleDrivers.length === 0 && <Text style={styles.emptyPicker}>Nenhum motorista encontrado.</Text>}
                      </View>
                    </>
                  )}
                </>
              )}

              <Text style={styles.sectionLabel}>Nível de acesso</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity style={[styles.segment, managerType === 'city' && styles.segmentActive]} onPress={() => setManagerType('city')}><MapPin size={16} color={managerType === 'city' ? '#fff' : Colors.textSecondary} /><Text style={[styles.segmentText, managerType === 'city' && styles.segmentTextActive]}>Gerente local</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.segment, managerType === 'network' && styles.segmentActive]} onPress={() => setManagerType('network')}><Network size={16} color={managerType === 'network' ? '#fff' : Colors.textSecondary} /><Text style={[styles.segmentText, managerType === 'network' && styles.segmentTextActive]}>Gerente de rede</Text></TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Cidades vinculadas</Text>
              <View style={styles.cityInputRow}><TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Ex.: Sinop" placeholderTextColor={Colors.textMuted} value={cityInput} onChangeText={setCityInput} onSubmitEditing={addCity} autoCapitalize="words" /><TouchableOpacity style={styles.smallAdd} onPress={addCity}><Plus size={18} color="#fff" /></TouchableOpacity></View>
              <View style={styles.chipsWrap}>{cities.map((city) => <TouchableOpacity key={city} style={styles.cityChip} onPress={() => setCities((current) => current.filter((item) => item !== city))}><MapPin size={12} color={Colors.primary} /><Text style={styles.cityChipText}>{city}</Text><X size={13} color={Colors.textMuted} /></TouchableOpacity>)}</View>
              {managerType === 'network' && <Text style={styles.hint}>Gerente de rede sem cidades específicas acompanha toda a operação.</Text>}

              <Text style={styles.sectionLabel}>Motoristas vinculados diretamente ({selectedDriverIds.length})</Text>
              <Text style={styles.hint}>Além das cidades, você pode adicionar motoristas específicos ao grupo. O vínculo por cidade usa a cidade de atuação cadastrada pelo motorista.</Text>
              <View style={styles.driverPicker}>
                {visibleDrivers.slice(0, 18).map((driver) => {
                  const selected = selectedDriverIds.includes(driver.driver_id);
                  return <TouchableOpacity key={`link-${driver.driver_id}`} style={[styles.driverOption, selected && styles.driverOptionSelected]} onPress={() => toggleDriver(driver.driver_id)}><Avatar name={driver.full_name} size={30} /><View style={{ flex: 1 }}><Text style={styles.driverOptionName} numberOfLines={1}>{driver.full_name}</Text><Text style={styles.driverOptionMeta} numberOfLines={1}>{driverVehicle(driver)}{driver.operating_city ? ` · ${driver.operating_city}` : ''}</Text></View><View style={[styles.checkbox, selected && styles.checkboxActive]}>{selected && <Check size={14} color="#fff" />}</View></TouchableOpacity>;
                })}
              </View>

              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{editingProfileId ? 'Salvar alterações' : 'Criar gerente'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  addIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { ...Typography.h5, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 42 },
  primaryButton: { minHeight: 50, borderRadius: Radius.md, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { ...Typography.bodyMedium, color: '#fff' },
  infoCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: Radius.md, backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary + '30' },
  infoTitle: { ...Typography.smallMedium, color: Colors.textPrimary, marginBottom: 3 },
  infoText: { ...Typography.caption, color: Colors.textSecondary, lineHeight: 17 },
  empty: { alignItems: 'center', padding: 42, gap: 10 },
  emptyTitle: { ...Typography.bodyMedium, color: Colors.textPrimary },
  emptyText: { ...Typography.small, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
  managerCard: { gap: 12 },
  managerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  managerName: { ...Typography.bodyMedium, color: Colors.textPrimary },
  managerEmail: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 6 },
  tagText: { ...Typography.caption, color: Colors.textSecondary },
  cityLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cityText: { ...Typography.small, color: Colors.textSecondary, flex: 1 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, flex: 1 },
  secondaryActionText: { ...Typography.caption, color: Colors.textSecondary },
  deleteAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  sheetTitle: { ...Typography.h5, color: Colors.textPrimary },
  sheetSubtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  form: { gap: 10, paddingBottom: 24 },
  sectionLabel: { ...Typography.overline, color: Colors.textMuted, marginTop: 7 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minHeight: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  segmentActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  segmentText: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  segmentTextActive: { color: '#fff' },
  input: { minHeight: 46, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 13, color: Colors.textPrimary, ...Typography.small },
  selectedPerson: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: Radius.md, backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary + '35' },
  selectedName: { ...Typography.smallMedium, color: Colors.textPrimary },
  selectedMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  searchBox: { minHeight: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, ...Typography.small },
  filterRow: { gap: 7, paddingVertical: 2 },
  filterChip: { borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  filterText: { ...Typography.caption, color: Colors.textMuted },
  filterTextActive: { color: '#fff' },
  driverPicker: { maxHeight: 240, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  driverOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  driverOptionSelected: { backgroundColor: Colors.primary + '10' },
  driverOptionName: { ...Typography.smallMedium, color: Colors.textPrimary },
  driverOptionMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  emptyPicker: { ...Typography.small, color: Colors.textMuted, textAlign: 'center', padding: 18 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cityInputRow: { flexDirection: 'row', gap: 8 },
  smallAdd: { width: 46, minHeight: 46, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cityChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, backgroundColor: Colors.primary + '12', paddingHorizontal: 10, paddingVertical: 7 },
  cityChipText: { ...Typography.caption, color: Colors.textPrimary },
  hint: { ...Typography.caption, color: Colors.textMuted, lineHeight: 17 },
  saveButton: { minHeight: 50, marginTop: 10, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { ...Typography.bodyMedium, color: '#fff' },
  cancelButton: { alignItems: 'center', paddingVertical: 12 },
  cancelButtonText: { ...Typography.smallMedium, color: Colors.textMuted },
});

export default AdminManagersNetworkScreen;
