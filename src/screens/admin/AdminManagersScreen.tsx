import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal,
} from 'react-native';
import {
  ArrowLeft, UserPlus, MapPin, Trash2, Shield, Mail, Phone, Edit3,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import {
  listManagers, upsertManager, removeManager, findUserByEmail,
  type Manager, type UserSearchResult,
} from '../../services/admin';

interface Props {
  onBack: () => void;
}

const AdminManagersScreen: React.FC<Props> = ({ onBack }) => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  const [searchEmail, setSearchEmail] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundUser, setFoundUser] = useState<UserSearchResult | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [city, setCity] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const data = await listManagers();
      setManagers(data);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível carregar os gerentes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // ─── Search user ──────────────────────────────────────────────────────────
  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    setFoundUser(null);
    setSearchDone(false);
    try {
      const result = await findUserByEmail(searchEmail.trim());
      setFoundUser(result);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Erro ao buscar usuário.');
    } finally {
      setSearchLoading(false);
      setSearchDone(true);
    }
  };

  // ─── Confirm add manager ─────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!foundUser) return;
    if (!city.trim()) {
      Alert.alert('Atenção', 'Informe a cidade de atuação do gerente.');
      return;
    }
    setSubmitting(true);
    try {
      await upsertManager(foundUser.id, city.trim());
      await load();
      closeModal();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível adicionar o gerente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Remove manager ───────────────────────────────────────────────────────
  const handleRemove = (manager: Manager) => {
    Alert.alert(
      'Remover gerente',
      `Remover acesso de gerente de ${manager.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeManager(manager.profile_id);
              await load();
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Não foi possível remover o gerente.');
            }
          },
        },
      ],
    );
  };

  // ─── Modal helpers ────────────────────────────────────────────────────────
  const openModal = () => {
    setSearchEmail('');
    setFoundUser(null);
    setSearchDone(false);
    setCity('');
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setSearchEmail('');
    setFoundUser(null);
    setSearchDone(false);
    setCity('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Gerentes</Text>
          <Text style={styles.subtitle}>Controle de acesso por cidade</Text>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Add button */}
          <TouchableOpacity style={styles.addButton} onPress={openModal}>
            <UserPlus size={18} color={Colors.white} />
            <Text style={styles.addButtonText}>Adicionar gerente</Text>
          </TouchableOpacity>

          {/* Empty state */}
          {managers.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Shield size={40} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum gerente cadastrado</Text>
              <Text style={styles.emptyDescription}>
                Adicione gerentes para delegar o controle de operações por cidade.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {managers.map((manager) => (
                <Card key={manager.profile_id} style={styles.managerCard} padding={14}>
                  <View style={styles.managerRow}>
                    {/* Shield icon */}
                    <View style={styles.shieldIconWrapper}>
                      <Shield size={20} color={Colors.primary} />
                    </View>

                    {/* Manager info */}
                    <View style={styles.managerInfo}>
                      <Text style={styles.managerName} numberOfLines={1}>
                        {manager.full_name}
                      </Text>

                      {!!manager.email && (
                        <View style={styles.metaRow}>
                          <Mail size={11} color={Colors.textMuted} />
                          <Text style={styles.metaText} numberOfLines={1}>
                            {manager.email}
                          </Text>
                        </View>
                      )}

                      {!!manager.phone && (
                        <View style={styles.metaRow}>
                          <Phone size={11} color={Colors.textMuted} />
                          <Text style={styles.metaText}>{manager.phone}</Text>
                        </View>
                      )}

                      {/* City + status row */}
                      <View style={styles.tagsRow}>
                        {!!manager.city && (
                          <View style={styles.cityTag}>
                            <MapPin size={11} color={Colors.primary} />
                            <Text style={styles.cityTagText}>{manager.city}</Text>
                          </View>
                        )}
                        <View style={[
                          styles.statusBadge,
                          manager.is_active ? styles.statusActive : styles.statusInactive,
                        ]}>
                          <Text style={[
                            styles.statusText,
                            manager.is_active ? styles.statusTextActive : styles.statusTextInactive,
                          ]}>
                            {manager.is_active ? 'Ativo' : 'Inativo'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Remove button */}
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemove(manager)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Manager Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adicionar Gerente</Text>

            {/* Email search */}
            <Text style={styles.inputLabel}>E-mail do usuário</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.textInput, styles.searchInput]}
                placeholder="usuario@email.com"
                placeholderTextColor={Colors.textMuted}
                value={searchEmail}
                onChangeText={(v) => {
                  setSearchEmail(v);
                  // Reset search result when user edits the field
                  if (searchDone) {
                    setFoundUser(null);
                    setSearchDone(false);
                  }
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!searchLoading}
                returnKeyType="search"
                onSubmitEditing={handleSearchUser}
              />
              <TouchableOpacity
                style={[
                  styles.searchButton,
                  (!searchEmail.trim() || searchLoading) && styles.searchButtonDisabled,
                ]}
                onPress={handleSearchUser}
                disabled={searchLoading || !searchEmail.trim()}
              >
                {searchLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.searchButtonText}>Buscar</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Found user card */}
            {searchDone && foundUser !== null && (
              <View style={styles.foundUserCard}>
                <View style={styles.foundUserRow}>
                  <View style={styles.foundUserIconWrapper}>
                    <Shield size={16} color={Colors.primary} />
                  </View>
                  <View style={styles.foundUserInfo}>
                    <Text style={styles.foundUserName}>{foundUser.full_name}</Text>
                    <Text style={styles.foundUserEmail}>{foundUser.email}</Text>
                    {!!foundUser.role && (
                      <Text style={styles.foundUserRole}>Perfil atual: {foundUser.role}</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Not found message */}
            {searchDone && foundUser === null && (
              <View style={styles.notFoundRow}>
                <Text style={styles.notFoundText}>Usuário não encontrado</Text>
              </View>
            )}

            {/* City input */}
            <Text style={[styles.inputLabel, styles.cityLabel]}>Cidade de atuação</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ex: São Paulo"
              placeholderTextColor={Colors.textMuted}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />

            {/* Confirm */}
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!foundUser || submitting) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!foundUser || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={closeModal}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default AdminManagersScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    ...Typography.h5,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Center loader
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },

  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
    alignSelf: 'flex-end',
  },
  addButtonText: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    ...Typography.h5,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyDescription: {
    ...Typography.small,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Manager list
  list: {
    gap: 10,
  },
  managerCard: {
    borderColor: Colors.border,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shieldIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerInfo: {
    flex: 1,
    gap: 3,
  },
  managerName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  cityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  cityTagText: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusActive: {
    backgroundColor: Colors.success + '22',
  },
  statusInactive: {
    backgroundColor: Colors.border,
  },
  statusText: {
    ...Typography.captionMedium,
    fontWeight: '600',
  },
  statusTextActive: {
    color: Colors.success,
  },
  statusTextInactive: {
    color: Colors.textMuted,
  },
  removeButton: {
    padding: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '90%',
  },
  modalTitle: {
    ...Typography.h5,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  inputLabel: {
    ...Typography.smallMedium,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  cityLabel: {
    marginTop: 14,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Typography.small,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  searchInput: {
    flex: 1,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  searchButtonDisabled: {
    backgroundColor: Colors.primary + '66',
  },
  searchButtonText: {
    ...Typography.smallMedium,
    color: Colors.white,
    fontWeight: '600',
  },

  // Found user card
  foundUserCard: {
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    borderRadius: Radius.md,
    padding: 12,
    marginTop: 10,
    marginBottom: 2,
  },
  foundUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  foundUserIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundUserInfo: {
    flex: 1,
    gap: 2,
  },
  foundUserName: {
    ...Typography.smallMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  foundUserEmail: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  foundUserRole: {
    ...Typography.caption,
    color: Colors.primary,
  },

  // Not found
  notFoundRow: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  notFoundText: {
    ...Typography.small,
    color: Colors.danger,
  },

  // Modal action buttons
  confirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.primary + '55',
  },
  confirmButtonText: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
});
