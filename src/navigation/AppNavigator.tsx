import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, Alert, AppState, BackHandler, Linking, Share, TouchableOpacity, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants';
import { supabase } from '../lib/supabase';
import { parsePasswordRecoveryUrl } from '../services/authRecovery';
import { usePasswordRecoveryLink } from '../hooks/usePasswordRecoveryLink';
import type { RideRow, RideTypeDb, SubscriptionRow } from '../types/db';
import { requestRide, cancelRide, subscribeToRide, updateRideStatus, acceptRide, getRidePoints, getRide, getActiveRide, getDriverActiveRides, relaxFemalePreference, getRideCounterpart } from '../services/rides';
import { getSearchingRides, subscribeSearchingRides, declineRide, hasDeclinedRide, setStatus, updateLocation, getMyDriver } from '../services/drivers';
import { playSound, stopSound } from '../lib/sounds';
import { registerForPushNotifications, clearPushToken, onPlanRenewalTap } from '../services/push';
import { showSearchingNotification, showDriverFoundNotification, showRideStatusNotification, clearRideNotification, ensureNotificationPermission } from '../services/localNotifications';
import { buildRideFarePix, getSubscription, loadSubscriptionSnapshot, isSubscriptionCurrent, isPaymentReturnUrl } from '../services/payments';
import { friendlyError } from '../lib/errors';
import { DEFAULT_SERVICE_AREA, getServiceArea } from '../services/serviceArea';
import { isCoordinateWithinServiceArea, reverseGeocode } from '../services/geo';
import { serviceAreaLabel } from '../services/serviceArea';

// Auth
import SplashScreen from '../screens/auth/SplashScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterPassengerScreen from '../screens/auth/RegisterPassengerScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import RegisterDriverScreen from '../screens/auth/RegisterDriverScreen';

// Passenger
import PassengerHomeScreen from '../screens/passenger/PassengerHomeScreen';
import RideRequestScreen, { type RidePayload } from '../screens/passenger/RideRequestScreen';
import RideMatchingScreen from '../screens/passenger/RideMatchingScreen';
import RideTrackingScreen from '../screens/passenger/RideTrackingScreen';
import RideCompletedScreen from '../screens/passenger/RideCompletedScreen';
import RideHistoryScreen from '../screens/passenger/RideHistoryScreen';
import PassengerProfileScreen from '../screens/passenger/PassengerProfileScreen';
import SupportScreen from '../screens/passenger/SupportScreen';

// Driver
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import RideRequestNotification from '../screens/driver/RideRequestNotification';
import DriverActiveRideScreen from '../screens/driver/DriverActiveRideScreen';
import DriverEarningsScreen from '../screens/driver/DriverEarningsScreen';
import DriverDocumentsScreen from '../screens/driver/DriverDocumentsScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';
import DriverRidesScreen from '../screens/driver/DriverRidesScreen';
import DriverSubscriptionScreen from '../screens/driver/DriverSubscriptionScreen';
import DriverRatingsScreen from '../screens/driver/DriverRatingsScreen';
import DriverRatePassengerScreen from '../screens/driver/DriverRatePassengerScreen';

// Plan selection (shown once after driver registration)
import PlanSelectionScreen from '../screens/driver/PlanSelectionScreen';
import { getDriverPlanType, type PlanType } from '../services/payments';

async function getOrigin(): Promise<[number, number]> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return [pos.coords.longitude, pos.coords.latitude];
    }
  } catch { /* ignore */ }
  return DEFAULT_SERVICE_AREA.center;
}

const Loading: React.FC<{ message?: string }> = ({ message = 'Carregando...' }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, padding: 24 }}>
    <ActivityIndicator size="large" color={Colors.primary} />
    <Text style={bootStyles.loadingText}>{message}</Text>
  </View>
);

const ProfileRecovery: React.FC<{ error?: string | null; onRetry: () => void; onSignOut: () => void }> = ({ error, onRetry, onSignOut }) => (
  <View style={bootStyles.container}>
    <Text style={bootStyles.title}>Não foi possível carregar o app</Text>
    <Text style={bootStyles.message}>{error || 'Verifique sua conexão e tente novamente.'}</Text>
    <TouchableOpacity style={bootStyles.primaryButton} onPress={onRetry} activeOpacity={0.85}>
      <Text style={bootStyles.primaryButtonText}>Tentar novamente</Text>
    </TouchableOpacity>
    <TouchableOpacity style={bootStyles.secondaryButton} onPress={onSignOut} activeOpacity={0.75}>
      <Text style={bootStyles.secondaryButtonText}>Sair da conta</Text>
    </TouchableOpacity>
  </View>
);

const bootStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, padding: 28 },
  loadingText: { marginTop: 14, color: Colors.textSecondary, fontSize: 14, fontFamily: 'Poppins_500Medium', textAlign: 'center' },
  title: { color: Colors.textPrimary, fontSize: 21, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginBottom: 10 },
  message: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  primaryButton: { minWidth: 220, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22 },
  primaryButtonText: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Poppins_700Bold' },
  secondaryButton: { paddingVertical: 14, paddingHorizontal: 22 },
  secondaryButtonText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Poppins_500Medium' },
});

// ─── Auth flow (logged out) ──────────────────────────────────────────────────
const AuthFlow: React.FC = () => {
  const [screen, setScreen] = useState<'onboarding' | 'login' | 'forgot_password' | 'register_passenger' | 'register_driver'>('onboarding');
  const [forgotEmail, setForgotEmail] = useState('');
  switch (screen) {
    case 'onboarding':
      return <OnboardingScreen onComplete={() => setScreen('login')} />;
    case 'register_passenger':
      return <RegisterPassengerScreen onBack={() => setScreen('login')} />;
    case 'register_driver':
      return <RegisterDriverScreen onBack={() => setScreen('login')} />;
    case 'forgot_password':
      return <ForgotPasswordScreen initialEmail={forgotEmail} onBack={() => setScreen('login')} />;
    case 'login':
    default:
      return (
        <LoginScreen
          onRegister={() => setScreen('register_passenger')}
          onRegisterDriver={() => setScreen('register_driver')}
          onForgotPassword={(value) => { setForgotEmail(value); setScreen('forgot_password'); }}
        />
      );
  }
};

// ─── Passenger flow ──────────────────────────────────────────────────────────
type PScreen =
  | 'passenger_home' | 'ride_request' | 'ride_matching' | 'ride_tracking'
  | 'ride_completed' | 'ride_history' | 'passenger_profile' | 'support';

const PassengerFlow: React.FC = () => {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<PScreen>('passenger_home');
  const [destText, setDestText] = useState('');
  const [rideType, setRideType] = useState<RideTypeDb>('economy');
  const [ride, setRide] = useState<RideRow | null>(null);
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [passengerCancelling, setPassengerCancelling] = useState(false);
  const rideStateRef = useRef<{ id: string | null; status: string | null; updatedAt: string | null }>({ id: null, status: null, updatedAt: null });

  // Ask for notification permission once, register a push token (so we can push
  // "motorista a caminho" even with the app fully closed), and clear any leftover
  // ride notification if the passenger flow unmounts (e.g. logout).
  useEffect(() => {
    ensureNotificationPermission();
    registerForPushNotifications();
    return () => { clearRideNotification(); };
  }, []);

  // Restore a live ride after the app is reopened. Without this, a passenger
  // could be blocked by an active ride but had no screen/action to cancel it.
  useEffect(() => {
    let active = true;
    getActiveRide().then(async (current) => {
      if (!active || !current) return;
      setRide(current);
      setScreen(['driver_on_way', 'driver_arrived', 'in_progress'].includes(current.status) ? 'ride_tracking' : 'ride_matching');
      const points = await getRidePoints(current.id).catch(() => null);
      if (active && points) {
        setOriginCoords([points.originLng, points.originLat]);
        setDestCoords([points.destLng, points.destLat]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Ongoing "Procurando motorista..." tray notification while searching, so the
  // passenger sees it even after backgrounding the app.
  useEffect(() => {
    if (screen === 'ride_matching' && ride?.status === 'searching') {
      const dest = ride?.destination_address ? `Destino: ${ride.destination_address.split(',')[0]}` : undefined;
      showSearchingNotification(dest);
    }
  }, [screen, ride?.status, ride?.destination_address]);

  // Realtime: advance the UI as the ride's status changes server-side.
  useEffect(() => {
    if (!ride || (screen !== 'ride_matching' && screen !== 'ride_tracking')) return;
    if (rideStateRef.current.id !== ride.id) {
      rideStateRef.current = { id: ride.id, status: ride.status, updatedAt: ride.updated_at };
    }
    const apply = (r: RideRow) => {
      const changed = rideStateRef.current.id !== r.id
        || rideStateRef.current.status !== r.status
        || rideStateRef.current.updatedAt !== r.updated_at;
      rideStateRef.current = { id: r.id, status: r.status, updatedAt: r.updated_at };
      setRide(r);
      // A driver can change the destination after boarding. Refresh the
      // coordinates as well as the address so the passenger's map follows it.
      if (changed && ['driver_on_way', 'driver_arrived', 'in_progress'].includes(r.status)) {
        getRidePoints(r.id).then((points) => {
          if (points) {
            setOriginCoords([points.originLng, points.originLat]);
            setDestCoords([points.destLng, points.destLat]);
          }
        }).catch(() => {});
      }
      // Realtime and polling can deliver the same row. Only a real status
      // transition may play sounds, alert, navigate, or schedule a local notification.
      if (!changed) return;
      if (['driver_on_way', 'driver_arrived', 'in_progress'].includes(r.status)) {
        if (screen === 'ride_matching') {
          stopSound('searching'); playSound('found');
          // Replace the "searching" tray notification with a "driver found" one
          // (shows even if the passenger backgrounded the app while waiting).
          getRideCounterpart(r.id)
            .then((c) => showDriverFoundNotification(c ? { name: c.name, vehicle: c.vehicleModel, plate: c.vehiclePlate } : undefined))
            .catch(() => showDriverFoundNotification());
        }
        // Driver at the pickup: ring and post a tray alert, so the passenger
        // notices even with the phone in the pocket or the app backgrounded.
        if (r.status === 'driver_arrived') {
          playSound('found');
          showRideStatusNotification('📍 Seu motorista chegou!', 'Ele está no local de embarque. Entre no veículo.');
        }
        setScreen((s) => (s === 'ride_matching' ? 'ride_tracking' : s));
      } else if (r.status === 'completed') {
        stopSound('searching');
        clearRideNotification();
        setScreen('ride_completed');
      } else if (r.status === 'cancelled') {
        stopSound('searching');
        clearRideNotification();
        Alert.alert('Corrida cancelada', r.cancel_reason || 'A corrida foi cancelada.');
        setRide(null);
        setScreen('passenger_home');
      }
    };
    const unsub = subscribeToRide(ride.id, apply);
    // Polling de garantia (caso o realtime falhe/conexão instável).
    const iv = setInterval(async () => { const r = await getRide(ride.id); if (r) apply(r); }, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, [ride?.id, screen]);

  // Direct methods still instruct the passenger to pay the driver. Mercado
  // Pago is handled by RideCompletedScreen so the checkout and split status
  // remain visible until the passenger confirms the payment.
  useEffect(() => {
    if (screen !== 'ride_completed' || !ride) return;
    (async () => {
      const valor = `R$ ${(ride.price ?? 0).toFixed(2)}`;
      if (ride.payment_method === 'mercadopago') return;
      if (ride.payment_method === 'cash') {
        Alert.alert('Pagamento em dinheiro', `Pague ${valor} em dinheiro diretamente ao motorista.`);
        return;
      }
      if (ride.payment_method === 'card') {
        Alert.alert('Pagamento no cartão', `Pague ${valor} na maquininha do motorista.`);
        return;
      }
      // PIX → show the driver's copia-e-cola, with a share/copy action.
      if (ride.payment_method === 'pix') {
        try {
          const pix = await buildRideFarePix(ride.id);
          if (pix?.code) {
            Alert.alert(
              `Pagar ${pix.driverName} via PIX`,
              `Valor: R$ ${pix.amount.toFixed(2)}\n\nPIX copia-e-cola:\n${pix.code}`,
              [
                { text: 'Compartilhar / copiar', onPress: () => { Share.share({ message: pix.code }).catch(() => {}); } },
                { text: 'Fechar', style: 'cancel' },
              ],
            );
          } else {
            // Driver has no PIX key saved — fall back to a generic instruction.
            Alert.alert('Pagamento via PIX', `Pague ${valor} ao motorista usando a chave PIX que ele informar.`);
          }
        } catch {
          Alert.alert('Pagamento via PIX', `Pague ${valor} ao motorista usando a chave PIX que ele informar.`);
        }
      } else {
        Alert.alert('Pagamento', `Combine o pagamento de ${valor} diretamente com o motorista.`);
      }
    })();
  }, [screen, ride?.id]);

  const confirmRide = async (type: RideTypeDb, payload?: RidePayload) => {
    setRideType(type);
    try {
      let originLngLat: [number, number];
      let destLngLat: [number, number];
      let originAddr = 'Minha localização';
      let destAddr = destText || 'Destino';
      if (payload) {
        originLngLat = [payload.originLng, payload.originLat];
        destLngLat = [payload.destLng, payload.destLat];
        originAddr = payload.originAddress;
        destAddr = payload.destAddress;
      } else {
        originLngLat = await getOrigin();
        const { geocode, placeLabel } = await import('../services/geo');
        destLngLat = originLngLat;
        const places = await geocode(destText || 'Sinop, MT', originLngLat);
        if (places[0]) { destLngLat = [places[0].lng, places[0].lat]; destAddr = placeLabel(places[0]); }
      }
      const serviceArea = await getServiceArea();
      if (serviceArea.enabled && serviceArea.scope !== 'radius') {
        const resolvedOriginAddress = await reverseGeocode(originLngLat[0], originLngLat[1]);
        if (resolvedOriginAddress) originAddr = resolvedOriginAddress;
      }
      const [originAllowed, destinationAllowed] = await Promise.all([
        isCoordinateWithinServiceArea(originLngLat, serviceArea),
        isCoordinateWithinServiceArea(destLngLat, serviceArea),
      ]);
      if (!originAllowed || !destinationAllowed) {
        throw new Error(`A Rotta Urbana atende somente ${serviceAreaLabel(serviceArea)} no momento.`);
      }
      setOriginCoords(originLngLat);
      setDestCoords(destLngLat);
      const created = await requestRide({
        originLat: originLngLat[1], originLng: originLngLat[0], originAddress: originAddr,
        destLat: destLngLat[1], destLng: destLngLat[0], destAddress: destAddr,
        rideType: type, paymentMethod: payload?.paymentMethod ?? 'pix',
        requiresFemaleDriver: payload?.requiresFemaleDriver ?? false,
      });
      setRide(created);
      setScreen('ride_matching');
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      if (msg.includes('already have an active ride') || msg.includes('active ride')) {
        // Stuck ride from a previous session — offer recovery without touching anything automatically.
        try {
          const stuck = await getActiveRide();
          if (stuck) {
            const activeTracking = ['driver_on_way', 'driver_arrived', 'in_progress'];
            Alert.alert(
              'Corrida em aberto',
              'Você já tem uma corrida ativa. O que deseja fazer?',
              [
                {
                  text: 'Retomar corrida',
                  onPress: () => {
                    setRide(stuck);
                    setScreen(activeTracking.includes(stuck.status) ? 'ride_tracking' : 'ride_matching');
                  },
                },
                {
                  text: 'Cancelar e pedir nova',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await cancelRide(stuck.id, 'Passageiro cancelou para pedir nova corrida');
                      await confirmRide(type, payload);
                    } catch (err: any) {
                      Alert.alert('Erro', friendlyError(err?.message));
                    }
                  },
                },
                { text: 'Voltar', style: 'cancel' },
              ]
            );
            return;
          }
        } catch { /* fall through to generic error */ }
      }
      Alert.alert('Não foi possível pedir a corrida', friendlyError(e?.message));
    }
  };

  const handleCancel = async (reason?: string) => {
    if (passengerCancelling) return false;
    setPassengerCancelling(true);
    clearRideNotification();
    stopSound('searching');
    try {
      const text = typeof reason === 'string' && reason.trim() ? reason : 'Passageiro cancelou pelo app';
      if (ride) await cancelRide(ride.id, text);
      setRide(null);
      setScreen('passenger_home');
      return true;
    } catch (e: any) {
      Alert.alert('Não foi possível cancelar', friendlyError(e?.message));
      return false;
    } finally {
      setPassengerCancelling(false);
    }
  };

  // No female driver available → passenger chooses to accept a male driver.
  const handleAcceptMale = async () => {
    if (!ride) return;
    try {
      const updated = await relaxFemalePreference(ride.id);
      setRide(updated);
    } catch (e: any) {
      const msg = (e?.message ?? '').toLowerCase();
      // A driver may have accepted in the meantime → ride no longer 'searching'.
      // That's benign: realtime/poll will move us to tracking; don't alarm the user.
      if (msg.includes('not found') || msg.includes('not yours')) return;
      Alert.alert('Erro', friendlyError(e?.message));
    }
  };

  switch (screen) {
    case 'passenger_home':
      return (
        <PassengerHomeScreen
          onRequestRide={(dest: string) => { setDestText(dest); setScreen('ride_request'); }}
          onNotifications={() => {}}
          onProfile={() => setScreen('passenger_profile')}
        />
      );
    case 'ride_request':
      return (
        <RideRequestScreen
          destination={destText}
          onConfirm={(type, payload) => confirmRide(type as RideTypeDb, payload)}
          onBack={() => setScreen('passenger_home')}
        />
      );
    case 'ride_matching':
      return <RideMatchingScreen
        onDriverFound={() => setScreen('ride_tracking')}
        // onPress hands over the press event; passed on as the reason it made
        // the cancel RPC fail with "cyclical structure in JSON object".
        onCancel={() => handleCancel()}
        destinationAddress={ride?.destination_address}
        price={ride?.price}
        distanceKm={ride?.distance_km}
        durationMin={ride?.duration_min}
        requiresFemaleDriver={ride?.requires_female_driver}
        rideStatus={ride?.status}
        onAcceptMale={handleAcceptMale}
      />;
    case 'ride_tracking':
      return <RideTrackingScreen rideId={ride?.id} status={ride?.status} origin={originCoords ?? undefined} destination={destCoords ?? undefined} price={ride?.price} distanceKm={ride?.distance_km} durationMin={ride?.duration_min} destinationAddress={ride?.destination_address} onCancel={handleCancel} onRideCompleted={() => setScreen('ride_completed')} onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])} onDestinationChanged={(nextDestination, nextAddress, pricing) => {
        setDestCoords(nextDestination);
        setRide((current) => current ? {
          ...current,
          destination_address: nextAddress,
          ...(pricing ? { price: pricing.price, distance_km: pricing.distanceKm, duration_min: pricing.durationMin } : {}),
        } : current);
      }} />;
    case 'ride_completed':
      return (
        <RideCompletedScreen
          ride={ride}
          rideType={rideType}
          onGoHome={() => { setRide(null); setScreen('passenger_home'); }}
          onSupport={() => setScreen('support')}
          onProfile={() => setScreen('passenger_profile')}
        />
      );
    case 'ride_history':
      return <RideHistoryScreen onBack={() => setScreen('passenger_profile')} onSupport={() => setScreen('support')} />;
    case 'passenger_profile':
      return (
        <PassengerProfileScreen
          onBack={() => setScreen('passenger_home')}
          onLogout={signOut}
          onSupport={() => setScreen('support')}
          onHistory={() => setScreen('ride_history')}
        />
      );
    case 'support':
      return <SupportScreen onBack={() => setScreen('passenger_profile')} onSubmit={() => setScreen('passenger_home')} />;
    default:
      return <Loading message="Abrindo a tela inicial..." />;
  }
};

// ─── Driver flow ─────────────────────────────────────────────────────────────
type DScreen = 'driver_home' | 'ride_notification' | 'driver_active_ride' | 'driver_rate' | 'driver_earnings' | 'driver_documents' | 'driver_profile' | 'driver_rides' | 'driver_subscription' | 'driver_ratings' | 'driver_support';

// The link that opened the app is read again on every sign-in; a payment
// return in it is handled once.
let initialPaymentUrlHandled = false;

// Without a plan in date the driver sees the plan screen, and from it only
// Financeiro and Suporte.
const BLOCKED_SCREENS: ReadonlySet<DScreen> = new Set<DScreen>(['driver_subscription', 'driver_earnings', 'driver_support']);

const DriverFlow: React.FC = () => {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<DScreen>('driver_home');
  const [planType, setPlanType] = useState<PlanType | null | 'loading' | 'error'>('loading');

  // A read error must not look like "no plan yet": the first-run picker would
  // let a paying driver switch plans (and cancel what they paid) by accident.
  const loadPlanType = useCallback(async () => {
    setPlanType('loading');
    try {
      let pt = await getDriverPlanType();
      if (!pt) {
        // A first plan paid while the app was closed: let the server confirm
        // it with Mercado Pago before asking the driver to choose again.
        const snapshot = await loadSubscriptionSnapshot(8_000);
        pt = await getDriverPlanType();
        // An expired Diário or Semanal is no longer the driver's plan, but a
        // driver who ever paid renews from the plan screen, not the first-run
        // picker.
        const row = snapshot.subscription;
        if (!pt && row?.plan && (row.paid_at || row.provider_subscription_id)) pt = row.plan;
      }
      setPlanType(pt);
    } catch {
      setPlanType('error');
    }
  }, []);

  useEffect(() => { void loadPlanType(); }, [loadPlanType]);
  const [online, setOnline] = useState(false);
  const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null);
  const [pendingRequest, setPendingRequest] = useState<RideRow | null>(null);
  const [activeRide, setActiveRide] = useState<RideRow | null>(null);
  // Next ride, accepted while finishing activeRide (queued trip).
  const [queuedRide, setQueuedRide] = useState<RideRow | null>(null);
  const queuedRef = useRef(queuedRide);
  queuedRef.current = queuedRide;
  // A ride in progress with no next ride yet can take one near its drop-off.
  const canQueue = activeRide?.status === 'in_progress' && !queuedRide;
  const [ratingRide, setRatingRide] = useState<RideRow | null>(null);
  const [subscriptionAccess, setSubscriptionAccess] = useState<'loading' | 'active' | 'blocked'>('loading');
  const [activePoints, setActivePoints] = useState<{ origin: [number, number]; dest: [number, number] } | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  // Rides this driver has already declined — kept out of the poll/realtime
  // feed so a decline doesn't keep resurfacing the same ride every few seconds.
  const rejectedIdsRef = useRef<Set<string>>(new Set());
  // One accept at a time. A second tap on Aceitar used to reach the ride
  // screen's first button (same spot) and mark the arrival at once.
  const acceptingRef = useRef(false);
  const [accepting, setAccepting] = useState(false);

  // Checks run from a timer, the app coming back and the plan screen at once.
  // A slow old read that saw no plan is dropped once a newer one landed, so it
  // cannot block a driver who just paid; an old read that saw the plan paid
  // still counts, since the server only makes a plan current after a payment.
  const accessCheckRef = useRef({ started: 0, applied: 0 });
  const refreshSubscriptionAccess = useCallback(async (reconcile = false): Promise<boolean> => {
    const check = ++accessCheckRef.current.started;
    let row = await getSubscription();
    // The server checks Mercado Pago when the row alone would block the driver
    // (a payment whose webhook is late still unlocks the app), for recurring
    // plans, and right after a checkout.
    if (reconcile || !isSubscriptionCurrent(row) || row?.provider_subscription_id) {
      row = (await loadSubscriptionSnapshot(10_000)).subscription;
    }
    const current = isSubscriptionCurrent(row);
    if (check < accessCheckRef.current.applied && !current) return current;
    accessCheckRef.current.applied = Math.max(accessCheckRef.current.applied, check);
    setSubscriptionAccess(current ? 'active' : 'blocked');
    if (!current) {
      setOnline(false);
      setPendingRequest(null);
      await setStatus('offline').catch(() => {});
    }
    return current;
  }, []);

  useEffect(() => {
    // A failed first read only ends the loading state; it never overrides a
    // check that did get an answer.
    refreshSubscriptionAccess().catch(() => setSubscriptionAccess((s) => (s === 'loading' ? 'blocked' : s)));
    const iv = setInterval(() => { refreshSubscriptionAccess().catch(() => {}); }, 60_000);
    return () => clearInterval(iv);
  }, [refreshSubscriptionAccess]);

  // Mercado Pago's return page reopens the app on rotta-urbana://pagamento/retorno,
  // also when the app had been closed. Show the plan screen and check the payment.
  const [paymentReturnSignal, setPaymentReturnSignal] = useState(0);
  // Suporte, opened from the first plan choice.
  const [firstRunSupport, setFirstRunSupport] = useState(false);
  // Android's back button there goes back to the plan choice, like its arrow.
  useEffect(() => {
    if (!firstRunSupport) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFirstRunSupport(false);
      return true;
    });
    return () => backSub.remove();
  }, [firstRunSupport]);
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!isPaymentReturnUrl(url) || /[?&]ride_id=/.test(String(url))) return;
      void refreshSubscriptionAccess(true).catch(() => {});
      // A ride under way stays on screen; the plan screen checks the payment
      // by itself when it is opened.
      if (screenRef.current === 'driver_active_ride' || screenRef.current === 'driver_rate') return;
      setScreen('driver_subscription');
      // Signals only grow, also across sign-ins, so each link is handled once.
      setPaymentReturnSignal((n) => Math.max(n + 1, Date.now()));
    };
    Linking.getInitialURL().then((url) => {
      if (initialPaymentUrlHandled) return;
      initialPaymentUrlHandled = true;
      handle(url);
    }).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => linkSub.remove();
  }, [refreshSubscriptionAccess]);

  // A ride under way (or its rating) is finished even if the plan runs out.
  const blocked = subscriptionAccess === 'blocked' && !activeRide && !ratingRide;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  // Blocked: the plan screen becomes the current one, so paying there shows
  // the confirmation instead of jumping back to where the driver was.
  useEffect(() => {
    if (blocked && !BLOCKED_SCREENS.has(screen)) setScreen('driver_subscription');
  }, [blocked, screen]);

  // Android's back button goes where each screen's back arrow goes. The plan
  // screen registers its own handler (it closes an open checkout first).
  useEffect(() => {
    const backTargets: Partial<Record<DScreen, DScreen>> = {
      driver_profile: 'driver_home',
      driver_earnings: 'driver_home',
      driver_documents: 'driver_home',
      driver_rides: 'driver_profile',
      driver_ratings: 'driver_profile',
      driver_support: 'driver_profile',
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = screenRef.current;
      if (blockedRef.current) {
        // Back to the plan screen; from there, Android leaves the app.
        if (current === 'driver_earnings' || current === 'driver_support') {
          setScreen('driver_subscription');
          return true;
        }
        return false;
      }
      const target = backTargets[current];
      if (!target) return false;
      setScreen(target);
      return true;
    });
    return () => backSub.remove();
  }, []);

  // A renewal reminder opens the plan screen, also when it opened the app.
  useEffect(() => onPlanRenewalTap(() => {
    if (screenRef.current === 'driver_active_ride' || screenRef.current === 'driver_rate') return;
    setScreen('driver_subscription');
    void refreshSubscriptionAccess().catch(() => {});
  }), [refreshSubscriptionAccess]);

  // Back in the app: a plan that ran out while it was in the background
  // shows the plan screen right away, not a minute later.
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSubscriptionAccess().catch(() => {});
    });
    return () => appStateSub.remove();
  }, [refreshSubscriptionAccess]);

  // New ride requests push the driver to the notification screen (when free).
  useEffect(() => {
    const unsub = subscribeSearchingRides((r) => {
      void (async () => {
        if (!online || activeRide || rejectedIdsRef.current.has(r.id)) return;
        if (await hasDeclinedRide(r.id)) return;
        setPendingRequest((cur) => cur ?? r);
        if (screenRef.current === 'driver_home') setScreen('ride_notification');
      })().catch(() => {});
    });
    return unsub;
  }, [online, activeRide?.id]);

  // Poll fallback: realtime push can be missed (app was backgrounded when the
  // ride was created, a dropped socket, or a female-only ride later relaxed via
  // an UPDATE the INSERT-subscription ignores). Polling guarantees an online
  // driver still picks up any waiting request within a few seconds.
  useEffect(() => {
    // Queued offers come only from here: the server filters them by distance
    // to the current drop-off, which the realtime feed cannot.
    if (!online || pendingRequest || (activeRide && !canQueue)) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const existing = (await getSearchingRides()).filter((r) => !rejectedIdsRef.current.has(r.id));
        if (cancelled || existing.length === 0) return;
        setPendingRequest((cur) => cur ?? existing[0]);
        if (screenRef.current === 'driver_home') setScreen('ride_notification');
      } catch { /* not verified / offline */ }
    };
    pull(); // immediate check (covers rides created while backgrounded)
    const iv = setInterval(pull, 7000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [online, activeRide?.id, canQueue, pendingRequest?.id]);

  // If the pending ride is accepted by another driver or cancelled, dismiss it.
  useEffect(() => {
    if (!pendingRequest) return;
    const unsub = subscribeToRide(pendingRequest.id, (r) => {
      // Our own accept also leaves 'searching'; handleAccept moves on from there.
      if (r.status !== 'searching' && !acceptingRef.current) {
        setPendingRequest(null);
        // Read the queued screen, not the rendered one: an accept that just
        // answered may already have sent the driver to the ride.
        setScreen((cur) => (cur === 'ride_notification' ? 'driver_home' : cur));
      }
    });
    return unsub;
  }, [pendingRequest?.id]);

  // Reconnect to the driver's active ride after a process restart and follow
  // passenger/admin cancellation while the driver is on the road.
  useEffect(() => {
    if (!activeRide) return;
    let currentStatus = activeRide.status;
    let currentUpdatedAt = activeRide.updated_at;
    let currentDestAddress = activeRide.destination_address;
    const apply = (r: RideRow) => {
      if (r.status === currentStatus && r.updated_at === currentUpdatedAt) return;
      currentStatus = r.status;
      currentUpdatedAt = r.updated_at;
      if (r.status === 'cancelled') {
        stopSound('request');
        // The next ride, if any, becomes the current one.
        const next = queuedRef.current;
        setActiveRide(next);
        setQueuedRide(null);
        if (screenRef.current !== 'driver_rate') setScreen(next ? 'driver_active_ride' : 'driver_home');
        Alert.alert('Corrida cancelada', r.cancel_reason || 'O passageiro cancelou a corrida.');
        return;
      }
      // Destination text updates immediately via setActiveRide below, but the
      // map/route also needs fresh coordinates — otherwise a passenger-initiated
      // route change leaves the driver's pin/route stale on screen.
      if (r.destination_address !== currentDestAddress) {
        currentDestAddress = r.destination_address;
        getRidePoints(r.id).then((points) => {
          if (points) setActivePoints((current) => current ? { ...current, dest: [points.destLng, points.destLat] } : current);
        }).catch(() => {});
      }
      setActiveRide(r);
    };
    const unsub = subscribeToRide(activeRide.id, apply);
    const iv = setInterval(async () => {
      const r = await getRide(activeRide.id);
      if (r) apply(r);
    }, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, [activeRide?.id]);

  // Follow the queued ride: the passenger may cancel it before it starts.
  useEffect(() => {
    if (!queuedRide) return;
    const id = queuedRide.id;
    let done = false;
    const apply = (r: RideRow) => {
      if (done) return;
      if (r.status === 'cancelled') {
        done = true;
        setQueuedRide((cur) => (cur?.id === id ? null : cur));
        Alert.alert('Próxima corrida cancelada', r.cancel_reason || 'O passageiro cancelou a próxima corrida.');
        return;
      }
      setQueuedRide((cur) => (cur?.id === id ? r : cur));
    };
    const unsub = subscribeToRide(id, apply);
    const iv = setInterval(async () => {
      const r = await getRide(id);
      if (r) apply(r);
    }, 8000);
    return () => { done = true; unsub(); clearInterval(iv); };
  }, [queuedRide?.id]);

  // Register for push (ride alerts even with the app closed) and restore the
  // online state if the server still has us online — e.g. reopened from a push.
  useEffect(() => {
    registerForPushNotifications();
    Promise.all([getMyDriver(), getDriverActiveRides()]).then(([d, rides]) => {
      const mine = rides.filter((r) => r.driver_id && r.driver_id === d?.id);
      if (mine.length > 0) {
        // The ride under way first; a second one is the queued next ride.
        const current = mine.find((r) => r.status === 'in_progress' || r.status === 'driver_arrived') ?? mine[0];
        // The driver was online to accept it, and finishing it puts them
        // back online on the server.
        setOnline(true);
        setActiveRide(current);
        setQueuedRide(mine.find((r) => r.id !== current.id) ?? null);
        setScreen('driver_active_ride');
      } else if (d?.status === 'online') {
        setOnline(true);
      }
    }).catch(() => {});
  }, []);

  // Send the location while online and during a ride, including a ride
  // restored after a restart or kept after the subscription expired.
  const tracking = online || !!activeRide;
  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;
      const next = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 4000 },
        (pos) => {
          setDriverCoords([pos.coords.longitude, pos.coords.latitude]);
          updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading ?? undefined).catch(() => {});
        },
      );
      if (cancelled) next.remove();
      else sub = next;
    })().catch(() => {});
    return () => { cancelled = true; sub?.remove(); };
  }, [tracking]);

  const handleLogout = async () => { await clearPushToken(); await signOut(); };

  // Load the active ride's points (lat/lng) so the map can draw the route.
  useEffect(() => {
    if (!activeRide) { setActivePoints(null); return; }
    let active = true;
    getRidePoints(activeRide.id)
      .then((p) => { if (active && p) setActivePoints({ origin: [p.originLng, p.originLat], dest: [p.destLng, p.destLat] }); })
      .catch(() => {});
    return () => { active = false; };
  }, [activeRide?.id]);

  const toggleOnline = async () => {
    // Don't let the driver go offline mid-ride (kills GPS + ride tracking).
    if (online && activeRide) {
      Alert.alert('Você está em uma corrida', 'Conclua a corrida atual antes de ficar offline.');
      return;
    }
    if (!online) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setDriverCoords([pos.coords.longitude, pos.coords.latitude]);
          await updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading ?? undefined);
        }
        await setStatus('online');
        setOnline(true);
        // Pull any ride requests that were already searching before we subscribed.
        try {
          const existing = (await getSearchingRides()).filter((r) => !rejectedIdsRef.current.has(r.id));
          if (existing.length > 0) {
            setPendingRequest((cur) => cur ?? existing[0]);
            setScreen('ride_notification');
          }
        } catch { /* no existing rides or not verified */ }
      } catch (e: any) {
        Alert.alert('Não foi possível ficar online', `${friendlyError(e?.message)}\nSeu cadastro precisa estar verificado pelo admin.`);
      }
    } else {
      try { await setStatus('offline'); } catch { /* ignore */ }
      setOnline(false);
    }
  };

  const handleAccept = async () => {
    if (!pendingRequest || acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    try {
      const accepted = await acceptRide(pendingRequest.id);
      stopSound('request');
      playSound('accept');
      // Taken while finishing a ride: it waits as the next one.
      if (activeRide && accepted.queued_after) setQueuedRide(accepted);
      else setActiveRide(accepted);
      setPendingRequest(null);
      setScreen('driver_active_ride');
    } catch (e: any) {
      Alert.alert('Corrida indisponível', friendlyError(e?.message));
      setPendingRequest(null);
      setScreen(activeRide ? 'driver_active_ride' : 'driver_home');
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  };

  const completeRide = () => {
    playSound('complete');
    // Finishing a ride puts the driver back online on the server only while the
    // subscription is current. Follow what the server decided.
    // With a queued ride the server keeps the driver 'on_ride'.
    getMyDriver().then((d) => setOnline(d?.status === 'online' || d?.status === 'on_ride')).catch(() => {});
    // The ride was already marked 'completed' inside DriverActiveRideScreen (goNext).
    // Re-calling updateRideStatus here would fail and show a false error — instead,
    // move to the passenger-rating step.
    // The queued ride, if any, is next after the rating.
    if (activeRide) { setRatingRide(activeRide); setActiveRide(queuedRide); setQueuedRide(null); setScreen('driver_rate'); }
    else setScreen('driver_home');
  };

  const openMenu = () => setScreen('driver_profile');
  const closeSubscription = () => {
    // Navigation must not wait for Supabase/Mercado Pago: on a slow or offline
    // connection the old handler left the driver trapped on this screen.
    setScreen('driver_profile');
    void refreshSubscriptionAccess().catch(() => {});
  };
  // To the rides after a payment. Still blocked means the app has not seen the
  // plan in date yet: the driver stays on the confirmation (false) instead of
  // being sent back to the plans.
  const goHomeAfterPayment = async (): Promise<boolean> => {
    if (!blockedRef.current) {
      setScreen('driver_home');
      void refreshSubscriptionAccess(true).catch(() => {});
      return true;
    }
    const current = await refreshSubscriptionAccess(true).catch(() => false);
    if (current) setScreen('driver_home');
    return current;
  };
  // A payment the app just confirmed unlocks at once with the plan it read;
  // the server check that follows blocks again only if it disagrees.
  const onSubscriptionChanged = useCallback((row?: SubscriptionRow | null) => {
    if (isSubscriptionCurrent(row)) {
      accessCheckRef.current.applied = ++accessCheckRef.current.started;
      setSubscriptionAccess('active');
    }
    void refreshSubscriptionAccess(true).catch(() => {});
  }, [refreshSubscriptionAccess]);

  if (planType === 'loading') return <Loading message="Carregando sua conta de motorista..." />;
  if (planType === 'error') {
    return (
      <ProfileRecovery
        error="Não conseguimos carregar o seu plano. Verifique sua conexão e tente novamente."
        onRetry={() => { void loadPlanType(); }}
        onSignOut={() => { void handleLogout(); }}
      />
    );
  }
  if (planType === null) {
    if (firstRunSupport) {
      return <SupportScreen onBack={() => setFirstRunSupport(false)} onSubmit={() => setFirstRunSupport(false)} />;
    }
    return (
      <PlanSelectionScreen
        returnSignal={paymentReturnSignal}
        onSupport={() => setFirstRunSupport(true)}
        onLogout={() => { void handleLogout(); }}
        onDone={async (row) => {
          // The payment return link may have switched screens meanwhile; the
          // first plan always lands on the home screen.
          if (isSubscriptionCurrent(row) && row?.plan) {
            // The plan the screen just read as paid unlocks without waiting.
            onSubscriptionChanged(row);
            setScreen('driver_home');
            setPlanType(row.plan);
            return;
          }
          let pt: PlanType | null;
          let current: boolean;
          try {
            current = await refreshSubscriptionAccess(true);
            pt = await getDriverPlanType();
          } catch {
            Alert.alert('Sem conexão', 'Não conseguimos confirmar o seu plano agora. Verifique sua conexão e toque de novo.');
            return;
          }
          if (!pt || !current) {
            Alert.alert(
              'Estamos liberando seu acesso',
              'O plano ainda não apareceu como ativo. Aguarde alguns segundos e toque de novo. Se não liberar, fale com o suporte.',
            );
            return;
          }
          setScreen('driver_home');
          setPlanType(pt);
        }}
      />
    );
  }
  if (subscriptionAccess === 'loading') return <Loading message="Verificando a assinatura..." />;
  // Without a plan in date every other screen shows the plan screen. The
  // screen itself is kept, so once the plan is paid the driver is back there.
  const shown: DScreen = blocked && !BLOCKED_SCREENS.has(screen) ? 'driver_subscription' : screen;

  switch (shown) {
    case 'driver_home':
    case 'ride_notification':
      return (
        <View style={{ flex: 1 }}>
          <DriverHomeScreen
            online={online}
            onToggleOnline={toggleOnline}
            coords={driverCoords ?? undefined}
            onRideRequest={() => pendingRequest ? setScreen('ride_notification') : Alert.alert('Sem corridas', 'Nenhuma solicitação disponível no momento.')}
            onEarnings={() => setScreen('driver_earnings')}
            onProfile={openMenu}
            onRides={() => setScreen('driver_rides')}
            onRatings={() => setScreen('driver_ratings')}
            onSubscription={() => setScreen('driver_subscription')}
          />
          {screen === 'ride_notification' && pendingRequest && (
            <RideRequestNotification
              ride={pendingRequest}
              driverCoords={driverCoords ?? undefined}
              onAccept={handleAccept}
              accepting={accepting}
              onReject={() => {
                // Declining a ride the server may already have given us would
                // strand the passenger; wait for the accept's answer.
                if (acceptingRef.current) return;
                if (pendingRequest) {
                  rejectedIdsRef.current.add(pendingRequest.id);
                  declineRide(pendingRequest.id).catch(() => {});
                }
                setPendingRequest(null);
                setScreen('driver_home');
              }}
            />
          )}
        </View>
      );
    case 'driver_active_ride':
      return (
        <View style={{ flex: 1 }}>
        <DriverActiveRideScreen
          key={activeRide?.id}
          rideId={activeRide?.id}
          nextPickupAddress={queuedRide?.origin_address ?? null}
          origin={activePoints?.origin}
          destination={activePoints?.dest}
          originAddress={activeRide?.origin_address}
          destinationAddress={activeRide?.destination_address}
          paymentMethod={activeRide?.payment_method}
          price={activeRide?.price}
          rideStatus={activeRide?.status}
          onDestinationChanged={(nextDestination, nextAddress, pricing) => {
            setActivePoints((current) => current ? { ...current, dest: nextDestination } : current);
            setActiveRide((current) => current ? {
              ...current,
              destination_address: nextAddress,
              ...(pricing ? {
                price: pricing.price,
                distance_km: pricing.distanceKm,
                duration_min: pricing.durationMin,
              } : {}),
            } : current);
          }}
          onCompleted={completeRide}
          onCancel={() => {
            // The next ride, if any, becomes the current one.
            const next = queuedRef.current;
            setActiveRide(next);
            setQueuedRide(null);
            setScreen(next ? 'driver_active_ride' : 'driver_home');
          }}
          onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])}
        />
          {/* Next-ride offer while finishing this one */}
          {pendingRequest && activeRide && (
            <RideRequestNotification
              ride={pendingRequest}
              driverCoords={driverCoords ?? undefined}
              onAccept={handleAccept}
              accepting={accepting}
              queued
              onReject={() => {
                if (acceptingRef.current) return;
                rejectedIdsRef.current.add(pendingRequest.id);
                declineRide(pendingRequest.id).catch(() => {});
                setPendingRequest(null);
              }}
            />
          )}
        </View>
      );
    case 'driver_rate':
      return (
        <DriverRatePassengerScreen
          rideId={ratingRide?.id}
          price={ratingRide?.price}
          paymentMethod={ratingRide?.payment_method}
          onDone={() => { setRatingRide(null); setScreen(activeRide ? 'driver_active_ride' : 'driver_home'); }}
        />
      );
    case 'driver_earnings':
      return <DriverEarningsScreen onBack={() => setScreen(blocked ? 'driver_subscription' : 'driver_home')} />;
    case 'driver_documents':
      return <DriverDocumentsScreen onBack={() => setScreen('driver_home')} />;
    case 'driver_support':
      return (
        <SupportScreen
          onBack={() => setScreen(blocked ? 'driver_subscription' : 'driver_profile')}
          onSubmit={() => setScreen(blocked ? 'driver_subscription' : 'driver_home')}
        />
      );
    case 'driver_profile':
      return (
        <DriverProfileScreen
          onBack={() => setScreen('driver_home')}
          onEarnings={() => setScreen('driver_earnings')}
          onRides={() => setScreen('driver_rides')}
          onRatings={() => setScreen('driver_ratings')}
          onDocuments={() => setScreen('driver_documents')}
          onSubscription={() => setScreen('driver_subscription')}
          onSupport={() => setScreen('driver_support')}
          onLogout={handleLogout}
        />
      );
    case 'driver_rides':
      return <DriverRidesScreen onBack={() => setScreen('driver_profile')} />;
    case 'driver_subscription':
      return (
        <DriverSubscriptionScreen
          onBack={closeSubscription}
          onSubscriptionChanged={onSubscriptionChanged}
          returnSignal={paymentReturnSignal}
          blocked={blocked}
          onHome={goHomeAfterPayment}
          onEarnings={() => setScreen('driver_earnings')}
          onSupport={() => setScreen('driver_support')}
          onLogout={() => { void handleLogout(); }}
        />
      );
    case 'driver_ratings':
      return <DriverRatingsScreen onBack={() => setScreen('driver_profile')} />;
    default:
      return <Loading message="Abrindo a tela inicial..." />;
  }
};

// ─── Root: route by auth + role ──────────────────────────────────────────────
const AppNavigator: React.FC = () => {
  const { session, profile, loading, profileError, signOut, refreshProfile } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const { ready: recoveryReady, active: passwordRecovery, clear: clearPasswordRecovery } = usePasswordRecoveryLink();

  useEffect(() => {
    if (session && profile && profile.role !== 'driver' && profile.role !== 'passenger') {
      void signOut();
    }
  }, [session?.user.id, profile?.role]);

  if (!splashDone) return <SplashScreen onFinish={() => setSplashDone(true)} />;
  if (!recoveryReady) return <Loading message="Preparando o app..." />;
  if (passwordRecovery) return <ResetPasswordScreen onFinished={clearPasswordRecovery} />;
  if (loading) return <Loading message="Restaurando sua sessão..." />;
  if (!session) return <AuthFlow />;   // truly signed out
  if (!profile) {
    if (profileError) return <ProfileRecovery error={profileError} onRetry={() => { void refreshProfile(); }} onSignOut={() => { void signOut(); }} />;
    return <Loading message="Carregando seu perfil..." />;
  }
  if (profile.role === 'driver') return <DriverFlow />;
  if (profile.role === 'passenger') return <PassengerFlow />;
  return <Loading />; // administradores e gerentes acessam somente os painéis web
};

export default AppNavigator;
