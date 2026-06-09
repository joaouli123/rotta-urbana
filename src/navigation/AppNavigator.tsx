import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants';
import type { RideRow, RideTypeDb } from '../types/db';
import { requestRide, cancelRide, subscribeToRide, updateRideStatus, acceptRide, getRidePoints, getRide } from '../services/rides';
import { getSearchingRides, subscribeSearchingRides, setStatus, updateLocation } from '../services/drivers';
import { setSubscriptionPlan, buildSubscriptionPix, buildRideFarePix } from '../services/payments';
import { friendlyError } from '../lib/errors';

// Auth
import SplashScreen from '../screens/auth/SplashScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterPassengerScreen from '../screens/auth/RegisterPassengerScreen';
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

// Admin
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminDriversScreen from '../screens/admin/AdminDriversScreen';
import AdminPaymentsScreen from '../screens/admin/AdminPaymentsScreen';
import AdminMonitoringScreen from '../screens/admin/AdminMonitoringScreen';
import AdminSupportScreen from '../screens/admin/AdminSupportScreen';

// Sinop, MT center — fallback when GPS is unavailable. [lng, lat]
const SINOP: [number, number] = [-55.5024, -11.8642];

async function getOrigin(): Promise<[number, number]> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return [pos.coords.longitude, pos.coords.latitude];
    }
  } catch { /* ignore */ }
  return SINOP;
}

const Loading = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
    <ActivityIndicator size="large" color={Colors.primary} />
  </View>
);

// ─── Auth flow (logged out) ──────────────────────────────────────────────────
const AuthFlow: React.FC = () => {
  const [screen, setScreen] = useState<'onboarding' | 'login' | 'register_passenger' | 'register_driver'>('onboarding');
  switch (screen) {
    case 'onboarding':
      return <OnboardingScreen onComplete={() => setScreen('login')} />;
    case 'register_passenger':
      return <RegisterPassengerScreen onBack={() => setScreen('login')} />;
    case 'register_driver':
      return <RegisterDriverScreen onBack={() => setScreen('login')} />;
    case 'login':
    default:
      return (
        <LoginScreen
          onRegister={() => setScreen('register_passenger')}
          onRegisterDriver={() => setScreen('register_driver')}
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

  // Realtime: advance the UI as the ride's status changes server-side.
  useEffect(() => {
    if (!ride || (screen !== 'ride_matching' && screen !== 'ride_tracking')) return;
    const apply = (r: RideRow) => {
      setRide(r);
      if (['driver_on_way', 'driver_arrived', 'in_progress'].includes(r.status)) {
        setScreen((s) => (s === 'ride_matching' ? 'ride_tracking' : s));
      } else if (r.status === 'completed') {
        setScreen('ride_completed');
      } else if (r.status === 'cancelled') {
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

  // On completion, surface the PIX copia-e-cola to pay the driver directly.
  useEffect(() => {
    if (screen !== 'ride_completed' || !ride) return;
    (async () => {
      try {
        const pix = await buildRideFarePix(ride.id);
        if (pix?.code) {
          Alert.alert(`Pagar ${pix.driverName}`,
            `Valor: R$ ${pix.amount.toFixed(2)} — PIX direto ao motorista\n\nCopia-e-cola:\n${pix.code}`);
        }
      } catch { /* driver may not have a PIX key yet */ }
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
        const { geocode } = await import('../services/geo');
        destLngLat = originLngLat;
        const places = await geocode(destText || 'Sinop, MT', originLngLat);
        if (places[0]) { destLngLat = [places[0].lng, places[0].lat]; destAddr = places[0].address || places[0].name; }
      }
      setOriginCoords(originLngLat);
      setDestCoords(destLngLat);
      const created = await requestRide({
        originLat: originLngLat[1], originLng: originLngLat[0], originAddress: originAddr,
        destLat: destLngLat[1], destLng: destLngLat[0], destAddress: destAddr,
        rideType: type, paymentMethod: 'pix',
      });
      setRide(created);
      setScreen('ride_matching');
    } catch (e: any) {
      Alert.alert('Não foi possível pedir a corrida', friendlyError(e?.message));
    }
  };

  const handleCancel = async () => {
    try { if (ride) await cancelRide(ride.id); } catch { /* ignore */ }
    setRide(null);
    setScreen('passenger_home');
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
      return <RideMatchingScreen onDriverFound={() => setScreen('ride_tracking')} onCancel={handleCancel} />;
    case 'ride_tracking':
      return <RideTrackingScreen rideId={ride?.id} status={ride?.status} origin={originCoords ?? undefined} destination={destCoords ?? undefined} onRideCompleted={() => setScreen('ride_completed')} onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])} />;
    case 'ride_completed':
      return (
        <RideCompletedScreen
          rideType={rideType}
          onGoHome={() => { setRide(null); setScreen('passenger_home'); }}
          onSupport={() => setScreen('support')}
          onProfile={() => setScreen('passenger_profile')}
        />
      );
    case 'ride_history':
      return <RideHistoryScreen onBack={() => setScreen('passenger_home')} />;
    case 'passenger_profile':
      return (
        <PassengerProfileScreen
          onBack={() => setScreen('passenger_home')}
          onLogout={signOut}
          onSupport={() => setScreen('support')}
        />
      );
    case 'support':
      return <SupportScreen onBack={() => setScreen('passenger_profile')} onSubmit={() => setScreen('passenger_home')} />;
    default:
      return null;
  }
};

// ─── Driver flow ─────────────────────────────────────────────────────────────
type DScreen = 'driver_home' | 'ride_notification' | 'driver_active_ride' | 'driver_earnings' | 'driver_documents';

const DriverFlow: React.FC = () => {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<DScreen>('driver_home');
  const [online, setOnline] = useState(false);
  const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null);
  const [pendingRequest, setPendingRequest] = useState<RideRow | null>(null);
  const [activeRide, setActiveRide] = useState<RideRow | null>(null);
  const [activePoints, setActivePoints] = useState<{ origin: [number, number]; dest: [number, number] } | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // New ride requests push the driver to the notification screen (when free).
  useEffect(() => {
    const unsub = subscribeSearchingRides((r) => {
      if (!online || activeRide) return;
      setPendingRequest((cur) => cur ?? r);
      if (screenRef.current === 'driver_home') setScreen('ride_notification');
    });
    return unsub;
  }, [online, activeRide]);

  // If the pending ride is accepted by another driver or cancelled, dismiss it.
  useEffect(() => {
    if (!pendingRequest) return;
    const unsub = subscribeToRide(pendingRequest.id, (r) => {
      if (r.status !== 'searching') {
        setPendingRequest(null);
        if (screenRef.current === 'ride_notification') setScreen('driver_home');
      }
    });
    return unsub;
  }, [pendingRequest?.id]);

  // Stop the GPS watch when leaving the driver area.
  useEffect(() => () => { watchRef.current?.remove(); }, []);

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
          const existing = await getSearchingRides();
          if (existing.length > 0) {
            setPendingRequest((cur) => cur ?? existing[0]);
            setScreen('ride_notification');
          }
        } catch { /* no existing rides or not verified */ }
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 6000 },
          (pos) => {
            setDriverCoords([pos.coords.longitude, pos.coords.latitude]);
            updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading ?? undefined).catch(() => {});
          },
        );
      } catch (e: any) {
        Alert.alert('Não foi possível ficar online', `${friendlyError(e?.message)}\nSeu cadastro precisa estar verificado pelo admin.`);
      }
    } else {
      watchRef.current?.remove();
      watchRef.current = null;
      try { await setStatus('offline'); } catch { /* ignore */ }
      setOnline(false);
    }
  };

  const handleAccept = async () => {
    if (!pendingRequest) return;
    try {
      const accepted = await acceptRide(pendingRequest.id);
      setActiveRide(accepted);
      setPendingRequest(null);
      setScreen('driver_active_ride');
    } catch (e: any) {
      Alert.alert('Corrida indisponível', friendlyError(e?.message));
      setPendingRequest(null);
      setScreen('driver_home');
    }
  };

  const completeRide = async () => {
    try { if (activeRide) await updateRideStatus(activeRide.id, 'completed'); } catch (e: any) { Alert.alert('Erro', friendlyError(e?.message)); }
    setActiveRide(null);
    setScreen('driver_home');
  };

  const startSubPayment = async (plan: 'daily' | 'monthly') => {
    try {
      const sub = await setSubscriptionPlan(plan);
      const pix = await buildSubscriptionPix();
      const label = plan === 'daily' ? 'Diária' : 'Mensal';
      if (!pix?.code) {
        Alert.alert('PIX indisponível', 'O admin precisa cadastrar a chave PIX da plataforma no painel.');
        return;
      }
      Alert.alert(
        `Assinatura ${label} — R$ ${Number(sub.amount).toFixed(2)}`,
        `Pague via PIX copia-e-cola abaixo. A confirmação é feita pelo admin:\n\n${pix.code}`,
        [{ text: 'OK' }],
      );
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e?.message));
    }
  };

  const paySubscription = () => {
    Alert.alert('Plano da assinatura', 'Como você quer pagar?', [
      { text: 'Diária', onPress: () => startSubPayment('daily') },
      { text: 'Mensal', onPress: () => startSubPayment('monthly') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const openMenu = () => {
    Alert.alert('Conta', undefined, [
      { text: 'Pagar assinatura', onPress: paySubscription },
      { text: 'Sair', style: 'destructive', onPress: signOut },
      { text: 'Fechar', style: 'cancel' },
    ]);
  };

  switch (screen) {
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
          />
          {screen === 'ride_notification' && pendingRequest && (
            <RideRequestNotification
              onAccept={handleAccept}
              onReject={() => { setPendingRequest(null); setScreen('driver_home'); }}
            />
          )}
        </View>
      );
    case 'driver_active_ride':
      return (
        <DriverActiveRideScreen
          rideId={activeRide?.id}
          origin={activePoints?.origin}
          destination={activePoints?.dest}
          onCompleted={completeRide}
          onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])}
        />
      );
    case 'driver_earnings':
      return <DriverEarningsScreen onBack={() => setScreen('driver_home')} />;
    case 'driver_documents':
      return <DriverDocumentsScreen onBack={() => setScreen('driver_home')} />;
    default:
      return null;
  }
};

// ─── Admin flow ──────────────────────────────────────────────────────────────
type AScreen = 'admin_dashboard' | 'admin_drivers' | 'admin_payments' | 'admin_monitoring' | 'admin_support';

const AdminFlow: React.FC = () => {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<AScreen>('admin_dashboard');
  switch (screen) {
    case 'admin_dashboard':
      return (
        <AdminDashboardScreen
          onDrivers={() => setScreen('admin_drivers')}
          onPayments={() => setScreen('admin_payments')}
          onMonitoring={() => setScreen('admin_monitoring')}
          onReports={() => Alert.alert('Conta', undefined, [{ text: 'Sair', style: 'destructive', onPress: signOut }, { text: 'Fechar', style: 'cancel' }])}
          onSupport={() => setScreen('admin_support')}
        />
      );
    case 'admin_drivers':
      return <AdminDriversScreen onBack={() => setScreen('admin_dashboard')} onDriverDetail={() => {}} />;
    case 'admin_payments':
      return <AdminPaymentsScreen onBack={() => setScreen('admin_dashboard')} />;
    case 'admin_monitoring':
      return <AdminMonitoringScreen onBack={() => setScreen('admin_dashboard')} />;
    case 'admin_support':
      return <AdminSupportScreen onBack={() => setScreen('admin_dashboard')} />;
    default:
      return null;
  }
};

// ─── Root: route by auth + role ──────────────────────────────────────────────
const AppNavigator: React.FC = () => {
  const { session, profile, loading } = useAuth();

  if (loading) return <Loading />;
  if (!session) return <AuthFlow />;   // truly signed out
  if (!profile) return <Loading />;    // signed in but profile still fetching — never flash AuthFlow
  if (profile.role === 'driver') return <DriverFlow />;
  if (profile.role === 'admin') return <AdminFlow />;
  return <PassengerFlow />;
};

export default AppNavigator;
