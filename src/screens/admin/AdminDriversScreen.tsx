import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
} from 'react-native';
import {
  ChevronLeft,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  User,
  Car,
  Phone,
  Star,
  Navigation,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

const DRIVERS = [
  { id: '1', name: 'Carlos Mendes', phone: '(65) 9 9101-2020', vehicle: 'Toyota Corolla Prata', rides: 342, rating: 4.9, status: 'active', subscription: 'active' },
  { id: '2', name: 'Roberto Lima', phone: '(65) 9 8222-3344', vehicle: 'Honda HB20 Preto', rides: 128, rating: 4.7, status: 'active', subscription: 'active' },
  { id: '3', name: 'André Santos', phone: '(65) 9 7333-4455', vehicle: 'Fiat Argo Branco', rides: 67, rating: 4.5, status: 'pending', subscription: 'pending' },
  { id: '4', name: 'João Oliveira', phone: '(65) 9 6444-5566', vehicle: 'VW Polo Cinza', rides: 215, rating: 4.8, status: 'active', subscription: 'overdue' },
  { id: '5', name: 'Pedro Costa', phone: '(65) 9 5555-6677', vehicle: 'Chevrolet Onix Vermelho', rides: 0, rating: 0, status: 'blocked', subscription: 'expired' },
];

const STATUS_FILTERS = ['Todos', 'Ativos', 'Pendentes', 'Inadimplentes', 'Bloqueados'];

const subscriptionConfig = {
  active: { label: 'Em dia', variant: 'success' as const },
  pending: { label: 'Aguardando', variant: 'warning' as const },
  overdue: { label: 'Atrasado', variant: 'danger' as const },
  expired: { label: 'Expirado', variant: 'muted' as const },
};

interface AdminDriversScreenProps {
  onBack: () => void;
  onDriverDetail: (driverId: string) => void;
}

const AdminDriversScreen: React.FC<AdminDriversScreenProps> = ({ onBack, onDriverDetail }) => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos');

  const filtered = DRIVERS.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      activeFilter === 'Todos' ||
      (activeFilter === 'Ativos' && d.status === 'active') ||
      (activeFilter === 'Pendentes' && d.status === 'pending') ||
      (activeFilter === 'Inadimplentes' && d.subscription === 'overdue') ||
      (activeFilter === 'Bloqueados' && d.status === 'blocked');
    return matchSearch && matchFilter;
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Motoristas</Text>
        <Badge label={`${DRIVERS.length}`} variant="primary" size="md" />
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
        <TouchableOpacity style={styles.filterBtn}>
          <Filter size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, activeFilter === f && styles.chipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.map((driver) => {
          const sub = subscriptionConfig[driver.subscription as keyof typeof subscriptionConfig];
          return (
            <TouchableOpacity
              key={driver.id}
              onPress={() => onDriverDetail(driver.id)}
            >
              <Card style={styles.driverCard}>
                <View style={styles.driverHeader}>
                  <Avatar name={driver.name} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{driver.name}</Text>
                    <View style={styles.driverMeta}>
                      <Car size={12} color={Colors.textMuted} />
                      <Text style={styles.driverMetaText}>{driver.vehicle}</Text>
                    </View>
                    <View style={styles.driverMeta}>
                      <Phone size={12} color={Colors.textMuted} />
                      <Text style={styles.driverMetaText}>{driver.phone}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Badge label={sub.label} variant={sub.variant} />
                    {driver.status === 'blocked' && <Badge label="Bloqueado" variant="danger" />}
                    {driver.status === 'pending' && <Badge label="Pendente" variant="warning" />}
                  </View>
                </View>

                <View style={styles.driverStats}>
                  <View style={styles.driverStat}>
                    <Navigation size={13} color={Colors.textMuted} />
                    <Text style={styles.driverStatText}>{driver.rides} corridas</Text>
                  </View>
                  {driver.rating > 0 && (
                    <View style={styles.driverStat}>
                      <Star size={13} color={Colors.warning} fill={Colors.warning} />
                      <Text style={styles.driverStatText}>{driver.rating}</Text>
                    </View>
                  )}
                  <ChevronRight size={14} color={Colors.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 4, marginBottom: 8 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  filterBtn: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { ...Typography.smallMedium, color: Colors.textMuted },
  chipTextActive: { color: Colors.white },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  driverCard: { padding: 14 },
  driverHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  driverName: { ...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: 4 },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  driverMetaText: { ...Typography.caption, color: Colors.textMuted },
  driverStats: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  driverStat: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  driverStatText: { ...Typography.small, color: Colors.textSecondary },
});

export default AdminDriversScreen;
