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
  Image,
} from 'react-native';
import {
  ChevronLeft,
  Search,
  CheckCircle,
  ChevronRight,
  Phone,
  Star,
  X,
  ShieldCheck,
  Ban,
  MapPin,
  FileText,
  Camera,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { supabase } from '../../lib/supabase';
import type { ProfileRow } from '../../types/db';

interface AdminPassengersScreenProps {
  onBack: () => void;
}

const AdminPassengersScreen: React.FC<AdminPassengersScreenProps> = ({ onBack }) => {
  const [passengers, setPassengers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [acting, setActing] = useState(false);

  // Document URLs
  const [rgUrl, setRgUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'passenger')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setPassengers(data || []);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar passageiros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load document signed URLs on-demand
  useEffect(() => {
    if (selected) {
      setLoadingDocs(true);
      setRgUrl(null);
      setSelfieUrl(null);
      (async () => {
        try {
          if (selected.doc_rg_path) {
            const { data: signedRg } = await supabase.storage
              .from('driver-docs')
              .createSignedUrl(selected.doc_rg_path, 3600);
            setRgUrl(signedRg?.signedUrl ?? null);
          }
          if (selected.doc_selfie_path) {
            const { data: signedSelfie } = await supabase.storage
              .from('driver-docs')
              .createSignedUrl(selected.doc_selfie_path, 3600);
            setSelfieUrl(signedSelfie?.signedUrl ?? null);
          }
        } catch (err) {
          console.warn('Erro ao carregar documentos do passageiro:', err);
        } finally {
          setLoadingDocs(false);
        }
      })();
    }
  }, [selected]);

  const toggleActive = async () => {
    if (!selected) return;
    setActing(true);
    const newValue = !selected.is_active;
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ is_active: newValue })
        .eq('id', selected.id);
      if (updateErr) throw updateErr;

      setSelected((prev) => (prev ? { ...prev, is_active: newValue } : prev));
      setPassengers((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, is_active: newValue } : p))
      );
      Alert.alert('Sucesso', `Passageiro ${newValue ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Erro ao atualizar status.');
    } finally {
      setActing(false);
    }
  };

  const filtered = useMemo(() => {
    return passengers.filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        p.full_name.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      );
    });
  }, [passengers, search]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Passageiros</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholderTextColor={Colors.textMuted}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Carregando passageiros...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nenhum passageiro encontrado.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />
          }
        >
          {filtered.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelected(p)}
              activeOpacity={0.8}
            >
              <Card style={styles.passengerCard}>
                <Avatar name={p.full_name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.passengerName} numberOfLines={1}>{p.full_name}</Text>
                  <Text style={styles.passengerMeta} numberOfLines={1}>
                    {p.email || 'Sem e-mail'}
                  </Text>
                  <Text style={styles.passengerMeta} numberOfLines={1}>
                    {p.phone || 'Sem telefone'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {p.is_active ? (
                    <Badge label="Ativo" variant="success" />
                  ) : (
                    <Badge label="Bloqueado" variant="danger" />
                  )}
                  <ChevronRight size={16} color={Colors.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Detalhes do passageiro</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
                <View style={styles.detailTop}>
                  <Avatar name={selected.full_name} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{selected.full_name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {selected.is_active ? (
                        <Badge label="Ativo" variant="success" />
                      ) : (
                        <Badge label="Bloqueado" variant="danger" />
                      )}
                    </View>
                  </View>
                </View>

                {/* Personal Information */}
                <Text style={styles.sectionTitle}>Informações Pessoais</Text>
                {[
                  { lbl: 'E-mail', val: selected.email ?? '—' },
                  { lbl: 'Telefone', val: selected.phone ?? '—' },
                  { lbl: 'Gênero', val: selected.gender === 'female' ? 'Feminino' : selected.gender === 'male' ? 'Masculino' : selected.gender === 'other' ? 'Outro' : '—' },
                  { lbl: 'Avaliação', val: `${(selected.rating ?? 5).toFixed(1)} estrelas` },
                  { lbl: 'Registrado em', val: new Date(selected.created_at).toLocaleDateString('pt-BR') },
                ].map((row) => (
                  <View key={row.lbl} style={styles.detailRow}>
                    <Text style={styles.detailLbl}>{row.lbl}</Text>
                    <Text style={styles.detailVal}>{row.val}</Text>
                  </View>
                ))}

                {/* Address Information */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Endereço Residencial</Text>
                {selected.address_cep ? (
                  <>
                    {[
                      { lbl: 'CEP', val: selected.address_cep },
                      { lbl: 'Rua', val: selected.address_street ?? '—' },
                      { lbl: 'Número', val: selected.address_number ?? '—' },
                      { lbl: 'Complemento', val: selected.address_complement || '—' },
                      { lbl: 'Bairro', val: selected.address_neighborhood ?? '—' },
                      { lbl: 'Cidade/UF', val: `${selected.address_city ?? '—'} / ${selected.address_state ?? '—'}` },
                    ].map((row) => (
                      <View key={row.lbl} style={styles.detailRow}>
                        <Text style={styles.detailLbl}>{row.lbl}</Text>
                        <Text style={styles.detailVal}>{row.val}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.noDataText}>Nenhum endereço cadastrado para este passageiro.</Text>
                )}

                {/* Document Information */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Documentos Enviados</Text>
                {selected.doc_rg_path || selected.doc_selfie_path ? (
                  loadingDocs ? (
                    <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
                  ) : (
                    <View style={styles.docsContainer}>
                      {selected.doc_rg_path && (
                        <View style={styles.docItem}>
                          <Text style={styles.docItemTitle}>RG ou Identidade</Text>
                          {rgUrl ? (
                            <Image source={{ uri: rgUrl }} style={styles.docImage} resizeMode="contain" />
                          ) : (
                            <View style={styles.docPlaceholder}>
                              <FileText size={32} color={Colors.textMuted} />
                              <Text style={styles.docPlaceholderText}>Documento Privado</Text>
                            </View>
                          )}
                        </View>
                      )}
                      
                      {selected.doc_selfie_path && (
                        <View style={styles.docItem}>
                          <Text style={styles.docItemTitle}>Selfie de Verificação</Text>
                          {selfieUrl ? (
                            <Image source={{ uri: selfieUrl }} style={styles.docImage} resizeMode="contain" />
                          ) : (
                            <View style={styles.docPlaceholder}>
                              <Camera size={32} color={Colors.textMuted} />
                              <Text style={styles.docPlaceholderText}>Documento Privado</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )
                ) : (
                  <Text style={styles.noDataText}>Nenhum documento anexado.</Text>
                )}

                {/* Administrative Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: selected.is_active ? Colors.danger : Colors.success }]}
                    onPress={toggleActive}
                    disabled={acting}
                    activeOpacity={0.85}
                  >
                    {selected.is_active ? <Ban size={17} color="#fff" /> : <ShieldCheck size={17} color="#fff" />}
                    <Text style={styles.actionTxt}>
                      {acting ? 'Processando...' : selected.is_active ? 'Bloquear passageiro' : 'Ativar passageiro'}
                    </Text>
                  </TouchableOpacity>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h4, color: Colors.textPrimary },
  searchContainer: { padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    height: 40, borderRadius: Radius.md, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, ...Typography.small, color: Colors.textPrimary, padding: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { ...Typography.small, color: Colors.textSecondary, marginTop: 8 },
  errorText: { ...Typography.small, color: Colors.danger, marginBottom: 12, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.primary },
  retryBtnText: { ...Typography.smallMedium, color: '#fff', fontFamily: 'Poppins_700Bold' },
  emptyText: { ...Typography.small, color: Colors.textMuted },
  listContent: { padding: 12, gap: 10 },
  passengerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  passengerName: { ...Typography.bodyMedium, color: Colors.textPrimary, fontFamily: 'Poppins_700Bold' },
  passengerMeta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 1 },

  // Detail modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, height: '85%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetTitle: { ...Typography.h4, color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { padding: 16 },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  detailName: { ...Typography.bodyMedium, color: Colors.textPrimary, fontFamily: 'Poppins_700Bold' },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontFamily: 'Poppins_700Bold', marginBottom: 10, marginTop: 6 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailLbl: { ...Typography.small, color: Colors.textSecondary },
  detailVal: { ...Typography.smallMedium, color: Colors.textPrimary },
  noDataText: { ...Typography.small, color: Colors.textMuted, fontStyle: 'italic', marginVertical: 8 },
  actionRow: { marginTop: 24, marginBottom: 32 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: Radius.lg,
  },
  actionTxt: { ...Typography.bodyMedium, color: '#fff', fontFamily: 'Poppins_700Bold' },

  // Documents
  docsContainer: { gap: 16, marginTop: 8 },
  docItem: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 12, backgroundColor: Colors.background },
  docItemTitle: { ...Typography.small, color: Colors.textPrimary, fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  docImage: { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: '#f0f0f0' },
  docPlaceholder: { width: '100%', height: 120, borderRadius: Radius.md, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', gap: 6 },
  docPlaceholderText: { ...Typography.caption, color: Colors.textMuted, fontFamily: 'Poppins_700Bold' },
});

export default AdminPassengersScreen;
