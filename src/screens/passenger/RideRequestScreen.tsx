import React, { useState, useEffect, useRef } from 'react';
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
  Switch,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Navigation,
  Search,
  Clock,
  X,
  Banknote,
  CreditCard,
  Check,
  ShieldCheck,
  Flag,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import RouteMap from '../../components/RouteMap';
import PixIcon from '../../components/icons/PixIcon';
import { geocode, getRoute } from '../../services/geo';
import { estimateFares, getRideHistory } from '../../services/rides';
const imgEconomico = require('../../../assets/icons/icone_economico.png');
const imgConforto  = require('../../../assets/icons/icone_conforto.png');
const imgPremium   = require('../../../assets/icons/icone_premium.png');
const imgMoto      = require('../../../assets/icons/icone_moto.png');

// ── Vehicle Icons ─────────────────────────────────────────
const EconomyCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgEconomico} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const ComfortCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgConforto} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const PremiumCar = ({ size = 44 }: { size?: number }) => (
  <Image source={imgPremium} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
);

const MotoVehicle = ({ size = 44 }: { size?: number }) => (
  <Image source={imgMoto} style={{ width: size * 1.9, height: size }} resizeMode="contain" />
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
    id: 'moto',
    label: 'Moto',
    desc: 'Rapido e economico',
    price: 'R$ 9',
    time: '2 min',
    CarIcon: MotoVehicle,
    badge: 'Mais rapido',
  },
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
  paymentMethod: 'pix' | 'cash' | 'card';
  requiresFemaleDriver?: boolean;
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
  const { profile } = useAuth();
  const isFemale = profile?.gender === 'female';
  const [selectedDest, setSelectedDest] = useState(destination);
  const [selectedType, setSelectedType] = useState('economy');
  const [selectedPayment, setSelectedPayment] = useState<'pix' | 'cash' | 'card'>('pix');
  const [preferFemaleDriver, setPreferFemaleDriver] = useState(true);
  const [step, setStep] = useState<'search' | 'choose'>(destination ? 'choose' : 'search');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'origin' | 'destination'>('destination');
  
  interface CreditCardItem {
    id: string;
    number: string;
    name: string;
    expiry: string;
    cvv: string;
  }
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<CreditCardItem | null>(null);
  
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
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
  // Measured bottom-panel height → used to frame the route in the visible map area (like Uber).
  const [panelH, setPanelH] = useState(Math.round(SCREEN_H * 0.5));

  // Drag the handle to collapse/expand the panel (a plain tap still toggles it).
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 30) setIsExpanded(false);
        else if (g.dy < -30) setIsExpanded(true);
        else setIsExpanded((prev) => !prev);
      },
    }),
  ).current;

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
    if (activeSearchField === 'origin') {
      if (place.lng != null && place.lat != null) {
        setOrigin([place.lng, place.lat]);
        if (destCoords) {
          await computeRouteFares([place.lng, place.lat], destCoords);
        }
      }
      setStep('choose');
      setQuery('');
      setSuggestions([]);
    } else {
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
    getRideHistory(20).then((rides) => {
      const seen = new Set<string>();
      setRecents(rides
        .filter((r) => r.destination_address && !seen.has(r.destination_address) && seen.add(r.destination_address))
        .slice(0, 6)
        .map((r) => ({ id: r.id, name: r.destination_address.split(',')[0], address: r.destination_address })));
    }).catch(() => {});
  }, []);

  const confirm = () => {
    if (origin && destCoords) {
      onConfirm(selectedType, {
        originLng: origin[0], originLat: origin[1], originAddress: 'Minha localização',
        destLng: destCoords[0], destLat: destCoords[1], destAddress,
        paymentMethod: selectedPayment,
        requiresFemaleDriver: isFemale && preferFemaleDriver,
      });
    } else {
      onConfirm(selectedType);
    }
  };

  const saveCard = () => {
    if (!cardNumber.trim() || !cardName.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
      Alert.alert('Erro', 'Preencha todos os campos do cartão.');
      return;
    }
    const newCard = {
      id: String(Date.now()),
      number: cardNumber.replace(/\s+/g, ''),
      name: cardName,
      expiry: cardExpiry,
      cvv: cardCvv,
    };
    setCards(prev => [...prev, newCard]);
    setSelectedCard(newCard);
    setSelectedPayment('card');
    
    // Clear inputs
    setCardNumber(''); setCardName(''); setCardExpiry(''); setCardCvv('');
    setShowCardModal(false);
    Alert.alert('Sucesso', 'Cartão cadastrado com sucesso!');
  };

  const renderPaymentModal = () => (
    <Modal
      visible={showPaymentModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowPaymentModal(false)}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalDismiss} 
          activeOpacity={1} 
          onPress={() => setShowPaymentModal(false)} 
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Forma de Pagamento</Text>
          
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            {/* PIX */}
            <TouchableOpacity
              style={[styles.modalPayItem, selectedPayment === 'pix' && styles.modalPayItemActive]}
              onPress={() => { setSelectedPayment('pix'); setSelectedCard(null); setShowPaymentModal(false); }}
              activeOpacity={0.7}
            >
              <View style={[styles.payIconWrap, { backgroundColor: '#32BCAD12' }]}>
                <PixIcon size={24} color="#32BCAD" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalPayName}>PIX</Text>
                <Text style={styles.modalPayDesc}>Chave de transferência rápida (Pix oficial)</Text>
              </View>
              {selectedPayment === 'pix' && <Check size={18} color={Colors.primary} strokeWidth={2.5} />}
            </TouchableOpacity>
            
            {/* Dinheiro */}
            <TouchableOpacity
              style={[styles.modalPayItem, selectedPayment === 'cash' && styles.modalPayItemActive]}
              onPress={() => { setSelectedPayment('cash'); setSelectedCard(null); setShowPaymentModal(false); }}
              activeOpacity={0.7}
            >
              <View style={[styles.payIconWrap, { backgroundColor: Colors.success + '12' }]}>
                <Banknote size={20} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalPayName}>Dinheiro</Text>
                <Text style={styles.modalPayDesc}>Pague direto ao motorista</Text>
              </View>
              {selectedPayment === 'cash' && <Check size={18} color={Colors.primary} strokeWidth={2.5} />}
            </TouchableOpacity>

            {/* Cartões Salvos */}
            {cards.map((c) => {
              const isSelected = selectedPayment === 'card' && selectedCard?.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.modalPayItem, isSelected && styles.modalPayItemActive]}
                  onPress={() => { setSelectedPayment('card'); setSelectedCard(c); setShowPaymentModal(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.payIconWrap, { backgroundColor: Colors.info + '12' }]}>
                    <CreditCard size={20} color={Colors.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalPayName}>Cartão •••• {c.number.slice(-4)}</Text>
                    <Text style={styles.modalPayDesc}>{c.name}</Text>
                  </View>
                  {isSelected && <Check size={18} color={Colors.primary} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}

            {/* Se nenhum cartão salvo, opção padrão */}
            {cards.length === 0 && (
              <TouchableOpacity
                style={[styles.modalPayItem, selectedPayment === 'card' && !selectedCard && styles.modalPayItemActive]}
                onPress={() => { setSelectedPayment('card'); setSelectedCard(null); setShowPaymentModal(false); }}
                activeOpacity={0.7}
              >
                <View style={[styles.payIconWrap, { backgroundColor: Colors.info + '12' }]}>
                  <CreditCard size={20} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalPayName}>Cartão (máquina)</Text>
                  <Text style={styles.modalPayDesc}>Pague na maquininha do motorista</Text>
                </View>
                {selectedPayment === 'card' && !selectedCard && <Check size={18} color={Colors.primary} strokeWidth={2.5} />}
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Adicionar Cartão */}
          <TouchableOpacity 
            style={styles.addCardBtn} 
            onPress={() => { setShowPaymentModal(false); setShowCardModal(true); }}
            activeOpacity={0.8}
          >
            <CreditCard size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.addCardBtnText}>Cadastrar novo cartão de crédito</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderCardModal = () => (
    <Modal
      visible={showCardModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowCardModal(false)}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalDismiss} 
          activeOpacity={1} 
          onPress={() => setShowCardModal(false)} 
        />
        <View style={[styles.modalSheet, { paddingBottom: 40 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Cadastrar Novo Cartão</Text>
          
          <TextInput
            style={styles.cardInput}
            value={cardNumber}
            onChangeText={setCardNumber}
            placeholder="Número do Cartão (16 dígitos)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            maxLength={16}
          />
          <TextInput
            style={styles.cardInput}
            value={cardName}
            onChangeText={setCardName}
            placeholder="Nome do Titular"
            placeholderTextColor="#888"
            autoCapitalize="characters"
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TextInput
              style={[styles.cardInput, { flex: 1 }]}
              value={cardExpiry}
              onChangeText={setCardExpiry}
              placeholder="MM/AA"
              placeholderTextColor="#888"
              keyboardType="numeric"
              maxLength={5}
            />
            <TextInput
              style={[styles.cardInput, { flex: 1 }]}
              value={cardCvv}
              onChangeText={setCardCvv}
              placeholder="CVV"
              placeholderTextColor="#888"
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.saveCardBtn} onPress={saveCard} activeOpacity={0.8}>
            <Text style={styles.saveCardBtnText}>Salvar Cartão</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Live map with the trip route */}
      <RouteMap
        origin={origin ?? undefined}
        destination={destCoords ?? undefined}
        route={route}
        followUser={!destCoords}
        paddingTop={insets.top + 166}
        paddingBottom={Math.min(panelH, Math.round(SCREEN_H * 0.52))}
        style={styles.mapArea}
      />

      {/* Top Bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <TouchableOpacity 
          onPress={() => { if (step === 'search' && destCoords) setStep('choose'); else onBack(); }} 
          style={styles.backBtn} 
          activeOpacity={0.8}
        >
          <ChevronLeft size={22} color={Colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Solicitar Corrida</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Compact route summary over the map */}
      {step === 'choose' && (
        <View style={[styles.routeSummary, { top: insets.top + 54 }]}>
          <TouchableOpacity
            style={styles.routeSummaryRow}
            onPress={() => { setActiveSearchField('origin'); setStep('search'); }}
            activeOpacity={0.8}
          >
            <View style={styles.routeSummaryIcon}>
              <Navigation size={13} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={styles.routeSummaryCopy}>
              <Text style={styles.routeSummaryLabel}>PARTIDA</Text>
              <Text style={styles.routeSummaryValue} numberOfLines={1}>
                {origin ? 'Sua localização' : 'Definir partida'}
              </Text>
            </View>
            <ChevronRight size={16} color="#9A9A9A" />
          </TouchableOpacity>

          <View style={styles.routeSummaryDivider} />

          <TouchableOpacity
            style={styles.routeSummaryRow}
            onPress={() => { setActiveSearchField('destination'); setStep('search'); }}
            activeOpacity={0.8}
          >
            <View style={[styles.routeSummaryIcon, styles.routeSummaryIconDestination]}>
              <Flag size={13} color="#131313" fill="#131313" />
            </View>
            <View style={styles.routeSummaryCopy}>
              <Text style={styles.routeSummaryLabel}>DESTINO</Text>
              <Text style={styles.routeSummaryValue} numberOfLines={1}>
                {selectedDest || 'Para onde?'}
              </Text>
            </View>
            <ChevronRight size={16} color="#9A9A9A" />
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Panel */}
      <KeyboardAvoidingView
        style={[
          styles.panel,
          step === 'search' && styles.panelFullScreen,
          step === 'search' && { paddingTop: insets.top + 8 }
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        onLayout={(e) => {
          if (step !== 'search') {
            setPanelH(e.nativeEvent.layout.height);
          }
        }}
      >
        {step !== 'search' && (
          <View style={styles.handleBarContainer} {...handlePanResponder.panHandlers}>
            <View style={styles.handleBar} />
          </View>
        )}

        {step === 'search' ? (
          <>
            {/* Back Button for Search */}
            <View style={styles.searchHeader}>
              <TouchableOpacity 
                onPress={() => { if (destCoords) setStep('choose'); else onBack(); }}
                style={styles.searchBackBtn}
                activeOpacity={0.7}
              >
                <ChevronLeft size={22} color={Colors.textPrimary} strokeWidth={2.5} />
              </TouchableOpacity>
              <Text style={styles.searchHeaderTitle}>Buscar endereço</Text>
            </View>

            {/* Address Input Row inside Search Overlay */}
            <View style={styles.addressRow}>
              <View style={styles.dotsCol}>
                <View style={[styles.dotCircle, { backgroundColor: Colors.textPrimary }]} />
                <View style={styles.dotLine} />
                <View style={[styles.dotCircle, { backgroundColor: Colors.success }]} />
              </View>

              <View style={styles.fieldsCol}>
                <TouchableOpacity 
                  style={[
                    styles.addressField, 
                    activeSearchField === 'origin' && styles.addressFieldFocused
                  ]}
                  onPress={() => { setActiveSearchField('origin'); setQuery(''); }}
                  activeOpacity={0.9}
                >
                  {activeSearchField === 'origin' ? (
                    <TextInput
                      style={[styles.addressFieldLabel, styles.addressFieldLabelActive, { paddingVertical: 0 }]}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="De onde está partindo?"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      returnKeyType="search"
                    />
                  ) : (
                    <Text style={styles.addressFieldLabelActive} numberOfLines={1}>
                      {origin ? 'Sua localização' : 'Definir partida'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[
                    styles.addressField, 
                    styles.addressFieldDest,
                    activeSearchField === 'destination' && styles.addressFieldFocused
                  ]}
                  onPress={() => { setActiveSearchField('destination'); setQuery(''); }}
                  activeOpacity={0.9}
                >
                  {activeSearchField === 'destination' ? (
                    <TextInput
                      style={[styles.addressFieldLabel, styles.addressFieldLabelActive, { paddingVertical: 0 }]}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Para onde?"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      returnKeyType="search"
                    />
                  ) : (
                    <Text style={styles.addressFieldLabelActive} numberOfLines={1}>
                      {selectedDest || 'Para onde?'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.chooseScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          </>
        ) : (
          <View style={{ flexShrink: 1 }}>


            {isExpanded ? (
              <ScrollView
                style={styles.chooseScroll}
                contentContainerStyle={styles.chooseContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
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
                    </TouchableOpacity>
                  );
                })}
                {isFemale && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>SEGURANÇA</Text>
                    <View style={styles.safetyCard}>
                      <View style={styles.safetyIconWrap}>
                        <ShieldCheck size={20} color={Colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.safetyTitle}>Prefiro motorista mulher</Text>
                        <Text style={styles.safetyDesc}>
                          Priorizamos motoristas mulheres para sua segurança.
                        </Text>
                      </View>
                      <Switch
                        value={preferFemaleDriver}
                        onValueChange={setPreferFemaleDriver}
                        trackColor={{ false: Colors.border, true: Colors.success }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  </>
                )}
              </ScrollView>
            ) : (
              // Collapsed state: Render only selected ride type card
              <View style={{ marginBottom: 12 }}>
                {RIDE_TYPES.filter(t => t.id === selectedType).map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.rideTypeCard, styles.rideTypeSelected, { marginBottom: 0 }]}
                    onPress={() => setIsExpanded(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.carIconWrap}>
                      <type.CarIcon size={44} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.rideTypeName}>{type.label}</Text>
                      </View>
                      <Text style={styles.rideTypeDesc}>
                        {type.desc}
                      </Text>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.rideTypePrice}>
                        {fares[type.id] != null ? `R$ ${fares[type.id].toFixed(2)}` : type.price}
                      </Text>
                      <View style={styles.timeRow}>
                        <Clock size={11} color={Colors.textMuted} />
                        <Text style={styles.rideTypeTime}>{durMin ? `~${durMin} min` : type.time}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Statically fixed bottom section */}
            <View style={[styles.fixedBottom, Platform.OS === 'ios' ? { paddingBottom: Math.max(16, insets.bottom) } : { paddingBottom: 12 }]}>
              <TouchableOpacity 
                style={styles.paymentSelectorRow} 
                onPress={() => setShowPaymentModal(true)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {selectedPayment === 'pix' ? (
                    <View style={[styles.payIconWrapSmall, { backgroundColor: '#32BCAD12' }]}>
                      <PixIcon size={16} color="#32BCAD" />
                    </View>
                  ) : selectedPayment === 'cash' ? (
                    <View style={[styles.payIconWrapSmall, { backgroundColor: Colors.success + '12' }]}>
                      <Banknote size={16} color={Colors.success} />
                    </View>
                  ) : (
                    <View style={[styles.payIconWrapSmall, { backgroundColor: Colors.info + '12' }]}>
                      <CreditCard size={16} color={Colors.info} />
                    </View>
                  )}
                  <Text style={styles.selectedPaymentText}>
                    {selectedPayment === 'pix' ? 'PIX' : selectedPayment === 'cash' ? 'Dinheiro' : (selectedCard ? `Cartão •••• ${selectedCard.number.slice(-4)}` : 'Cartão')}
                  </Text>
                </View>
                <ChevronRight size={16} color="#888" />
              </TouchableOpacity>

              <Button
                title={
                  selectedType === 'moto' ? 'Solicitar Moto' :
                  selectedType === 'economy' ? 'Solicitar Econômico' :
                  selectedType === 'comfort' ? 'Solicitar Conforto' : 'Solicitar Premium'
                }
                onPress={confirm}
                loading={resolving}
                disabled={!destCoords}
                style={{ marginTop: 12 }}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Payment and Card Modals */}
      {renderPaymentModal()}
      {renderCardModal()}
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
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32,
    maxHeight: '82%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 16,
  },
  // Lets the ride-type + payment list scroll within the (clamped) panel so the
  // payment section and confirm button are always reachable.
  chooseScroll: { flexShrink: 1 },
  chooseContent: { paddingBottom: 8 },
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
  rideTypeName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flexShrink: 1 },
  rideTypeDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  selectedBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.xs,
    paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0,
  },
  selectedBadgeText: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: Colors.textInverse },
  priceCol: { alignItems: 'flex-end', gap: 4, marginLeft: 10, minWidth: 64 },
  rideTypePrice: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rideTypeTime: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  // ── Safety: prefer female driver ──────────────────────────
  safetyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: Radius.md,
    backgroundColor: Colors.success + '0D', borderWidth: 1, borderColor: Colors.success + '33',
  },
  safetyIconWrap: {
    width: 38, height: 38, borderRadius: Radius.sm,
    backgroundColor: Colors.success + '1A', alignItems: 'center', justifyContent: 'center',
  },
  safetyTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  safetyDesc: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2, lineHeight: 15 },

  // ── Payment method (lista compacta estilo Uber) ───────────
  payList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  payItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#FFFFFF',
  },
  payItemActive: { backgroundColor: Colors.surface },
  payItemDisabled: { opacity: 0.6 },
  payIconWrap: {
    width: 38, height: 38, borderRadius: Radius.sm,
    backgroundColor: '#32BCAD14', alignItems: 'center', justifyContent: 'center',
  },
  payPixImg: { width: 26, height: 26 },
  payName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  payDescTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 1 },
  paySep: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 62 },
  payNotice: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 10 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.textPrimary, backgroundColor: Colors.textPrimary },

  // ── Custom Added Styles for the Uber Overhaul ──
  addressFieldFocused: {
    borderColor: Colors.textPrimary,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  handleBarContainer: {
    width: '100%', alignItems: 'center', paddingVertical: 10,
  },
  promoBanner: {
    backgroundColor: '#FF6F5912', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', marginBottom: 14,
  },
  promoBannerTxt: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FF6F59',
  },
  fixedBottom: {
    borderTopWidth: 1, borderTopColor: '#F2F2F2', paddingTop: 10,
    backgroundColor: '#FFFFFF',
  },
  paymentSelectorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 6,
  },
  payIconWrapSmall: {
    width: 26, height: 26, borderRadius: Radius.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedPaymentText: {
    fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },
  routeSummary: {
    position: 'absolute', left: 64, right: 16,
    paddingVertical: 4, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
    zIndex: 10,
  },
  routeSummaryRow: {
    minHeight: 38, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, gap: 9,
  },
  routeSummaryIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#131313', alignItems: 'center', justifyContent: 'center',
  },
  routeSummaryIconDestination: {
    backgroundColor: Colors.primary,
  },
  routeSummaryCopy: { flex: 1, minWidth: 0 },
  routeSummaryLabel: {
    fontSize: 8, lineHeight: 10, letterSpacing: 0.7,
    fontFamily: 'Poppins_600SemiBold', color: '#8A8A8A',
  },
  routeSummaryValue: {
    fontSize: 11, lineHeight: 15,
    fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A',
  },
  routeSummaryDivider: {
    height: 1, marginLeft: 43, marginRight: 10,
    backgroundColor: '#ECECEC',
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalDismiss: { flex: 1 },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 10, paddingBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary,
    marginBottom: 16,
  },
  modalPayItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  modalPayItemActive: { backgroundColor: '#F9FAFB' },
  modalPayName: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  modalPayDesc: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 1 },
  
  addCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.textPrimary, borderRadius: Radius.md,
    paddingVertical: 14, marginTop: 16,
  },
  addCardBtnText: {
    fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  cardInput: {
    height: 48, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 14,
    fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
    marginBottom: 12, backgroundColor: '#F9F9F9',
  },
  saveCardBtn: {
    backgroundColor: Colors.success, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  saveCardBtnText: {
    fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  panelFullScreen: {
    top: 0,
    bottom: 0,
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingVertical: 4,
  },
  searchBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHeaderTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: Colors.textPrimary,
  },
});

export default RideRequestScreen;
