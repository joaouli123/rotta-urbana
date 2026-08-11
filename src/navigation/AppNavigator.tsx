import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Alert, Linking, Share } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants';
import { supabase } from '../lib/supabase';
import { parsePasswordRecoveryUrl } from '../services/authRecovery';
import { usePasswordRecoveryLink } from '../hooks/usePasswordRecoveryLink';
import type { RideRow, RideTypeDb } from '../types/db';
import { requestRide, cancelRide, subscribeToRide, updateRideStatus, acceptRide, getRidePoints, getRide, getActiveRide, relaxFemalePreference, getRideCounterpart } from '../services/rides';
import { getSearchingRides, subscribeSearchingRides, declineRide, hasDeclinedRide, setStatus, updateLocation, getMyDriver } from '../services/drivers';
import { playSound, stopSound } from '../lib/sounds';
import { registerForPushNotifications, clearPushToken } from '../services/push';
import { showSearchingNotification, showDriverFoundNotification, clearRideNotification, ensureNotificationPermission } from '../services/localNotifications';
import { selectPlan, createSubscriptionCheckout, buildRideFarePix } from '../services/payments';
import { friendlyError } from '../lib/errors';

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
  const rideStateRef = useRef<{ id: string | null; status: string | null }>({ id: null, status: null });

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
      rideStateRef.current = { id: ride.id, status: ride.status };
    }
    const apply = (r: RideRow) => {
      const changed = rideStateRef.current.id !== r.id || rideStateRef.current.status !== r.status;
      rideStateRef.current = { id: r.id, status: r.status };
      setRide(r);
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

  // On completion, tell the passenger how to pay the driver directly (per method).
  // Nothing here goes through the platform — payment is always P2P passenger ↔ driver.
  useEffect(() => {
    if (screen !== 'ride_completed' || !ride) return;
    (async () => {
      const valor = `R$ ${(ride.price ?? 0).toFixed(2)}`;
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

  const handleCancel = async (reason = 'Passageiro cancelou pelo app') => {
    if (passengerCancelling) return false;
    setPassengerCancelling(true);
    clearRideNotification();
    stopSound('searching');
    try {
      if (ride) await cancelRide(ride.id, reason);
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
        onCancel={handleCancel}
        destinationAddress={ride?.destination_address}
        price={ride?.price}
        distanceKm={ride?.distance_km}
        durationMin={ride?.duration_min}
        requiresFemaleDriver={ride?.requires_female_driver}
        rideStatus={ride?.status}
        onAcceptMale={handleAcceptMale}
      />;
    case 'ride_tracking':
      return <RideTrackingScreen rideId={ride?.id} status={ride?.status} origin={originCoords ?? undefined} destination={destCoords ?? undefined} price={ride?.price} distanceKm={ride?.distance_km} durationMin={ride?.duration_min} destinationAddress={ride?.destination_address} onCancel={handleCancel} onRideCompleted={() => setScreen('ride_completed')} onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])} />;
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
      return null;
  }
};

// ─── Driver flow ─────────────────────────────────────────────────────────────
type DScreen = 'driver_home' | 'ride_notification' | 'driver_active_ride' | 'driver_rate' | 'driver_earnings' | 'driver_documents' | 'driver_profile' | 'driver_rides' | 'driver_subscription' | 'driver_ratings' | 'driver_support';

const DriverFlow: React.FC = () => {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<DScreen>('driver_home');
  const [planType, setPlanType] = useState<PlanType | null | 'loading'>('loading');

  useEffect(() => {
    getDriverPlanType()
      .then((pt) => setPlanType(pt))
      .catch(() => setPlanType(null));
  }, []);
  const [online, setOnline] = useState(false);
  const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null);
  const [pendingRequest, setPendingRequest] = useState<RideRow | null>(null);
  const [activeRide, setActiveRide] = useState<RideRow | null>(null);
  const [ratingRide, setRatingRide] = useState<RideRow | null>(null);
  const [activePoints, setActivePoints] = useState<{ origin: [number, number]; dest: [number, number] } | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  // Rides this driver has already declined — kept out of the poll/realtime
  // feed so a decline doesn't keep resurfacing the same ride every few seconds.
  const rejectedIdsRef = useRef<Set<string>>(new Set());

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
    if (!online || activeRide || pendingRequest) return;
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
  }, [online, activeRide?.id, pendingRequest?.id]);

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

  // Reconnect to the driver's active ride after a process restart and follow
  // passenger/admin cancellation while the driver is on the road.
  useEffect(() => {
    if (!activeRide) return;
    let currentStatus = activeRide.status;
    let currentUpdatedAt = activeRide.updated_at;
    const apply = (r: RideRow) => {
      if (r.status === currentStatus && r.updated_at === currentUpdatedAt) return;
      currentStatus = r.status;
      currentUpdatedAt = r.updated_at;
      if (r.status === 'cancelled') {
        stopSound('request');
        setActiveRide(null);
        setScreen('driver_home');
        Alert.alert('Corrida cancelada', r.cancel_reason || 'O passageiro cancelou a corrida.');
        return;
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

  // Register for push (ride alerts even with the app closed) and restore the
  // online state if the server still has us online — e.g. reopened from a push.
  useEffect(() => {
    registerForPushNotifications();
    Promise.all([getMyDriver(), getActiveRide()]).then(([d, current]) => {
      if (current?.driver_id && current.driver_id === d?.id) {
        setActiveRide(current);
        setScreen('driver_active_ride');
      } else if (d?.status === 'online') {
        setOnline(true);
      }
    }).catch(() => {});
  }, []);

  // Stop the GPS watch when leaving the driver area.
  useEffect(() => () => { watchRef.current?.remove(); }, []);

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
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 4000 },
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
      stopSound('request');
      playSound('accept');
      setActiveRide(accepted);
      setPendingRequest(null);
      setScreen('driver_active_ride');
    } catch (e: any) {
      Alert.alert('Corrida indisponível', friendlyError(e?.message));
      setPendingRequest(null);
      setScreen('driver_home');
    }
  };

  const completeRide = () => {
    playSound('complete');
    // The ride was already marked 'completed' inside DriverActiveRideScreen (goNext).
    // Re-calling updateRideStatus here would fail and show a false error — instead,
    // move to the passenger-rating step.
    if (activeRide) { setRatingRide(activeRide); setActiveRide(null); setScreen('driver_rate'); }
    else setScreen('driver_home');
  };

  const startSubPayment = async (plan: 'daily' | 'weekly' | 'monthly') => {
    try {
      await selectPlan(plan);
      const checkout = await createSubscriptionCheckout(plan);
      const label = plan === 'daily' ? 'Diária' : plan === 'weekly' ? 'Semanal' : 'Mensal';
      await Linking.openURL(checkout.init_point);
      Alert.alert('Checkout aberto', `Pague com cartão ou Pix para ativar a assinatura ${label}. A cobrança recorrente será gerenciada pelo Mercado Pago.`);
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e?.message));
    }
  };

  const paySubscription = () => {
    Alert.alert('Plano da assinatura', 'Como você quer pagar?', [
      { text: 'Diária', onPress: () => startSubPayment('daily') },
      { text: 'Semanal', onPress: () => startSubPayment('weekly') },
      { text: 'Mensal', onPress: () => startSubPayment('monthly') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const openMenu = () => setScreen('driver_profile');

  if (planType === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  if (planType === null) {
    return (
      <PlanSelectionScreen
        onDone={() => {
          getDriverPlanType().then((pt) => setPlanType(pt ?? 'commission'));
        }}
      />
    );
  }

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
            onRides={() => setScreen('driver_rides')}
            onRatings={() => setScreen('driver_ratings')}
            onSubscription={() => setScreen('driver_subscription')}
          />
          {screen === 'ride_notification' && pendingRequest && (
            <RideRequestNotification
              ride={pendingRequest}
              driverCoords={driverCoords ?? undefined}
              onAccept={handleAccept}
              onReject={() => {
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
        <DriverActiveRideScreen
          rideId={activeRide?.id}
          origin={activePoints?.origin}
          destination={activePoints?.dest}
          originAddress={activeRide?.origin_address}
          destinationAddress={activeRide?.destination_address}
          paymentMethod={activeRide?.payment_method}
          onCompleted={completeRide}
          onCancel={() => { setActiveRide(null); setScreen('driver_home'); }}
          onPanic={() => Alert.alert('Emergência', 'Deseja ligar para a emergência (190)?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ligar 190', style: 'destructive', onPress: () => Linking.openURL('tel:190') }])}
        />
      );
    case 'driver_rate':
      return (
        <DriverRatePassengerScreen
          rideId={ratingRide?.id}
          onDone={() => { setRatingRide(null); setScreen('driver_home'); }}
        />
      );
    case 'driver_earnings':
      return <DriverEarningsScreen onBack={() => setScreen('driver_home')} />;
    case 'driver_documents':
      return <DriverDocumentsScreen onBack={() => setScreen('driver_home')} />;
    case 'driver_support':
      return <SupportScreen onBack={() => setScreen('driver_profile')} onSubmit={() => setScreen('driver_home')} />;
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
      return <DriverSubscriptionScreen onBack={() => setScreen('driver_profile')} />;
    case 'driver_ratings':
      return <DriverRatingsScreen onBack={() => setScreen('driver_profile')} />;
    default:
      return null;
  }
};

// ─── Root: route by auth + role ──────────────────────────────────────────────
const AppNavigator: React.FC = () => {
  const { session, profile, loading, signOut } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const { ready: recoveryReady, active: passwordRecovery, clear: clearPasswordRecovery } = usePasswordRecoveryLink();

  useEffect(() => {
    if (session && profile && profile.role !== 'driver' && profile.role !== 'passenger') {
      void signOut();
    }
  }, [session?.user.id, profile?.role]);

  if (!splashDone) return <SplashScreen onFinish={() => setSplashDone(true)} />;
  if (!recoveryReady) return <Loading />;
  if (passwordRecovery) return <ResetPasswordScreen onFinished={clearPasswordRecovery} />;
  if (loading) return <Loading />;
  if (!session) return <AuthFlow />;   // truly signed out
  if (!profile) return <Loading />;    // signed in but profile still fetching — never flash AuthFlow
  if (profile.role === 'driver') return <DriverFlow />;
  if (profile.role === 'passenger') return <PassengerFlow />;
  return <Loading />; // administradores e gerentes acessam somente os painéis web
};

export default AppNavigator;
