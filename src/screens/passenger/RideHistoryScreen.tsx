import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  ChevronLeft,
  MapPin,
  Clock,
  Star,
  Navigation,
  Filter,
} from 'lucide-react-native';
import { Card, Badge } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

const RIDES = [
  {
    id: '1',
    destination: 'Shopping Sinop',
    origin: 'Rua das Palmeiras, 220',
    date: 'Hoje, 14:32',
    price: 'R$ 14,00',
    distance: '2.1 km',
    duration: '12 min',
    status: 'completed',
    rating: 5,
    driver: 'Carlos M.',
  },
  {
    id: '2',
    destination: 'Hospital Regional',
    origin: 'Av. das Castanheiras, 555',
    date: 'Ontem, 09:15',
    price: 'R$ 22,50',
    distance: '3.4 km',
    duration: '18 min',
    status: 'completed',
    rating: 4,
    driver: 'André S.',
  },
  {
    id: '3',
    destination: 'Terminal Rodoviário',
    origin: 'Rua das Palmeiras, 220',
    date: '23/05, 16:00',
    price: 'R$ 11,00',
    distance: '1.8 km',
    duration: '9 min',
    status: 'cancelled',
    rating: 0,
    driver: '—',
  },
  {
    id: '4',
    destination: 'UNEMAT Sinop',
    origin: 'Av. das Castanheiras, 555',
    date: '22/05, 07:45',
    price: 'R$ 19,00',
    distance: '4.5 km',
    duration: '22 min',
    status: 'completed',
    rating: 5,
    driver: 'Roberto L.',
  },
];

interface RideHistoryScreenProps {
  onBack: () => void;
}

const RideHistoryScreen: React.FC<RideHistoryScreenProps> = ({ onBack }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Histórico</Text>
        <TouchableOpacity style={styles.filterBtn}>
          <Filter size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>24</Text>
          <Text style={styles.statLabel}>Corridas</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>R$ 312</Text>
          <Text style={styles.statLabel}>Total gasto</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>4.9</Text>
          <Text style={styles.statLabel}>Avaliação</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {RIDES.map((ride) => (
          <Card key={ride.id} style={styles.rideCard}>
            <View style={styles.rideHeader}>
              <View style={styles.rideIconWrap}>
                <Navigation size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rideDestination}>{ride.destination}</Text>
                <Text style={styles.rideDate}>{ride.date}</Text>
              </View>
              <Badge
                label={ride.status === 'completed' ? 'Concluída' : 'Cancelada'}
                variant={ride.status === 'completed' ? 'success' : 'danger'}
              />
            </View>

            <View style={styles.rideMeta}>
              <View style={styles.rideOriginRow}>
                <MapPin size={13} color={Colors.textMuted} />
                <Text style={styles.rideOrigin}>{ride.origin}</Text>
              </View>
              <View style={styles.rideStatsRow}>
                <Text style={styles.rideStat}>{ride.distance}</Text>
                <Text style={styles.rideStatDot}>•</Text>
                <Text style={styles.rideStat}>{ride.duration}</Text>
                <Text style={styles.rideStatDot}>•</Text>
                <Text style={styles.rideStat}>Motorista: {ride.driver}</Text>
              </View>
            </View>

            <View style={styles.rideFooter}>
              {ride.status === 'completed' && ride.rating > 0 && (
                <View style={styles.rideRating}>
                  {Array.from({ length: ride.rating }).map((_, i) => (
                    <Star key={i} size={12} color={Colors.warning} fill={Colors.warning} />
                  ))}
                </View>
              )}
              <Text style={styles.ridePrice}>{ride.price}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 16,
  },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { ...Typography.h4, color: Colors.primary },
  statLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  rideCard: { padding: 16 },
  rideHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  rideIconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  rideDestination: { ...Typography.bodyMedium, color: Colors.textPrimary },
  rideDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  rideMeta: { paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  rideOriginRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rideOrigin: { ...Typography.small, color: Colors.textSecondary },
  rideStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rideStat: { ...Typography.caption, color: Colors.textMuted },
  rideStatDot: { ...Typography.caption, color: Colors.textMuted },
  rideFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rideRating: { flexDirection: 'row', gap: 2 },
  ridePrice: { ...Typography.h5, color: Colors.primary },
});

export default RideHistoryScreen;
