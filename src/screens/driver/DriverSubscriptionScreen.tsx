import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState, BackHandler,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, AlertCircle, RefreshCw, Check, Zap, Clock, Wallet, HelpCircle, LogOut,
} from 'lucide-react-native';
import { Colors } from '../../constants';
import {
  getAppSettings, loadSubscriptionSnapshot, selectCommissionPlan, planPrice, getSubscription,
  isSubscriptionCurrent, isPlanLapsed, isPassPlan, planHoursLeft, planAutoRenews, PLAN_DAYS,
  getDriverPlanType, getDriverPlanSegment, getMercadoPagoConnectionStatus, startMercadoPagoConnection,
  disconnectMercadoPago, type PlanType, type PendingCheckout, type PendingPass, type SubscriptionSnapshot,
} from '../../services/payments';
import { getMyPrimaryVehicleSegment } from '../../services/drivers';
import type { SubscriptionRow, AppSettings, PlanSegment } from '../../types/db';
import type { MercadoPagoConnectionStatus } from '../../services/payments';
import {
  usePlanPayment, PlanPaymentPanel, PlanSuccess, activePlanMessage, takeReturnSignal,
  PLAN_LABELS, fmtBRL, fmtDate, fmtCutoff, cutoffPhrase, type PaidPlan,
} from '../../components/PlanPayment';

// ── Helpers ───────────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function mercadoPagoCallback(url?: string): { status: 'success' | 'error'; message: string | null } | null {
  if (!url?.startsWith('rotta-urbana://mercadopago/connected')) return null;
  try {
    const parsed = new URL(url);
    const status = parsed.searchParams.get('status');
    return status === 'success' || status === 'error'
      ? { status, message: parsed.searchParams.get('message') || parsed.searchParams.get('error_description') }
      : null;
  } catch { return null; }
}

const MERCADO_PAGO_APP_REDIRECT_URI = 'rotta-urbana://mercadopago/connected';

const RELEASING_NOTE = 'Pagamento recebido! Estamos liberando o seu acesso, o que pode levar alguns segundos. '
  + 'Toque em "Ir para as corridas" de novo. Se não liberar, fale com o suporte.';

// Plan dates are UTC calendar days, as in the database.
const todayIso = () => new Date().toISOString().slice(0, 10);
function addDaysIso(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The due date a daily or weekly payment made now gives: days stack on a paid plan still running. */
function passDueIfPaidNow(sub: SubscriptionRow | null, plan: 'daily' | 'weekly') {
  const today = todayIso();
  const due = String(sub?.due_date || '').slice(0, 10);
  const running = sub?.status === 'active' && !!sub.plan && sub.plan !== 'commission' && due >= today;
  return addDaysIso(running ? due : today, PLAN_DAYS[plan]);
}

// ── Plan definitions ──────────────────────────────────────────────────────────
interface PlanDef {
  id: PlanType;
  title: string;
  description: string;
  price: number;
  /** Priced by the admin now; a plan listed only because the driver has it is not. */
  payable: boolean;
  priceMain: string;
  priceUnit: string;
  priceStrike?: string;
  badge?: string;
  badgeColor: string;
  accentColor: string;
}

// One tab per plan on offer, as on PlanSelectionScreen.
const TAB_ORDER: PlanType[] = ['commission', 'daily', 'weekly', 'monthly'];
const TAB_LABELS: Record<PlanType, string> = {
  commission: 'Por corrida', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal',
};

function buildPlans(settings: AppSettings | null, segment: PlanSegment, sub: SubscriptionRow | null): PlanDef[] {
  const pct = segment === 'moto'
    ? (settings?.moto_commission_pct ?? settings?.commission_pct ?? 15)
    : (settings?.commission_pct ?? 15);
  // A plan the admin has not priced is not offered. The one the driver has
  // still shows, at what was paid, but cannot be bought again.
  const price = (plan: PaidPlan) => planPrice(settings, plan, segment)
    || (sub?.plan === plan && Number(sub.amount) > 0 ? Number(sub.amount) : 0);
  const payable = (plan: PaidPlan) => planPrice(settings, plan, segment) > 0;
  const daily = price('daily');
  const weekly = price('weekly');
  const monthly = price('monthly');

  const plans: PlanDef[] = [{
    id: 'commission', title: 'Por Corrida', price: 0, payable: true,
    description: 'Sem mensalidade. Pague comissão só quando trabalhar.',
    priceMain: pct + '%', priceUnit: 'por corrida',
    badge: 'IMEDIATO', badgeColor: '#6DC228', accentColor: '#6DC228',
  }];
  if (daily > 0) {
    plans.push({
      id: 'daily', title: 'Diário', price: daily, payable: payable('daily'),
      description: 'Pague com Pix na hora e trabalhe sem limite. Não renova sozinho.',
      priceMain: fmtBRL(daily), priceUnit: 'por dia',
      badgeColor: '#3B82F6', accentColor: '#3B82F6',
    });
  }
  if (weekly > 0) {
    plans.push({
      id: 'weekly', title: 'Semanal', price: weekly, payable: payable('weekly'),
      description: '7 dias por Pix ou cartão. Pagamento único, sem renovação automática.',
      priceMain: fmtBRL(weekly), priceUnit: 'por semana',
      priceStrike: payable('daily') && daily * 7 > weekly ? fmtBRL(daily * 7) + '/sem' : undefined,
      badge: 'POPULAR', badgeColor: '#7C3AED', accentColor: '#7C3AED',
    });
  }
  if (monthly > 0) {
    const strike = payable('weekly') && weekly * 4 > monthly ? fmtBRL(weekly * 4) + '/mês' : undefined;
    plans.push({
      id: 'monthly', title: 'Mensal', price: monthly, payable: payable('monthly'),
      description: 'Assinatura no cartão, renovada todo mês. Cancele quando quiser.',
      priceMain: fmtBRL(monthly), priceUnit: 'por mês',
      priceStrike: strike,
      badge: strike ? 'ECONOMIA' : undefined, badgeColor: '#F59E0B', accentColor: '#F59E0B',
    });
  }
  return plans;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface DriverSubscriptionScreenProps {
  onBack: () => void;
  /** Called after the plan changed here, so the app re-checks access. */
  /** `row` is a plan the app just read as paid, to unlock without waiting. */
  onSubscriptionChanged?: (row?: SubscriptionRow | null) => void;
  /** Bumped each time a Mercado Pago return link reaches the app. */
  returnSignal?: number;
  /** No plan in date: this screen, Financeiro and Suporte are all the driver can open. */
  blocked?: boolean;
  /**
   * To the rides, after a plan is paid or chosen; resolves once access was
   * checked, with false when the plan is not in date yet and the driver stays.
   */
  onHome?: () => void | boolean | Promise<void | boolean>;
  onEarnings?: () => void;
  onSupport?: () => void;
  onLogout?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
const DriverSubscriptionScreen: React.FC<DriverSubscriptionScreenProps> = ({
  onBack, onSubscriptionChanged, returnSignal = 0, blocked = false, onHome, onEarnings, onSupport, onLogout,
}) => {
  const insets = useSafeAreaInsets();

  const [sub, setSub]           = useState<SubscriptionRow | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [pendingPass, setPendingPass] = useState<PendingPass | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanType | null>(null);
  const [currentSegment, setCurrentSegment] = useState<PlanSegment | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadPromise = useRef<Promise<void> | null>(null);
  const hasLoaded = useRef(false);
  const mounted = useRef(true);
  const [mpConnection, setMpConnection] = useState<MercadoPagoConnectionStatus | null>(null);
  const [connectingMp, setConnectingMp] = useState(false);
  // One browser session at a time: the account connection and a checkout
  // would otherwise share it and settle each other.
  const connectingRef = useRef(false);
  // A plan being started here, or the switch to Por Corrida.
  const [startingPlan, setStartingPlan] = useState<PlanType | null>(null);
  // The plan tab the driver picked; until then it follows the plan state.
  const [tab, setTab] = useState<PlanType | null>(null);
  const busyRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // A plan chosen without a payment on screen (Por Corrida, or one already paid).
  const [success, setSuccess] = useState<{ title: string; message: string } | null>(null);
  const successRef = useRef(success);
  successRef.current = success;
  // Paid, but the app does not see the plan in date yet: the confirmation
  // stays, with a note, until it does.
  const [releasing, setReleasing] = useState(false);
  const releasingRef = useRef(releasing);
  releasingRef.current = releasing;
  // "Ver meu plano" after a confirmation: the way to the rides stays on top.
  const [homeLink, setHomeLink] = useState(false);
  // The last snapshot read, for what a return link brought.
  const lastSnapshotRef = useRef<SubscriptionSnapshot | null>(null);
  // While a return link is being checked, an unlock waits for its answer.
  const holdHomeRef = useRef(false);
  const homeHeldRef = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);

  const onSubscriptionChangedRef = useRef(onSubscriptionChanged);
  onSubscriptionChangedRef.current = onSubscriptionChanged;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  const load = useCallback((): Promise<void> => {
    if (loadPromise.current) return loadPromise.current;
    const run = (async () => {
      if (!hasLoaded.current) setLoading(true);
      try {
        setLoadError(null);
        const result = await withTimeout((async () => {
          const [snapshot, cfg, connection] = await Promise.all([
            loadSubscriptionSnapshot(12_000),
            getAppSettings(),
            getMercadoPagoConnectionStatus().catch(() => null),
          ]);
          // Read after the sync: a confirmed payment switches the driver's plan.
          const [pt, driverSegment] = await Promise.all([getDriverPlanType(), getDriverPlanSegment()]);
          // The category follows the vehicle, as on the server: a saved one is
          // kept only while it fits (moto for a moto, a car category for a car).
          const vehicle = await getMyPrimaryVehicleSegment().catch(() => null);
          const saved = driverSegment ?? snapshot.subscription?.plan_segment ?? null;
          const segment: PlanSegment = saved && (!vehicle || (vehicle === 'moto') === (saved === 'moto'))
            ? saved
            : vehicle === 'moto' ? 'moto' : 'economy';
          return { snapshot, cfg, connection, pt, segment };
        })(), 30_000, 'A consulta demorou demais. Verifique sua conexão e toque em Tentar novamente.');
        if (!mounted.current) return;
        const { snapshot, cfg, connection, pt, segment } = result;
        lastSnapshotRef.current = snapshot;
        setSub(snapshot.subscription);
        setPendingCheckout(snapshot.pending_checkout);
        setPendingPass(snapshot.pending_pass);
        setSettings(cfg);
        setCurrentPlan(pt ?? snapshot.subscription?.plan ?? null);
        setCurrentSegment(segment);
        if (connection) setMpConnection(connection);
        hasLoaded.current = true;
        // A payment the server just confirmed: let the app unlock right away.
        if (blockedRef.current && isSubscriptionCurrent(snapshot.subscription)) onSubscriptionChangedRef.current?.(snapshot.subscription);
      } catch (error) {
        if (mounted.current) setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar seu plano. Tente novamente.');
      } finally {
        loadPromise.current = null;
        if (mounted.current) setLoading(false);
      }
    })();
    loadPromise.current = run;
    return run;
  }, []);

  const onConfirmed = useCallback((row: SubscriptionRow | null) => {
    if (row) {
      setSub(row);
      if (row.plan) setCurrentPlan(row.plan);
      if (row.plan_segment) setCurrentSegment(row.plan_segment);
    }
    setPendingPass(null);
    setPendingCheckout(null);
    onSubscriptionChangedRef.current?.(row);
    void load();
  }, [load]);

  const payment = usePlanPayment({ onConfirmed });
  const { session } = payment;
  const paymentRef = useRef(payment);
  paymentRef.current = payment;

  const connectMercadoPago = async () => {
    if (connectingRef.current || busyRef.current || payment.session || payment.busy) return;
    connectingRef.current = true;
    setConnectingMp(true);
    try {
      const url = await startMercadoPagoConnection();
      const result = await WebBrowser.openAuthSessionAsync(url, MERCADO_PAGO_APP_REDIRECT_URI, {
        showTitle: true,
        createTask: false,
      });
      const callback = result.type === 'success' ? mercadoPagoCallback(result.url) : null;
      const status = await getMercadoPagoConnectionStatus().catch(() => null);
      if (!mounted.current) return;
      if (status) setMpConnection(status);
      void load();
      if (status?.connected || (callback?.status === 'success' && !status)) {
        Alert.alert('Mercado Pago conectado', 'Sua conta foi vinculada e está pronta para receber os repasses automáticos.');
      } else if (callback?.status === 'error') {
        Alert.alert('Não foi possível conectar', callback.message || 'O Mercado Pago não confirmou a autorização. Tente novamente.');
      } else {
        // Mercado Pago shows its own "não foi possível conectar" page and never
        // returns to the app, so a closed browser is all the app gets.
        Alert.alert(
          'Conexão não concluída',
          'A conta não foi vinculada. Se o Mercado Pago mostrou "não foi possível conectar o aplicativo", '
            + 'entre com a sua conta principal (a titular, não um colaborador) e com o cadastro verificado. '
            + 'Se continuar, fale com o suporte do Rotta Urbana.',
        );
      }
    } catch (error) {
      if (mounted.current) Alert.alert('Não foi possível conectar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      connectingRef.current = false;
      if (mounted.current) setConnectingMp(false);
    }
  };

  const disconnect = () => Alert.alert('Desconectar Mercado Pago?', 'Sem essa conexão, o repasse automático das corridas pelo app ficará indisponível.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desconectar', style: 'destructive', onPress: async () => {
      try { await disconnectMercadoPago(); setMpConnection(null); }
      catch (error) { Alert.alert('Erro', error instanceof Error ? error.message : 'Tente novamente.'); }
    } },
  ]);

  useEffect(() => {
    void load();
    const listener = AppState.addEventListener('change', (state) => {
      // Native alerts and payment sheets can briefly leave the active state.
      // Refresh silently on return so dismissing an alert never replaces the
      // whole screen with a blocking spinner.
      if (state === 'active' && hasLoaded.current) void load();
    });
    return () => listener.remove();
  }, [load]);

  // The Mercado Pago return link, also when it is what opened this screen.
  useEffect(() => {
    if (!takeReturnSignal(returnSignal)) return;
    if (paymentRef.current.session) {
      paymentRef.current.markReturned();
      void load();
      return;
    }
    // No payment on screen (the app was closed while paying): show what came
    // of it before going anywhere.
    const wasBlockedNow = blockedRef.current;
    holdHomeRef.current = true;
    homeHeldRef.current = false;
    void (async () => {
      try {
        // A read started before the return may not have the payment yet.
        if (loadPromise.current) await loadPromise.current;
        lastSnapshotRef.current = null;
        await load();
        if (!mounted.current) return;
        const snap = lastSnapshotRef.current as SubscriptionSnapshot | null;
        const row = snap?.subscription ?? null;
        const paidAt = row?.paid_at ? Date.parse(row.paid_at) : NaN;
        const justPaid = Number.isFinite(paidAt) && Date.now() - paidAt < 30 * 60_000;
        const paidPlan = isSubscriptionCurrent(row) && !!row?.plan && row.plan !== 'commission';
        const otherPending = !!snap?.pending_checkout || (!!snap?.pending_pass?.plan && snap.pending_pass.plan !== row?.plan);
        if (snap && paidPlan && (wasBlockedNow || justPaid) && !otherPending
          && !paymentRef.current.session && !successRef.current) {
          setSuccess({
            title: 'Pagamento confirmado!',
            message: `${activePlanMessage(row)} Você já pode ficar online e aceitar corridas.`,
          });
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        } else if (homeHeldRef.current && !paymentRef.current.session && !successRef.current) {
          void onHomeRef.current?.();
        }
      } finally {
        holdHomeRef.current = false;
        homeHeldRef.current = false;
      }
    })();
  }, [returnSignal, load]);

  // A new payment opens at the top, where the panel is.
  const sessionKey = session ? `${session.plan}:${session.startedAt}` : '';
  useEffect(() => {
    if (sessionKey) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [sessionKey]);
  // Back on the plans, the tab is the plan of the last payment opened.
  const sessionPlan = session?.plan ?? null;
  useEffect(() => {
    if (sessionPlan) setTab(sessionPlan);
  }, [sessionPlan]);

  const closePanel = useCallback(() => {
    paymentRef.current.close();
    void load();
  }, [load]);

  // To the rides. The app answers false while it does not see the plan in
  // date yet: the confirmation stays, with a note, instead of the plans.
  const finishPayment = useCallback(async () => {
    const left = await onHomeRef.current?.();
    if (!mounted.current) return;
    if (left === false) { setReleasing(true); return; }
    setReleasing(false);
    paymentRef.current.close();
    void load();
  }, [load]);

  const leaveSuccess = useCallback(async () => {
    const left = await onHomeRef.current?.();
    if (!mounted.current) return;
    if (left === false) { setReleasing(true); return; }
    setReleasing(false);
    setSuccess(null);
  }, []);

  // "Ver meu plano": the plan page, with the way to the rides on top.
  const viewPlanAfterPayment = useCallback(() => {
    setHomeLink(true);
    setReleasing(false);
    closePanel();
  }, [closePanel]);
  const viewPlanAfterSuccess = useCallback(() => {
    setHomeLink(true);
    setReleasing(false);
    setSuccess(null);
  }, []);

  // The arrow and Android's back button leave the payment panel first. With
  // no plan in date there is nowhere else to go back to.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const handleBack = useCallback((): boolean => {
    if (paymentRef.current.session) {
      // After a confirmed payment, back does what "Ir para as corridas" does.
      if (paymentRef.current.confirmed) void finishPayment();
      else closePanel();
      return true;
    }
    if (successRef.current) {
      void leaveSuccess();
      return true;
    }
    if (blockedRef.current) return false;
    onBackRef.current();
    return true;
  }, [closePanel, finishPayment, leaveSuccess]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  // Unlocked while here (a late payment, the admin): back to work. A payment
  // or a plan chosen on screen shows its confirmation first.
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    const was = wasBlocked.current;
    wasBlocked.current = blocked;
    if (!was || blocked) return;
    // The driver already asked for the rides: the access came through now.
    if (releasingRef.current) {
      if (paymentRef.current.session) void finishPayment();
      else if (successRef.current) void leaveSuccess();
      return;
    }
    if (paymentRef.current.session || successRef.current) return;
    // A return link is being checked: it may have a confirmation to show.
    if (holdHomeRef.current) { homeHeldRef.current = true; return; }
    void onHomeRef.current?.();
  }, [blocked, finishPayment, leaveSuccess]);

  const segmentForPlans: PlanSegment = currentSegment ?? 'economy';
  const plans = buildPlans(settings, segmentForPlans, sub);
  const planIsCurrent = isSubscriptionCurrent(sub);
  const runningPaid = planIsCurrent && !!sub?.plan && sub.plan !== 'commission';
  const autoRenews = planAutoRenews(sub);
  const busyAny = startingPlan !== null || payment.busy !== null || connectingMp;

  // Unpaid payments the driver can pick up where they left off.
  const segmentMatches = (segment: PlanSegment | null) => !segment || segment === segmentForPlans;
  const resumablePass = pendingPass?.plan && segmentMatches(pendingPass.plan_segment) ? pendingPass : null;
  const resumableCheckout = pendingCheckout?.plan === 'monthly' && pendingCheckout.init_point
    && segmentMatches(pendingCheckout.plan_segment) ? pendingCheckout : null;
  const awaitingPlans = new Set<PlanType>();
  if (resumablePass?.plan) awaitingPlans.add(resumablePass.plan);
  if (resumableCheckout?.plan) awaitingPlans.add(resumableCheckout.plan);
  if (sub?.status === 'pending' && sub.plan && sub.plan !== 'commission') awaitingPlans.add(sub.plan);
  // A card payment under review: the plan is freed when it clears.
  const reviewPlan = resumablePass?.processing ? resumablePass.plan : null;

  const cardStatus = (id: PlanType): 'awaiting' | 'current' | 'expired' | null => {
    const isCurrentCard = id === currentPlan;
    return awaitingPlans.has(id) && !(isCurrentCard && planIsCurrent) ? 'awaiting'
      : isCurrentCard ? (planIsCurrent ? 'current' : 'expired')
        : null;
  };
  // An unpaid payment's tab opens first, then the driver's own plan.
  const tabs = TAB_ORDER.filter((id) => plans.some((plan) => plan.id === id));
  const defaultTab = tabs.find((id) => cardStatus(id) === 'awaiting')
    ?? (currentPlan && tabs.includes(currentPlan) ? currentPlan : tabs[0] ?? null);
  const activeTab = tab && tabs.includes(tab) ? tab : defaultTab;
  const tabPlans = plans.filter((plan) => plan.id === activeTab);

  // ── Plan change ──────────────────────────────────────────────────────────────
  const startPlan = async (plan: PaidPlan, extend = false) => {
    if (busyRef.current || connectingRef.current) return;
    busyRef.current = true;
    setStartingPlan(plan);
    try {
      const result = await payment.start(plan, segmentForPlans, { method: 'pix', extend, current: sub });
      if (!mounted.current) return;
      if (result === 'already_active') {
        setSuccess({
          title: 'Seu plano já está ativo',
          message: `Seu plano ${PLAN_LABELS[plan]} já está pago e ativo. Não é preciso pagar de novo: você já pode ficar online e aceitar corridas.`,
        });
      }
      if (result !== 'started') void load();
    } finally {
      busyRef.current = false;
      if (mounted.current) setStartingPlan(null);
    }
  };

  /** Opens the unpaid payment for this plan, if there is one. */
  const resumePending = (plan: PaidPlan): boolean => {
    if (resumablePass?.plan === plan) {
      void payment.resumePass(resumablePass, segmentForPlans, sub);
      return true;
    }
    if (resumableCheckout?.plan === plan) {
      void payment.resumeCheckout(resumableCheckout, segmentForPlans, sub);
      return true;
    }
    return false;
  };

  const switchToCommission = async () => {
    if (busyRef.current || connectingRef.current) return;
    busyRef.current = true;
    setStartingPlan('commission');
    const commissionActivated = (row: SubscriptionRow | null) => {
      if (!mounted.current) return;
      if (row) setSub(row);
      setCurrentPlan('commission');
      setPendingCheckout(null);
      payment.close();
      setSuccess({
        title: 'Plano Por Corrida ativado!',
        message: 'Sem mensalidade: você paga a comissão só nas corridas. Você já pode ficar online e aceitar corridas.',
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      // The row the server just wrote unlocks the app without another read.
      onSubscriptionChanged?.(row);
    };
    try {
      const row = await withTimeout(
        selectCommissionPlan(segmentForPlans),
        30_000,
        'A troca de plano demorou. Verifique a conexão e tente novamente.',
      );
      commissionActivated(row);
    } catch (err: unknown) {
      // The switch may have gone through before the connection dropped.
      const now = await getSubscription().catch(() => null);
      if (now?.plan === 'commission' && isSubscriptionCurrent(now)) commissionActivated(now);
      else if (mounted.current) Alert.alert('Não foi possível trocar de plano', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setStartingPlan(null);
      void load();
    }
  };

  const handleSelectPlan = (plan: PlanType) => {
    if (busyRef.current || connectingRef.current || payment.busy) return;
    const cancel = { text: 'Cancelar', style: 'cancel' as const };

    if (plan === 'commission') {
      if (currentPlan === 'commission' && planIsCurrent) {
        Alert.alert('Plano atual', 'Você já está no plano Por Corrida.');
        return;
      }
      const stopsCharges = !!sub?.provider_subscription_id || !!pendingCheckout;
      const message = runningPaid
        ? `Você sai do plano ${PLAN_LABELS[sub!.plan!]} agora e passa a pagar comissão só nas corridas.`
          + (stopsCharges ? ' A assinatura no Mercado Pago será cancelada, sem novas cobranças.' : '')
          + ' O período já pago não é reembolsado.'
        : 'Sem mensalidade: você paga comissão só nas corridas. Acesso imediato.'
          + (stopsCharges ? ' O pagamento pendente no Mercado Pago será cancelado.' : '');
      Alert.alert('Trocar para Por Corrida', message, [cancel, { text: 'Confirmar', onPress: () => { void switchToCommission(); } }]);
      return;
    }

    if (resumePending(plan)) return;
    const label = PLAN_LABELS[plan];
    if (!plans.some((item) => item.id === plan && item.payable)) {
      if (plan === 'monthly' && runningPaid && sub!.plan === 'monthly' && autoRenews) {
        Alert.alert('Plano atual', `Seu plano Mensal está ativo e renova sozinho pelo Mercado Pago. Próxima cobrança em ${fmtDate(sub!.due_date)}.`);
      } else {
        Alert.alert('Plano indisponível', `O plano ${label} não está à venda agora. Escolha outro plano ou fale com o suporte.`);
      }
      return;
    }

    if (isPassPlan(plan)) {
      const until = fmtCutoff(passDueIfPaidNow(sub, plan));
      if (runningPaid && sub!.plan === plan) {
        Alert.alert(
          plan === 'daily' ? 'Mais um dia' : 'Mais uma semana',
          `Seu plano ${label} vale até ${fmtCutoff(sub!.due_date)}. Pague agora e ${plan === 'daily' ? '1 dia é somado' : '7 dias são somados'} ao seu plano, até ${until}.`,
          [cancel, { text: 'Continuar', onPress: () => { void startPlan(plan, true); } }],
        );
        return;
      }
      if (runningPaid && autoRenews) {
        Alert.alert(
          `Trocar para ${label}`,
          `Ao pagar, a assinatura Mensal é cancelada no Mercado Pago, sem novas cobranças. Os dias do ${label} são somados ao que falta do seu plano, até ${until}.`,
          [cancel, { text: 'Continuar', onPress: () => { void startPlan(plan, true); } }],
        );
        return;
      }
      // Straight to the Pix code: the panel itself is the confirmation.
      void startPlan(plan, runningPaid);
      return;
    }

    // Monthly
    if (runningPaid && sub!.plan === 'monthly') {
      if (autoRenews) {
        Alert.alert('Plano atual', `Seu plano Mensal está ativo e renova sozinho pelo Mercado Pago. Próxima cobrança em ${fmtDate(sub!.due_date)}.`);
        return;
      }
      Alert.alert(
        'Assinar no cartão',
        `Seu plano Mensal vale até ${fmtCutoff(sub!.due_date)} e não renova sozinho. Assinando agora, a nova mensalidade conta a partir do pagamento e renova todo mês.`,
        [cancel, { text: 'Assinar', onPress: () => { void startPlan('monthly'); } }],
      );
      return;
    }
    if (runningPaid && isPassPlan(sub!.plan)) {
      Alert.alert(
        'Assinar Mensal',
        `Seu plano ${PLAN_LABELS[sub!.plan!]} vale até ${fmtCutoff(sub!.due_date)}. A assinatura Mensal começa a contar no pagamento, e os dias que faltam do ${PLAN_LABELS[sub!.plan!]} não são somados.`,
        [cancel, { text: 'Assinar agora', onPress: () => { void startPlan('monthly'); } }],
      );
      return;
    }
    void startPlan('monthly');
  };

  const confirmLogout = () => {
    if (!onLogout) return;
    Alert.alert('Sair da conta?', 'Você pode entrar de novo quando quiser.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onLogout },
    ]);
  };

  // ── Plan state shown above the cards ─────────────────────────────────────────
  const pageHidden = !!session || !!success;
  const lapsedPlan = !pageHidden && isPlanLapsed(sub) && sub?.plan && sub.plan !== 'commission' ? sub.plan : null;
  // Renewing charges today's price, so it is offered only when one is set.
  const lapsedPrice = lapsedPlan ? planPrice(settings, lapsedPlan, segmentForPlans) : 0;
  const hoursLeft = planHoursLeft(sub);
  const dueSoonPlan: PaidPlan | null = !pageHidden && runningPaid && hoursLeft !== null && hoursLeft > 0 && (
    sub!.plan === 'daily' ? hoursLeft <= 12
      : sub!.plan === 'weekly' ? hoursLeft <= 24
        : !autoRenews && hoursLeft <= 72
  ) ? sub!.plan as PaidPlan : null;
  const dueSoonPrice = dueSoonPlan ? planPrice(settings, dueSoonPlan, segmentForPlans) : 0;

  const hideBack = blocked && !pageHidden;
  const topBar = (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      {hideBack ? <View style={s.iconSpacer} /> : (
        <TouchableOpacity
          onPress={() => { handleBack(); }}
          style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={session ? 'Voltar para os planos' : 'Voltar'}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color="#1A1A1A" />
        </TouchableOpacity>
      )}
      <Text style={s.topTitle}>Plano & Mensalidade</Text>
      <TouchableOpacity
        onPress={() => { void load(); }}
        style={s.iconBtn}
        accessibilityRole="button"
        accessibilityLabel="Atualizar"
        hitSlop={12}
      >
        <RefreshCw size={17} color="#999" />
      </TouchableOpacity>
    </View>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading && !session) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="dark-content" />
        {topBar}
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const mpCard = (
    <View style={[s.mpCard, mpConnection?.connected && s.mpCardConnected]}>
      <View style={s.mpTopRow}>
        <View style={s.mpIcon}><Zap size={18} color={mpConnection?.connected ? Colors.success : Colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.mpTitle}>Repasse automático</Text>
          <Text style={s.mpSub}>
            {mpConnection?.connected
              ? 'Conectado para receber os repasses das corridas. Essa conexão não é necessária para pagar seu plano.'
              : 'Conecte para receber repasses das corridas. Você não precisa vincular a conta para pagar um plano.'}
          </Text>
        </View>
        <View style={[s.mpStatus, { backgroundColor: (mpConnection?.connected ? Colors.success : Colors.warning) + '18' }]}>
          <Text style={[s.mpStatusText, { color: mpConnection?.connected ? Colors.success : Colors.warning }]}>
            {mpConnection?.connected ? 'CONECTADO' : 'NÃO CONECTADO'}
          </Text>
        </View>
      </View>
      {mpConnection?.connected ? (
        <TouchableOpacity style={s.mpSecondaryBtn} onPress={disconnect} activeOpacity={0.8}>
          <Text style={s.mpSecondaryText}>Desconectar conta</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.mpButton, busyAny && !connectingMp && { opacity: 0.6 }]}
          onPress={() => { void connectMercadoPago(); }}
          disabled={busyAny}
          activeOpacity={0.85}
        >
          {connectingMp ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Zap size={16} color="#FFFFFF" />}
          <Text style={s.mpButtonText}>{connectingMp ? 'Abrindo autorização…' : 'Conectar Mercado Pago'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      {topBar}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!pageHidden && homeLink && onHome && !blocked && (
          <TouchableOpacity
            style={s.homeBtn}
            onPress={() => { void onHome(); }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={s.homeBtnTxt}>Ir para as corridas</Text>
          </TouchableOpacity>
        )}

        {loadError && !success && !payment.confirmed && (
          <View style={s.loadError}>
            <Text style={s.loadErrorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => { void load(); }} style={s.loadRetry}><Text style={s.loadRetryText}>Tentar novamente</Text></TouchableOpacity>
          </View>
        )}

        {/* ── The payment being made ── */}
        {session && (
          <PlanPaymentPanel
            payment={payment}
            onClose={closePanel}
            onDone={finishPayment}
            doneLabel={onHome ? 'Ir para as corridas' : 'Concluir'}
            doneNote={releasing ? RELEASING_NOTE : undefined}
            secondaryLabel={releasing && onSupport ? 'Falar com o suporte' : onHome ? 'Ver meu plano' : undefined}
            onSecondary={releasing && onSupport ? onSupport : viewPlanAfterPayment}
          />
        )}

        {/* ── A plan chosen without a payment ── */}
        {success && !session && (
          <PlanSuccess
            title={success.title}
            message={success.message}
            note={releasing ? RELEASING_NOTE : undefined}
            primaryLabel={onHome ? 'Ir para as corridas' : 'Concluir'}
            onPrimary={onHome ? leaveSuccess : () => setSuccess(null)}
            secondaryLabel={releasing && onSupport ? 'Falar com o suporte' : onHome ? 'Ver meu plano' : undefined}
            onSecondary={releasing && onSupport ? onSupport : viewPlanAfterSuccess}
          />
        )}

        {/* ── Plan lapsed: renewing is the first thing on the screen ── */}
        {lapsedPlan && (
          <View style={s.hero}>
            <View style={s.heroIcon}><AlertCircle size={22} color={Colors.danger} /></View>
            <Text style={s.heroTitle}>
              {sub?.status === 'suspended' ? `Seu plano ${PLAN_LABELS[lapsedPlan]} está suspenso` : `Seu plano ${PLAN_LABELS[lapsedPlan]} venceu`}
            </Text>
            <Text style={s.heroText}>
              Você está sem receber corridas. Renove para voltar a trabalhar: a liberação é automática assim que o pagamento cair.
            </Text>
            {lapsedPrice > 0 && (
              <TouchableOpacity
                style={[s.heroBtn, busyAny && startingPlan !== lapsedPlan && s.dim]}
                onPress={() => handleSelectPlan(lapsedPlan)}
                disabled={busyAny}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {startingPlan === lapsedPlan && <ActivityIndicator size="small" color="#1A1A1A" />}
                <Text style={s.heroBtnTxt}>
                  {startingPlan === lapsedPlan ? 'Gerando o pagamento…' : `Renovar ${PLAN_LABELS[lapsedPlan]} · ${fmtBRL(lapsedPrice)}`}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={s.heroHint}>
              {isPassPlan(lapsedPlan) ? 'Pix na hora, sem sair do app. Ou cartão, se preferir.' : 'Assinatura no cartão pelo Mercado Pago.'}
            </Text>
          </View>
        )}

        {/* ── No plan in date, but nothing to renew ── */}
        {!pageHidden && blocked && !lapsedPlan && (
          <View style={[s.banner, { backgroundColor: '#FEE2E2', borderColor: Colors.danger + '40' }]}>
            <AlertCircle size={15} color={Colors.danger} />
            <Text style={[s.bannerTxt, { color: Colors.danger }]}>
              Escolha um plano para voltar a receber corridas. A liberação é automática após o pagamento.
            </Text>
          </View>
        )}

        {/* ── About to lapse ── */}
        {dueSoonPlan && (
          <View style={s.dueBox}>
            <View style={s.dueRow}>
              <Clock size={16} color="#92400E" />
              <Text style={s.dueTitle}>Seu plano {PLAN_LABELS[dueSoonPlan]} vence {cutoffPhrase(sub?.due_date)}.</Text>
            </View>
            <Text style={s.dueTxt}>
              {isPassPlan(dueSoonPlan)
                ? 'Renove agora: os dias são somados e você não para de receber corridas.'
                : 'Ele não renova sozinho. Assine no cartão para não parar.'}
            </Text>
            {dueSoonPrice > 0 && (
              <TouchableOpacity
                style={[s.dueBtn, busyAny && startingPlan !== dueSoonPlan && s.dim]}
                onPress={() => {
                  if (!isPassPlan(dueSoonPlan)) { handleSelectPlan(dueSoonPlan); return; }
                  if (busyRef.current || payment.busy || resumePending(dueSoonPlan)) return;
                  void startPlan(dueSoonPlan, true);
                }}
                disabled={busyAny}
                activeOpacity={0.85}
              >
                {startingPlan === dueSoonPlan && <ActivityIndicator size="small" color="#fff" />}
                <Text style={s.dueBtnTxt}>
                  {startingPlan === dueSoonPlan ? 'Gerando o pagamento…' : `Renovar agora · ${fmtBRL(dueSoonPrice)}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!pageHidden && !blocked && mpCard}

        {/* ── Plans ── */}
        {!pageHidden && (
          <>
            <Text style={s.sectionTitle}>
              {lapsedPlan ? 'Ou escolha outro plano' : currentPlan ? 'Trocar plano' : 'Escolher plano'}
            </Text>

            {/* Plan tabs: picking one only shows its card */}
            {tabs.length > 1 && (
              <View style={s.tabs} accessibilityRole="tablist">
                {tabs.map((id) => {
                  const active = id === activeTab;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[s.tab, active && s.tabActive]}
                      onPress={() => setTab(id)}
                      disabled={busyAny}
                      activeOpacity={0.8}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active, disabled: busyAny }}
                    >
                      <Text
                        style={[s.tabTxt, active && s.tabTxtActive]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {TAB_LABELS[id]}
                      </Text>
                      {cardStatus(id) === 'awaiting' && <View style={s.tabDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {tabPlans.map((plan) => {
              const status = cardStatus(plan.id);
              const isHighlighted = status === 'current' || status === 'awaiting';
              const pass = isPassPlan(plan.id) ? plan.id : null;
              let meta: string | null = null;
              if (status === 'awaiting') {
                meta = plan.id === reviewPlan
                  ? 'Pagamento em análise no Mercado Pago · toque para ver'
                  : 'Toque para continuar o pagamento';
              }
              else if (status === 'current' && plan.id !== 'commission' && sub?.due_date) {
                meta = plan.id === 'monthly' && autoRenews
                  ? `Renova sozinho em ${fmtDate(sub.due_date)}`
                  : `Válido até ${fmtCutoff(sub.due_date)}${pass && plan.payable ? ` · toque para somar ${pass === 'daily' ? '1 dia' : '7 dias'}` : ''}`;
              } else if (pass && plan.payable) {
                meta = `Pagando agora, vale até ${cutoffPhrase(passDueIfPaidNow(sub, pass)).replace(/^em /, '')}`;
              }
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    s.planCard,
                    isHighlighted && { borderColor: plan.accentColor, borderWidth: 2 },
                  ]}
                  onPress={() => handleSelectPlan(plan.id)}
                  disabled={busyAny}
                  activeOpacity={0.82}
                >
                  {/* Radio / check circle */}
                  <View style={[
                    s.radio,
                    isHighlighted && { backgroundColor: plan.accentColor, borderColor: plan.accentColor },
                  ]}>
                    {isHighlighted && <Check size={11} color="#fff" strokeWidth={3} />}
                  </View>

                  {/* Content */}
                  <View style={s.planBody}>
                    <View style={s.planTitleRow}>
                      <Text style={s.planTitle}>{plan.title}</Text>
                      {plan.badge && (
                        <View style={[s.badge, { backgroundColor: plan.badgeColor }]}>
                          <Text style={s.badgeTxt}>{plan.badge}</Text>
                        </View>
                      )}
                      {status === 'awaiting' && (
                        <View style={[s.badge, s.pendingPaymentBadge]}>
                          <Text style={s.badgeTxt}>{plan.id === reviewPlan ? 'EM ANÁLISE' : 'AGUARDANDO PAGAMENTO'}</Text>
                        </View>
                      )}
                      {status === 'current' && (
                        <View style={[s.badge, { backgroundColor: '#1A1A1A' }]}>
                          <Text style={s.badgeTxt}>ATUAL</Text>
                        </View>
                      )}
                      {status === 'expired' && (
                        <View style={[s.badge, { backgroundColor: Colors.danger }]}>
                          <Text style={s.badgeTxt}>{plan.id === 'commission' ? 'INATIVO' : 'VENCIDO'}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.planDesc}>{plan.description}</Text>
                    <View style={s.priceRow}>
                      <Text style={[s.priceMain, status === 'current' && { color: plan.accentColor }]}>
                        {plan.priceMain}
                      </Text>
                      <Text style={s.priceUnit}> / {plan.priceUnit}</Text>
                    </View>
                    {plan.priceStrike && (
                      <Text style={s.priceStrike}>{plan.priceStrike}</Text>
                    )}
                    {meta && (
                      <Text style={[s.planMeta, status === 'awaiting' && { color: '#B45309' }]}>{meta}</Text>
                    )}
                  </View>

                  {/* Spinner while this plan is being prepared */}
                  {startingPlan === plan.id && (
                    <ActivityIndicator size="small" color={plan.accentColor} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {!pageHidden && blocked && mpCard}

        {/* ── What stays open without a plan ── */}
        {!pageHidden && blocked && (onEarnings || onSupport || onLogout) && (
          <View style={s.blockedBox}>
            <Text style={s.blockedTitle}>Enquanto isso, você ainda pode acessar</Text>
            <View style={s.blockedRow}>
              {onEarnings && (
                <TouchableOpacity style={s.quickBtn} onPress={onEarnings} activeOpacity={0.8} accessibilityRole="button">
                  <Wallet size={20} color="#1A1A1A" />
                  <Text style={s.quickTxt}>Financeiro</Text>
                </TouchableOpacity>
              )}
              {onSupport && (
                <TouchableOpacity style={s.quickBtn} onPress={onSupport} activeOpacity={0.8} accessibilityRole="button">
                  <HelpCircle size={20} color="#1A1A1A" />
                  <Text style={s.quickTxt}>Suporte</Text>
                </TouchableOpacity>
              )}
              {onLogout && (
                <TouchableOpacity style={s.quickBtn} onPress={confirmLogout} activeOpacity={0.8} accessibilityRole="button">
                  <LogOut size={20} color={Colors.danger} />
                  <Text style={[s.quickTxt, { color: Colors.danger }]}>Sair</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  loadError: { marginBottom: 14, padding: 14, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', gap: 8 },
  loadErrorText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.danger, lineHeight: 19 },
  loadRetry: { alignSelf: 'flex-start', paddingVertical: 5 },
  loadRetryText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.primary },
  homeBtn: { marginBottom: 14, backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  homeBtnTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#FFFFFF' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#F7F8FA',
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  iconSpacer: { width: 40, height: 40 },
  topTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  dim: { opacity: 0.6 },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  bannerTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', lineHeight: 18 },

  // Lapsed plan
  hero: {
    backgroundColor: '#FEF2F2', borderRadius: 16, borderWidth: 1.5, borderColor: '#FECACA',
    padding: 18, marginBottom: 20,
  },
  heroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  heroTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 4 },
  heroText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#4B5563', lineHeight: 19, marginBottom: 14 },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15,
  },
  heroBtnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  heroHint: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B7280', textAlign: 'center', marginTop: 10 },

  // About to lapse
  dueBox: {
    backgroundColor: '#FEF3C7', borderRadius: 14, borderWidth: 1, borderColor: Colors.warning + '55',
    padding: 14, marginBottom: 16,
  },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dueTitle: { flex: 1, fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#92400E' },
  dueTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 17, marginBottom: 12 },
  dueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 12,
  },
  dueBtnTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },

  mpCard: {
    backgroundColor: '#FFF9EC', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1.5, borderColor: '#F59E0B55',
  },
  mpCardConnected: { backgroundColor: '#F0FDF4', borderColor: Colors.success + '55' },
  mpTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 13 },
  mpIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#FFFFFFAA', alignItems: 'center', justifyContent: 'center' },
  mpTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 2 },
  mpSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B7280', lineHeight: 16 },
  mpStatus: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  mpStatusText: { fontSize: 8, fontFamily: 'Poppins_700Bold', letterSpacing: 0.4 },
  mpButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12 },
  mpButtonText: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFFFFF' },
  mpSecondaryBtn: { alignItems: 'center', paddingVertical: 8 },
  mpSecondaryText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },

  // Plan cards (same style as PlanSelectionScreen)
  sectionTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#999', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 14, marginTop: 4 },
  planCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8E8E8',
    padding: 16, marginBottom: 12, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  planBody: { flex: 1 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  planTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pendingPaymentBadge: { backgroundColor: '#F59E0B' },
  badgeTxt: { fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: 0.4 },
  planDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#888', marginBottom: 8, lineHeight: 17 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceMain: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  priceUnit: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#999' },
  priceStrike: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#BFBFBF', textDecorationLine: 'line-through', marginTop: 2 },
  planMeta: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', marginTop: 6 },

  // Plan tabs (same style as PlanSelectionScreen)
  tabs: {
    flexDirection: 'row', backgroundColor: '#EEF0F3', borderRadius: 12,
    padding: 4, marginBottom: 16, gap: 2,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, paddingVertical: 9, paddingHorizontal: 2, gap: 3,
  },
  tabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
    elevation: 2,
  },
  tabTxt: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },
  tabTxtActive: { color: '#1A1A1A' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },

  // Without a plan
  blockedBox: { marginTop: 4, marginBottom: 8 },
  blockedTitle: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#6B7280', marginBottom: 10 },
  blockedRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E8E8E8', paddingVertical: 14,
  },
  quickTxt: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A' },
});

export default DriverSubscriptionScreen;
