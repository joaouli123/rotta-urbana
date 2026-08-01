import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  Search,
  MapPin,
  Clock,
  Star,
  Navigation,
  Bell,
  User,
  ChevronRight,
  Home,
  Briefcase,
} from 'lucide-react-native';
import { Card, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RouteMap, { type DriverPin } from '../../components/RouteMap';
import { nearbyDrivers } from '../../services/drivers';
import { getRideHistory } from '../../services/rides';
import { useAuth } from '../../contexts/AuthContext';

const { height } = Dimensions.get('window');

const RECENT_PLACES = [
  { id: '1', name: 'Shopping Sinop', address: 'Av. Cel. João Ponce de Arruda, 1065', icon: Clock },
  { id: '2', name: 'Hospital Regional', address: 'Av. das Figueiras, 940', icon: Clock },
  { id: '3', name: 'Aeroporto Sinop', address: 'Rod. MT-170, Km 4', icon: Clock },
];

interface PassengerHomeProps {
  onRequestRide: (destination: string) => void;
  onNotifications: () => void;
  onProfile: () => void;
}

const PassengerHomeScreen: React.FC<PassengerHomeProps> = ({
  onRequestRide,
  onNotifications,
  onProfile,
}) => {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [searchFocused, setSearchFocused] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [drivers, setDrivers] = useState<DriverPin[]>([]);
  const [recents, setRecents] = useState<{ id: string; name: string; address: string }[]>([]);

  // Destinos recentes (do histórico de corridas).
  useEffect(() => {
    getRideHistory(12).then((rides) => {
      const seen = new Set<string>();
      const list = rides
        .filter((r) => r.destination_address && !seen.has(r.destination_address) && seen.add(r.destination_address))
        .slice(0, 4)
        .map((r) => ({ id: r.id, name: r.destination_address.split(',')[0], address: r.destination_address }));
      setRecents(list);
    }).catch(() => {});
  }, []);

  // Pega a localização do passageiro e os motoristas online por perto.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        // 1) posição rápida (última conhecida) pra centralizar o mapa na hora
        const last = await Location.getLastKnownPositionAsync();
        if (active && last) setCoords([last.coords.longitude, last.coords.latitude]);
        // 2) posição precisa
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!active) return;
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setCoords(c);
        try {
          const near = await nearbyDrivers(c[1], c[0], 8000);
          if (active) setDrivers(near.map((d) => ({ id: d.driver_id, lng: d.lng, lat: d.lat, heading: d.heading })));
        } catch { /* sem motoristas por perto */ }
      } catch { /* localização indisponível */ }
    })();
    return () => { active = false; };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Mapa ao vivo (Mapbox no dev build; placeholder no Expo Go) */}
      <RouteMap
        origin={coords ?? undefined}
        drivers={drivers}
        followUser
        paddingTop={insets.top + 80}
        paddingBottom={Math.round(height * 0.5)}
        style={styles.mapContainer}
      />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity onPress={onProfile} style={styles.avatarBtn}>
          <Avatar name={profile?.full_name ?? 'Passageiro'} size={40} />
        </TouchableOpacity>
        <View style={{ width: 40 }} />
        <TouchableOpacity onPress={onNotifications} style={styles.notifBtn}>
          <Bell size={22} color={Colors.textPrimary} />
          <View style={styles.notifBadge} />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {/* Handle */}
        <View style={styles.handle} />

        <Text style={styles.greeting}>Para onde vamos?</Text>

        {/* Search Bar */}
        <TouchableOpacity
          style={[styles.searchBar, searchFocused && styles.searchBarFocused]}
          onPress={() => onRequestRide('')}
          activeOpacity={0.8}
        >
          <View style={styles.searchDot} />
          <Text style={styles.searchPlaceholder}>Buscar destino...</Text>
          <Search size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Recent Places */}
        <Text style={styles.sectionTitle}>Recentes</Text>
        {(recents.length ? recents : RECENT_PLACES).map((place) => (
          <TouchableOpacity
            key={place.id}
            style={styles.recentItem}
            onPress={() => onRequestRide(place.address)}
          >
            <View style={styles.recentIcon}>
              <Clock size={16} color={Colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentName}>{place.name}</Text>
              <Text style={styles.recentAddr} numberOfLines={1}>{place.address}</Text>
            </View>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mapContainer: { ...StyleSheet.absoluteFillObject },
  mapGradient: { flex: 1, overflow: 'hidden' },
  mapLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.04)' },
  mapLineH: { left: 0, right: 0, height: 1 },
  mapLineV: { top: 0, bottom: 0, width: 1 },
  mapPin: { position: 'absolute', top: '40%', left: '50%', alignItems: 'center', transform: [{ translateX: -20 }] },
  mapPinInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  mapPinShadow: {
    width: 12, height: 6, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.3)', marginTop: 2,
  },
  mapLabel: { position: 'absolute', top: '38%', right: 24, ...Typography.small, color: 'rgba(255,255,255,0.4)' },
  topBar: {
    position: 'absolute', top: 52, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  avatarBtn: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card + 'EE', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  locationText: { ...Typography.smallMedium, color: Colors.textPrimary },
  notifBtn: {
    position: 'relative',
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card + 'EE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger,
  },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 65,
    borderTopRightRadius: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: '#76C442',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 20,
    maxHeight: height * 0.58,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  greeting: { ...Typography.h4, color: Colors.textPrimary, marginBottom: 14, marginLeft: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 16,
  },
  searchBarFocused: { borderColor: Colors.primary },
  searchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  searchPlaceholder: { ...Typography.body, color: Colors.textMuted, flex: 1 },
  quickRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  quickCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  quickIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  quickName: { ...Typography.smallMedium, color: Colors.textPrimary },
  quickAddr: { ...Typography.caption, color: Colors.textMuted, width: 80 },
  sectionTitle: { ...Typography.overline, color: Colors.textMuted, marginBottom: 8 },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  recentIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  recentName: { ...Typography.bodyMedium, color: Colors.textPrimary },
  recentAddr: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
});

export default PassengerHomeScreen;
