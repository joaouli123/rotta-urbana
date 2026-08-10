import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalendarDays, ChevronLeft, MapPin, Navigation, Route, XCircle } from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getManagerRides, type ManagerRide } from '../../services/manager';

interface Props { onBack: () => void; }
type Filter = 'all' | 'completed' | 'active' | 'cancelled';

const statusLabel: Record<string, string> = {
  searching: 'Buscando', driver_found: 'Motorista encontrado', driver_on_way: 'A caminho',
  driver_arrived: 'Chegou', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
};

function money(value: number | null): string {
  return `R$ ${(value ?? 0).toFixed(2).replace('.', ',')}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ManagerRidesScreen: React.FC<Props> = ({ onBack }) => {
  const [rides, setRides] = useState<ManagerRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRides(await getManagerRides(400)); } catch { setRides([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rides.filter((ride) => {
    if (filter === 'completed') return ride.status === 'completed';
    if (filter === 'cancelled') return ride.status === 'cancelled';
    if (filter === 'active') return !['completed', 'cancelled'].includes(ride.status);
    return true;
  }), [filter, rides]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}><ChevronLeft size={23} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Corridas da rede</Text><Text style={styles.subtitle}>Histórico restrito ao seu escopo</Text></View>
        <Navigation size={21} color={Colors.primary} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {([
          ['all', 'Todas'], ['active', 'Ativas'], ['completed', 'Concluídas'], ['cancelled', 'Canceladas'],
        ] as [Filter, string][]).map(([key, label]) => <TouchableOpacity key={key} style={[styles.filter, filter === key && styles.filterActive]} onPress={() => setFilter(key)}><Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text></TouchableOpacity>)}
      </ScrollView>
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}>
          <Text style={styles.count}>{filtered.length} corrida(s) no período carregado</Text>
          {filtered.length === 0 && <View style={styles.empty}><Route size={36} color={Colors.textMuted} /><Text style={styles.emptyText}>Nenhuma corrida encontrada.</Text></View>}
          {filtered.map((ride) => <Card key={ride.ride_id} style={styles.card} padding={14}>
            <View style={styles.cardTop}>
              <View style={[styles.statusDot, { backgroundColor: ride.status === 'completed' ? Colors.success : ride.status === 'cancelled' ? Colors.danger : Colors.warning }]} />
              <Text style={styles.status}>{statusLabel[ride.status] ?? ride.status}</Text>
              <Text style={styles.date}>{dateTime(ride.requested_at)}</Text>
            </View>
            <View style={styles.personRow}><Text style={styles.personLabel}>Passageiro</Text><Text style={styles.personValue}>{ride.passenger_name ?? '—'}</Text></View>
            <View style={styles.personRow}><Text style={styles.personLabel}>Motorista</Text><Text style={styles.personValue}>{ride.driver_name ?? '—'}</Text></View>
            <View style={styles.routeRow}><MapPin size={14} color={Colors.primary} /><Text style={styles.routeText} numberOfLines={1}>{ride.origin_address}</Text></View>
            <View style={styles.routeRow}><MapPin size={14} color={Colors.danger} /><Text style={styles.routeText} numberOfLines={1}>{ride.destination_address}</Text></View>
            <View style={styles.footer}><View style={styles.meta}><CalendarDays size={13} color={Colors.textMuted} /><Text style={styles.metaText}>{ride.ride_type}</Text></View><View style={styles.meta}><Route size={13} color={Colors.textMuted} /><Text style={styles.metaText}>{ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : '—'}</Text></View><Text style={styles.price}>{money(ride.price)}</Text></View>
          </Card>)}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h5, color: Colors.textPrimary }, subtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  filters: { padding: 16, gap: 8 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border }, filterActive: { backgroundColor: Colors.dark, borderColor: Colors.dark }, filterText: { ...Typography.caption, color: Colors.textMuted }, filterTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 }, count: { ...Typography.caption, color: Colors.textMuted },
  card: { gap: 9 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, statusDot: { width: 8, height: 8, borderRadius: 4 }, status: { ...Typography.smallMedium, color: Colors.textPrimary, flex: 1 }, date: { ...Typography.caption, color: Colors.textMuted },
  personRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, personLabel: { ...Typography.caption, color: Colors.textMuted }, personValue: { ...Typography.caption, color: Colors.textPrimary, maxWidth: '65%' }, routeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, routeText: { ...Typography.small, color: Colors.textSecondary, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 9 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metaText: { ...Typography.caption, color: Colors.textMuted }, price: { ...Typography.smallMedium, color: Colors.primary, marginLeft: 'auto' }, empty: { alignItems: 'center', padding: 50, gap: 10 }, emptyText: { ...Typography.small, color: Colors.textMuted },
});

export default ManagerRidesScreen;
