import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  TextInput,
  Dimensions,
} from 'react-native';
import {
  ChevronLeft,
  MapPin,
  Navigation,
  Search,
  Clock,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import RouteMap from '../../components/RouteMap';
import { geocode, getRoute } from '../../services/geo';
import { estimateFares, getRideHistory } from '../../services/rides';
const imgEconomico = require('../../../assets/icons/icone_economico.png');
const imgConforto  = require('../../../assets/icons/icone_conforto.png');
const imgPremium   = require('../../../assets/icons/icone_premium.png');

// ── Car Icons ─────────────────────────────────────────────
const EconomyCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgEconomico} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const ComfortCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgConforto} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const PremiumCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgPremium} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const SUGGESTIONS = [
  { id: '1', name: 'Shopping Sinop', address: 'Av. Cel. Joao Ponce de Arruda, 1065', distance: '2.1 km' },
  { id: '2', name: 'Hospital Regional de Sinop', address: 'Av. das Figueiras, 940', distance: '3.4 km' },
  { id: '3', name: 'Terminal Rodoviario', address: 'Av. dos Pinheiros, 200', distance: '1.8 km' },
  { id: '4', name: 'Aeroporto de Sinop', address: 'Rod. MT-170, Km 4', distance: '7.2 km' },
  { id: '5', name: 'UNEMAT Campus Sinop', address: 'Av. Sinop, 2000', distance: '4.5 km' },
];

const RIDE_TYPES = [
  {
    id: 'economy',
    label: 'Economico',
    desc: 'Veiculo compacto',
    price: 'R$ 14',
    time: '3 min',
    CarIcon: EconomyCar,
    badge: 'Mais barato',
  },
  {
    id: 'comfort',
    label: 'Conforto',
    desc: 'Sedan ou SUV',
    price: 'R$ 18',
    time: '5 min',
    CarIcon: ComfortCar,
    badge: 'Popular',
  },
  {
    id: 'premium',
    label: 'Premium',
    desc: 'Veiculo executivo',
    price: 'R$ 26',
    time: '8 min',
    CarIcon: PremiumCar,
    badge: 'Top',
  },
];

export interface RidePayload {
  originLng: number; originLat: number; originAddress: string;
  destLng: number; destLat: number; destAddress: string;
}

interface RideRequestScreenProps {
  destination?: string;
  onConfirm: (type: string, payload?: RidePayload) => void;
  onBack: () => void;
}

const SINOP: [number, number] = [-55.5024, -11.8642];
const { height: SCREEN_H } = Dimensions.get('window');

const RideRequestScreen: React.FC<RideRequestScreenProps> = ({ destination = '', onConfirm, onBack }) => {
  const insets = useSafeAreaInsets();
  const [selectedDest, setSelectedDest] = useState(destination);
  const [selectedType, setSelectedType] = useState('economy');
  const [step, setStep] = useState<'search' | 'choose'>(destination ? 'choose' : 'search');
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [destAddress, setDestAddress] = useState(destination);
  const [route, setRoute] = useState<{ type: 'LineString'; coordinates: [number, number][] } | null>(null);
  const [fares, setFares] = useState<Record<string, number>>({});
  const [durMin, setDurMin] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; address: string; lng: number; lat: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<{ id: string; name: string; address: string }[]>([]);

  // Driver/passenger origin (GPS).
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setOrigin(SINOP); return; }
        const last = await Location.getLastKnownPositionAsync();
        if (last) setOrigin([last.coords.longitude, last.coords.latitude]);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setOrigin([pos.coords.longitude, pos.coords.latitude]);
      } catch { setOrigin(SINOP); }
    })();
  }, []);

  const computeRouteFares = async (org: [number, number], dc: [number, number]) => {
    const r = await getRoute(org, dc);
    if (r) {
      setRoute(r.geometry);
      setDurMin(r.durationMin);
      setFares(await estimateFares(r.distanceKm, r.durationMin));
    }
  };

  // Resolve a destination by name (geocode) -> coords + route + prices.
  const resolveDest = async (name: string, org: [number, number]) => {
    setResolving(true);
    try {
      const places = await geocode(name, org);
      const p = places[0];
      if (p) {
        setDestCoords([p.lng, p.lat]);
        setDestAddress(p.address || p.name || name);
        await computeRouteFares(org, [p.lng, p.lat]);
      }
    } catch { /* ignore */ } finally { setResolving(false); }
  };

  // Pick a place (from real suggestions or recents) -> go to vehicle choice.
  const selectPlace = async (place: { name: string; address: string; lng?: number; lat?: number }) => {
    setSelectedDest(place.name);
    setQuery('');
    setSuggestions([]);
    setStep('choose');
    if (place.lng != null && place.lat != null && origin) {
      setDestCoords([place.lng, place.lat]);
      setDestAddress(place.address || place.name);
      await computeRouteFares(origin, [place.lng, place.lat]);
    } else if (origin) {
      await resolveDest(place.address || place.name, origin);
    }
  };

  // Auto-resolve a pre-filled destination once we know the origin.
  useEffect(() => {
    if (step === 'choose' && origin && selectedDest && !destCoords) resolveDest(selectedDest, origin);
  }, [step, origin]);

  // Real geocoding search (debounced), biased to the user's location.
  useEffect(() => {
    if (step !== 'search' || query.trim().length < 2 || !origin) { setSuggestions([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const places = await geocode(query, origin);
        setSuggestions(places.map((p, i) => ({ id: String(i), name: p.name, address: p.address, lng: p.lng, lat: p.lat })));
      } catch { setSuggestions([]); } finally { setSearching(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [query, step, origin]);

  // Recent destinations (history) for the empty state.
  useEffect(() => {
    getRideHistory(12).then((rides) => {
      const seen = new Set<string>();
      setRecents(rides
        .filter((r) => r.destination_address && !seen.has(r.destination_address) && seen.add(r.destination_address))
        .slice(0, 5)
        .map((r) => ({ id: r.id, name: r.destination_address.split(',')[0], address: r.destination_address })));
    }).catch(() => {});
  }, []);

  const confirm = () => {
    if (origin && destCoords) {
      onConfirm(selectedType, {
        originLng: origin[0], originLat: origin[1], originAddress: 'Minha localização',
        destLng: destCoords[0], destLat: destCoords[1], destAddress,
      });
    } else {
      onConfirm(selectedType);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Live map with the trip route */}
      <RouteMap
        origin={origin ?? undefined}
        destination={destCoords ?? undefined}
        route={route}
        followUser={!destCoords}
        paddingTop={insets.top + 70}
        paddingBottom={Math.round(SCREEN_H * 0.62)}
        style={styles.mapArea}
      />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.8}>
          <ChevronLeft size={22} color={Colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Solicitar Corrida</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom Panel */}
      <View style={styles.panel}>
        <View style={styles.handleBar} />

        {/* Origin/Dest Fields */}
        <View style={styles.addressRow}>
          {/* Dot indicators */}
          <View style={styles.dotsCol}>
            <View style={[styles.dotCircle, { backgroundColor: Colors.textPrimary }]} />
            <View style={styles.dotLine} />
            <View style={[styles.dotCircle, { backgroundColor: Colors.success }]} />
          </View>

          {/* Fields */}
          <View style={styles.fieldsCol}>
            <View style={styles.addressField}>
              <Text style={styles.addressFieldLabel}>Sua localizacao</Text>
            </View>
            <View style={[styles.addressField, styles.addressFieldDest]}>
              <Search size={14} color={Colors.textMuted} style={{ marginRight: 6 }} />
              {step === 'choose' ? (
                <>
                  <Text style={[styles.addressFieldLabel, styles.addressFieldLabelActive]} numberOfLines={1}>
                    {selectedDest}
                  </Text>
                  <TouchableOpacity onPress={() => { setSelectedDest(''); setDestCoords(null); setRoute(null); setFares({}); setDurMin(null); setStep('search'); }}>
                    <X size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : (
                <TextInput
                  style={[styles.addressFieldLabel, styles.addressFieldLabelActive, { paddingVertical: 0 }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Para onde?"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  returnKeyType="search"
                />
              )}
            </View>
          </View>
        </View>

        {step === 'search' ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>
              {query.trim().length >= 2 ? 'RESULTADOS' : 'DESTINOS RECENTES'}
            </Text>
            {(query.trim().length >= 2 ? suggestions : recents).map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.suggestionItem}
                onPress={() => selectPlace(s)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionIcon}>
                  <MapPin size={16} color={Colors.textPrimary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName}>{s.name}</Text>
                  <Text style={styles.suggestionAddr} numberOfLines={1}>{s.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {query.trim().length >= 2 && searching && (
              <Text style={[styles.suggestionAddr, { textAlign: 'center', marginTop: 12 }]}>Buscando…</Text>
            )}
            {query.trim().length >= 2 && !searching && suggestions.length === 0 && (
              <Text style={[styles.suggestionAddr, { textAlign: 'center', marginTop: 12 }]}>Nenhum lugar encontrado.</Text>
            )}
            {query.trim().length < 2 && recents.length === 0 && (
              <Text style={[styles.suggestionAddr, { textAlign: 'center', marginTop: 12 }]}>Digite o endereço ou local de destino.</Text>
            )}
          </ScrollView>
        ) : (
          <>
            <Text style={styles.sectionLabel}>TIPO DE CORRIDA</Text>
            {RIDE_TYPES.map((type) => {
              const isSelected = selectedType === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.rideTypeCard, isSelected && styles.rideTypeSelected]}
                  onPress={() => setSelectedType(type.id)}
                  activeOpacity={0.8}
                >
                  {/* Car SVG */}
                  <View style={styles.carIconWrap}>
                    <type.CarIcon size={44} />
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.rideTypeName}>{type.label}</Text>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>{type.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rideTypeDesc}>
                      {type.desc}
                    </Text>
                  </View>

                  {/* Time + Price */}
                  <View style={styles.priceCol}>
                    <Text style={styles.rideTypePrice}>
                      {fares[type.id] != null ? `R$ ${fares[type.id].toFixed(2)}` : (resolving ? '…' : type.price)}
                    </Text>
                    <View style={styles.timeRow}>
                      <Clock size={11} color={Colors.textMuted} />
                      <Text style={styles.rideTypeTime}>{durMin ? `~${durMin} min` : type.time}</Text>
                    </View>
                  </View>

                  {/* Selected indicator */}
                  {isSelected && <View style={styles.selectedLine} />}
                </TouchableOpacity>
              );
            })}
            <Button
              title="Confirmar corrida"
              onPress={confirm}
              loading={resolving}
              style={{ marginTop: 16 }}
            />
          </>
        )}
      </View>
    </View>
  );
};

const FIELD_H = 46;
const GAP = 8;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mapArea: { ...StyleSheet.absoluteFillObject },
  mapLine: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  routeLine: {
    position: 'absolute', top: '35%', left: '45%', right: '40%',
    height: 3, borderRadius: 2, opacity: 0.8,
  },
  pin: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  pinOrigin: { bottom: '38%', left: '44%', backgroundColor: Colors.textPrimary },
  pinDest: { top: '32%', right: '38%', backgroundColor: Colors.success },
  topBar: {
    position: 'absolute', top: 52, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  topTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40,
    maxHeight: '68%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 16,
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },

  // ── Address row ──────────────────────────────────────────
  addressRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 20,
    gap: 12,
  },
  dotsCol: {
    width: 12,
    alignItems: 'center',
    paddingTop: (FIELD_H - 12) / 2,
    paddingBottom: (FIELD_H - 12) / 2,
  },
  dotCircle: {
    width: 12, height: 12, borderRadius: 6,
  },
  dotLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginVertical: 4,
    minHeight: GAP,
  },
  fieldsCol: { flex: 1, gap: GAP },
  addressField: {
    height: FIELD_H,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
    flexDirection: 'row', alignItems: 'center',
  },
  addressFieldDest: {
    borderColor: Colors.primary + '88',
    backgroundColor: Colors.primary + '0A',
  },
  addressFieldLabel: {
    fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, flex: 1,
  },
  addressFieldLabelActive: {
    color: Colors.textPrimary, fontFamily: 'Poppins_500Medium',
  },

  // ── Search suggestions ────────────────────────────────────
  sectionLabel: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold',
    color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 12,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  suggestionIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  suggestionName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  suggestionAddr: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  suggestionDist: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },

  // ── Ride type cards ───────────────────────────────────────
  rideTypeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: Radius.md, marginBottom: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: Colors.border,
    overflow: 'hidden', position: 'relative',
  },
  rideTypeSelected: {
    borderColor: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  selectedLine: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: Colors.primary, borderTopLeftRadius: Radius.md,
    borderBottomLeftRadius: Radius.md,
  },
  carIconWrap: {
    width: 60, alignItems: 'center', justifyContent: 'center',
  },
  rideTypeName: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flexShrink: 1 },
  rideTypeDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  selectedBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.xs,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  selectedBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: Colors.textInverse },
  priceCol: { alignItems: 'flex-end', gap: 4, marginLeft: 10, minWidth: 64 },
  rideTypePrice: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rideTypeTime: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
});

export default RideRequestScreen;