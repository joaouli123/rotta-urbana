import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, AppState, Share,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Copy, QrCode, CreditCard, Clock, CircleCheckBig, RefreshCw, AlertCircle, X, Lock,
} from 'lucide-react-native';
import { PixQrCode } from './PixQrCode';
import { CardPaymentForm, type CardFormReply } from './CardPaymentForm';
import { Colors } from '../constants';
import { supabase } from '../lib/supabase';
import {
  createSubscriptionCheckout, getSubscription, loadSubscriptionSnapshot, openMercadoPagoCheckout,
  isCheckoutConfirmed, isPassPlan, planCutoff, subscriptionFingerprint, PaymentsApiError, payPlanWithCard,
  subscribeMonthlyWithCard,
  type PlanType, type PlanPix, type PendingPass, type PendingCheckout, type PassPaymentMethod,
  type SubscriptionCheckout, type CardFormData, type CardPaymentResult, type CardSubscriptionResult,
} from '../services/payments';
import type { PlanSegment, SubscriptionRow } from '../types/db';

// ── Formatting shared by the plan screens ─────────────────────────────────────
export type PaidPlan = Exclude<PlanType, 'commission'>;

export const PLAN_LABELS: Record<PlanType, string> = {
  commission: 'Por Corrida', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal',
};

export function fmtBRL(value: number) { return 'R$ ' + Number(value || 0).toFixed(2).replace('.', ','); }

export function fmtDate(iso?: string | null) {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** When a plan stops, in the phone's time: "25/09 às 21:00". */
export function fmtCutoff(dueDate?: string | null) {
  const cutoff = planCutoff(dueDate);
  if (!cutoff) return '';
  return `${pad(cutoff.getDate())}/${pad(cutoff.getMonth() + 1)} às ${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}`;
}

/** "hoje às 21:00", "amanhã às 21:00" or "em 30/09 às 21:00". */
export function cutoffPhrase(dueDate?: string | null, now = new Date()) {
  const cutoff = planCutoff(dueDate);
  if (!cutoff) return '';
  const time = `${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return `hoje às ${time}`;
  if (diff === 1) return `amanhã às ${time}`;
  return `em ${fmtCutoff(dueDate)}`;
}

/** The plan the driver has now, in one line for the success screens. */
export function activePlanMessage(row: SubscriptionRow | null | undefined): string {
  if (!row?.plan) return 'Seu plano está ativo.';
  if (row.plan === 'commission') return 'Plano Por Corrida: sem mensalidade, você paga a comissão só nas corridas.';
  const label = PLAN_LABELS[row.plan];
  if (!row.due_date) return `Plano ${label} ativo.`;
  return !isPassPlan(row.plan) && row.provider_subscription_id
    ? `Plano ${label} ativo. Próxima cobrança em ${fmtDate(row.due_date)}.`
    : `Plano ${label} ativo até ${fmtCutoff(row.due_date)}.`;
}

// ── The payment being made ────────────────────────────────────────────────────
export type PaymentKind = PassPaymentMethod | 'recurring';

export interface PlanPaymentSession {
  userId: string | null;
  plan: PaidPlan;
  segment: PlanSegment;
  amount: number;
  /**
   * Pix or card in the app, Checkout Pro, or the monthly subscription (card in
   * the app, with Mercado Pago's page at `url` as the fallback).
   */
  method: PaymentKind;
  url: string | null;
  pix: PlanPix | null;
  /** Ledger row of a daily or weekly payment; approved once it is paid. */
  paymentId: string | null;
  expiresAt: string | null;
  /** Days bought on top of a plan still running. */
  extend: boolean;
  pixUnavailable: boolean;
  /** E-mail the card form starts with. */
  payerEmail: string | null;
  /** subscriptionFingerprint() before the payment started. */
  baseline: string;
  startedAt: number;
}

// Kept outside the screens so leaving one while paying, or the return link
// reopening it, does not lose the payment being confirmed.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
let savedSession: PlanPaymentSession | null = null;
function restoreSession(): PlanPaymentSession | null {
  if (savedSession && Date.now() - savedSession.startedAt > SESSION_TTL_MS) savedSession = null;
  return savedSession;
}

// Card payments whose charge got no answer from Mercado Pago, by payment id,
// with the time until which they count as under review (as on the server).
// Another card, Pix or link meanwhile is asked about first.
const CARD_UNANSWERED_MS = 15 * 60 * 1000;
const unansweredCards = new Map<string, number>();
const cardUnanswered = (paymentId: string | null | undefined) =>
  !!paymentId && (unansweredCards.get(paymentId) ?? 0) > Date.now();

// The last Mercado Pago return link handled. Signals only grow, so a screen
// opened by the link handles it once, and one opened later does not again.
let handledReturnSignal = 0;
export function takeReturnSignal(signal: number | undefined): boolean {
  if (!signal || signal <= handledReturnSignal) return false;
  handledReturnSignal = signal;
  return true;
}

async function currentUser(): Promise<{ id: string | null; email: string | null }> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const user = data.session?.user;
  return { id: user?.id ?? null, email: user?.email ?? null };
}

async function currentUserId(): Promise<string | null> {
  return (await currentUser()).id;
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

interface IntentRead { status: string; provider_payment_id: string | null }
async function readIntent(id: string): Promise<IntentRead | null> {
  const { data, error } = await supabase.from('payments').select('status, provider_payment_id').eq('id', id).maybeSingle();
  return error ? null : ((data as IntentRead | null) ?? null);
}

async function copyText(text: string): Promise<'copied' | 'shared' | 'failed'> {
  try {
    // Required lazily: a dev client built before expo-clipboard lacks the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return 'copied';
  } catch {
    try {
      await Share.share({ message: text });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
}

type Busy = null | 'start' | 'card' | 'pix' | 'open' | 'charge';
export type StartResult = 'started' | 'already_active' | 'error';

export interface StartOptions {
  method?: PassPaymentMethod;
  extend?: boolean;
  /** The unpaid payment being switched from (Pix to card or back). */
  replaces?: string | null;
  /** The driver already chose to pay again while a payment is under review. */
  allowProcessing?: boolean;
  /** The row the screen already has, used when it cannot be read again. */
  current?: SubscriptionRow | null;
}

export interface PlanPayment {
  session: PlanPaymentSession | null;
  confirmed: boolean;
  /** The plan as it was right after the payment was confirmed. */
  confirmedRow: SubscriptionRow | null;
  /** The driver came back from the bank app or the Mercado Pago page. */
  returned: boolean;
  busy: Busy;
  checking: boolean;
  /** A manual check found no payment yet. */
  notYet: boolean;
  /** The ledger row was closed (expired or replaced). */
  intentClosed: boolean;
  /** Mercado Pago declined the card; another card or Pix can still pay. */
  declined: boolean;
  /** A payment made on the card link is still processing or under review. */
  processing: boolean;
  /** The ledger row's status as last read (pending, rejected, cancelled…). */
  intentStatus: string | null;
  /** The card form (Mercado Pago's fields, in the app) is open. */
  cardFormOpen: boolean;
  /** What happened to the last card sent, for the driver. */
  cardNotice: string | null;
  start: (plan: PaidPlan, segment: PlanSegment, options?: StartOptions) => Promise<StartResult>;
  resumePass: (pending: PendingPass, fallbackSegment: PlanSegment, baseRow?: SubscriptionRow | null) => Promise<void>;
  /** `baseRow` is the plan read together with `pending`, from before any payment. */
  resumeCheckout: (pending: PendingCheckout, fallbackSegment: PlanSegment, baseRow?: SubscriptionRow | null) => Promise<void>;
  /** Card in the app (Checkout Pro when the server has no card form). */
  payWithCard: (options?: PayAgainOptions) => Promise<void>;
  payWithPix: (options?: PayAgainOptions) => Promise<void>;
  /** Mercado Pago's own page (card or Mercado Pago balance). */
  payWithCheckout: (options?: PayAgainOptions) => Promise<void>;
  openCheckout: () => Promise<void>;
  openCardForm: (options?: PayAgainOptions) => void;
  closeCardForm: () => void;
  /** Charges the card the form handed over; the reply says how the form goes on. */
  payCard: (form: CardFormData, deviceId: string | null) => Promise<CardFormReply>;
  /** Subscribes the monthly plan on the card the form handed over. */
  subscribeCard: (form: CardFormData, deviceId: string | null) => Promise<CardFormReply>;
  checkNow: () => Promise<void>;
  markReturned: () => void;
  close: () => void;
}

export interface PayAgainOptions {
  /** The driver saw the payment under review and chose to pay again. */
  allowProcessing?: boolean;
}

const PAY_AGAIN_MESSAGE = 'O Mercado Pago ainda está analisando um pagamento do seu plano. Quando ele for aprovado, o plano é liberado sozinho. Se você pagar de novo e os dois forem aprovados, serão duas cobranças (os dias se somam). Pagar de novo mesmo assim?';

/** Asks before a second payment while one is still under review. */
function confirmPayAgain(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Pagamento em análise',
      PAY_AGAIN_MESSAGE,
      [
        { text: 'Aguardar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Pagar de novo', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Runs a plan payment: daily and weekly by Pix or card in the app (or
 * Checkout Pro), monthly by a card subscription in the app (or Mercado Pago's
 * subscription checkout). It watches the ledger row and the plan until the
 * payment shows up, and calls `onConfirmed` once.
 */
export function usePlanPayment({ onConfirmed }: { onConfirmed?: (row: SubscriptionRow | null) => void } = {}): PlanPayment {
  const [session, setSessionState] = useState<PlanPaymentSession | null>(restoreSession);
  const sessionRef = useRef(session);
  const [confirmed, setConfirmed] = useState(false);
  const confirmedRef = useRef(false);
  const [confirmedRow, setConfirmedRow] = useState<SubscriptionRow | null>(null);
  const [returned, setReturned] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const [intentClosed, setIntentClosed] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [cardNotice, setCardNotice] = useState<string | null>(null);
  // The driver already chose to pay again while a card payment is under review.
  const cardAllowProcessing = useRef(false);
  // A card is being charged: the form stays until its answer is on screen.
  const chargingRef = useRef(false);
  // The last intent status read, so leaving the screen can drop a dead payment.
  const intentStatusRef = useRef<string | null>(null);
  // Bumped whenever the payment on screen stops being the one a request was
  // made for (closed, confirmed, replaced, or the screen left).
  const attemptRef = useRef(0);
  const mounted = useRef(true);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  const setSession = useCallback((next: PlanPaymentSession | null) => {
    attemptRef.current += 1;
    savedSession = next;
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const resetProgress = useCallback(() => {
    confirmedRef.current = false;
    intentStatusRef.current = null;
    setConfirmed(false);
    setConfirmedRow(null);
    setReturned(false);
    setNotYet(false);
    setIntentClosed(false);
    setDeclined(false);
    setProcessing(false);
    setIntentStatus(null);
    setCardFormOpen(false);
    setCardNotice(null);
    cardAllowProcessing.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    // A payment left open by another account on this phone is not shown.
    const restored = sessionRef.current;
    if (restored) {
      void currentUserId().then((id) => {
        if (mounted.current && sessionRef.current === restored && restored.userId !== id) setSession(null);
      });
    }
    return () => {
      mounted.current = false;
      attemptRef.current += 1;
      // A code that expired or was replaced is not reopened with the screen.
      const status = intentStatusRef.current;
      if (savedSession === sessionRef.current && status && status !== 'pending' && status !== 'rejected') {
        savedSession = null;
      }
    };
  }, [setSession]);

  const markConfirmed = useCallback((row: SubscriptionRow | null) => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    attemptRef.current += 1;
    savedSession = null;
    setConfirmed(true);
    setConfirmedRow(row);
    setNotYet(false);
    setCardFormOpen(false);
    onConfirmedRef.current?.(row);
  }, []);

  // Two lanes, so a tap on "Já paguei" is not swallowed by a quick poll.
  const inFlight = useRef({ poll: false, server: false });
  const check = useCallback(async (withServer: boolean): Promise<boolean> => {
    const target = sessionRef.current;
    const lane = withServer ? 'server' : 'poll';
    if (!target || confirmedRef.current || inFlight.current[lane]) return confirmedRef.current;
    inFlight.current[lane] = true;
    try {
      let row: SubscriptionRow | null | undefined;
      try {
        // The server asks Mercado Pago directly, for a webhook that is late.
        row = withServer ? (await loadSubscriptionSnapshot(12_000)).subscription : await getSubscription();
      } catch {
        row = undefined;
      }
      const intent = target.paymentId ? await readIntent(target.paymentId) : null;
      if (sessionRef.current !== target || confirmedRef.current) return confirmedRef.current;
      if (intent?.status === 'approved') {
        // The ledger row and the plan change together; read the plan again if
        // it was read just before.
        const fresh = row && isCheckoutConfirmed(row, target) ? row : await getSubscription().catch(() => row ?? null);
        if (sessionRef.current === target) markConfirmed(fresh ?? null);
        return true;
      }
      // A payment still pending is not paid, whatever else changed on the plan.
      const stillPending = !!target.paymentId && intent?.status === 'pending';
      if (!stillPending && row && isCheckoutConfirmed(row, target)) {
        markConfirmed(row);
        return true;
      }
      if (intent) {
        intentStatusRef.current = intent.status;
        if (mounted.current) {
          setIntentStatus(intent.status);
          // A declined card leaves the form (or the Checkout Pro link) open for
          // another try.
          const card = target.method === 'checkout' || target.method === 'card';
          const refused = intent.status === 'rejected' && card;
          setDeclined(refused);
          setIntentClosed(intent.status !== 'pending' && !refused);
          // Paying again while this one settles could charge the driver twice.
          // A card with no answer yet may not show a payment id for a while.
          setProcessing(card && intent.status === 'pending'
            && (!!intent.provider_payment_id || (target.method === 'card' && cardUnanswered(target.paymentId))));
        }
      }
      return false;
    } finally {
      inFlight.current[lane] = false;
    }
  }, [markConfirmed]);

  // While a payment is open: a cheap read every few seconds, and a server
  // check now and then.
  const watching = !!session && !confirmed;
  useEffect(() => {
    if (!watching) return;
    void check(false);
    const poll = setInterval(() => { void check(false); }, 4000);
    const sync = setInterval(() => { void check(true); }, 20_000);
    return () => { clearInterval(poll); clearInterval(sync); };
  }, [watching, check]);

  // Back from the bank app or the Mercado Pago page: check right away.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !sessionRef.current || confirmedRef.current) return;
      setReturned(true);
      void check(true);
    });
    return () => listener.remove();
  }, [check]);

  const begin = useCallback(async (
    plan: PaidPlan,
    segment: PlanSegment,
    options: StartOptions,
    kind: Exclude<Busy, null | 'open' | 'charge'>,
    keepBaseline?: string,
  ): Promise<{ status: StartResult | 'stale' | 'processing'; checkout?: SubscriptionCheckout }> => {
    if (busyRef.current) return { status: 'error' };
    busyRef.current = true;
    setBusy(kind);
    const attempt = attemptRef.current;
    const switching = keepBaseline !== undefined;
    try {
      const pass = isPassPlan(plan);
      const [user, baseRow] = await Promise.all([
        currentUser(),
        switching ? Promise.resolve(null) : getSubscription().catch(() => options.current ?? null),
      ]);
      const checkout = await createSubscriptionCheckout(
        plan,
        segment,
        pass
          ? { method: options.method ?? 'pix', extend: options.extend, replaces: options.replaces, allowProcessing: options.allowProcessing }
          : {},
      );
      // The driver left the panel, or the first payment was confirmed meanwhile.
      if (attemptRef.current !== attempt || !mounted.current) return { status: 'stale', checkout };
      if (checkout.already_active) return { status: 'already_active', checkout };
      const method: PaymentKind = !pass
        ? 'recurring'
        : checkout.method ?? (checkout.pix?.qr_code ? 'pix' : 'checkout');
      resetProgress();
      setSession({
        userId: user.id,
        plan,
        segment: checkout.plan_segment ?? segment,
        amount: Number(checkout.amount) || 0,
        method,
        url: checkout.init_point ?? null,
        pix: method === 'pix' ? checkout.pix ?? null : null,
        paymentId: pass ? checkout.payment_id ?? null : null,
        expiresAt: pass ? (checkout.pix?.expires_at ?? checkout.expires_at ?? null) : null,
        extend: !!options.extend,
        pixUnavailable: !!checkout.pix_unavailable,
        payerEmail: checkout.payer_email || user.email,
        baseline: keepBaseline ?? subscriptionFingerprint(baseRow),
        startedAt: Date.now(),
      });
      return { status: 'started', checkout };
    } catch (error) {
      if (attemptRef.current !== attempt || !mounted.current) return { status: 'stale' };
      // Another payment is under review: the caller asks the driver first.
      if (error instanceof PaymentsApiError && error.code === 'payment_processing') return { status: 'processing' };
      if (switching && error instanceof PaymentsApiError && error.status === 409) {
        // The first code could not be cancelled: it may have just been paid.
        Alert.alert('Pagamento anterior em aberto', error.message);
        void check(true);
        return { status: 'error' };
      }
      Alert.alert('Não foi possível gerar o pagamento', error instanceof Error ? error.message : 'Tente novamente.');
      return { status: 'error' };
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }, [check, resetProgress, setSession]);

  // The server refuses a second payment while one is under review, until the
  // driver has seen it and chosen to pay again. Every way to pay goes through
  // here, so none of them charges twice without asking.
  const beginChecked: typeof begin = useCallback(async (plan, segment, options, kind, keepBaseline) => {
    const first = await begin(plan, segment, options, kind, keepBaseline);
    if (first.status !== 'processing') return first;
    const attempt = attemptRef.current;
    // The panel on screen shows the payment under review, if it is this one.
    if (sessionRef.current) void check(false);
    const yes = await confirmPayAgain();
    if (!yes || attemptRef.current !== attempt || !mounted.current) return { status: 'error' };
    return begin(plan, segment, { ...options, allowProcessing: true }, kind, keepBaseline);
  }, [begin, check]);

  const start = useCallback(async (plan: PaidPlan, segment: PlanSegment, options: StartOptions = {}): Promise<StartResult> => {
    const { status } = await beginChecked(plan, segment, options, 'start');
    return status === 'stale' || status === 'processing' ? 'error' : status;
  }, [beginChecked]);

  const openCheckout = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.url || busyRef.current) return;
    busyRef.current = true;
    setBusy('open');
    try {
      // A payment made on this link may still be under review (or was just
      // approved): paying on it again would be a second charge.
      if (current.method === 'checkout' && current.paymentId) {
        const intent = await readIntent(current.paymentId);
        if (sessionRef.current !== current || !mounted.current) return;
        if (intent?.status === 'approved') { void check(false); return; }
        if (intent?.status === 'pending' && intent.provider_payment_id) {
          setProcessing(true);
          if (!(await confirmPayAgain()) || sessionRef.current !== current || !mounted.current) return;
        }
      }
      await openMercadoPagoCheckout(current.url, async () => {
        if (!mounted.current || sessionRef.current !== current) return;
        setReturned(true);
        await check(true);
      });
    } catch {
      if (mounted.current) Alert.alert('Não foi possível abrir o pagamento', 'Verifique sua conexão e tente novamente.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }, [check]);

  // Switching between Pix and card keeps the first baseline: a payment made
  // just before the switch still counts. Returns whether a new payment opened.
  const switchMethod = useCallback(async (method: PassPaymentMethod, allowProcessing = false): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current || !isPassPlan(current.plan) || busyRef.current) return false;
    // Paid a moment ago with the first method: do not charge again.
    if (await check(false)) return false;
    if (sessionRef.current !== current) return false;
    // The server cancels the code being replaced first, or reports it paid.
    const result = await beginChecked(
      current.plan,
      current.segment,
      { method, extend: current.extend, replaces: current.paymentId, allowProcessing },
      method === 'pix' ? 'pix' : 'card',
      current.baseline,
    );
    if (result.status === 'already_active') {
      // Only a plain purchase comes back as active: the first method was paid.
      markConfirmed(result.checkout?.subscription ?? null);
      return false;
    }
    if (result.status !== 'started') return false;
    const next = sessionRef.current;
    if (next?.method === 'card') {
      // Paying again was already agreed to for this new payment.
      cardAllowProcessing.current = allowProcessing;
      setCardFormOpen(true);
    } else if (next?.method === 'checkout' && method !== 'pix') {
      // Card chosen, and the server sent Checkout Pro instead of the form.
      await openCheckout();
    }
    return true;
  }, [beginChecked, check, markConfirmed, openCheckout]);

  const payWithCard = useCallback(
    async (options?: PayAgainOptions) => { await switchMethod('card', !!options?.allowProcessing); },
    [switchMethod],
  );
  const payWithPix = useCallback(
    async (options?: PayAgainOptions) => { await switchMethod('pix', !!options?.allowProcessing); },
    [switchMethod],
  );
  const payWithCheckout = useCallback(
    async (options?: PayAgainOptions) => { await switchMethod('checkout', !!options?.allowProcessing); },
    [switchMethod],
  );

  const openCardForm = useCallback((options?: PayAgainOptions) => {
    const current = sessionRef.current;
    if (!current || confirmedRef.current || busyRef.current) return;
    // The monthly subscription takes the card in the same form.
    if (current.method === 'recurring') {
      setCardNotice(null);
      setCardFormOpen(true);
      return;
    }
    if (current.method !== 'card') return;
    const allowed = cardAllowProcessing.current || !!options?.allowProcessing;
    // A card with no answer yet may have been charged: another card is asked
    // about first.
    if (!allowed && cardUnanswered(current.paymentId)) {
      void confirmPayAgain().then((yes) => {
        if (!yes || sessionRef.current !== current || confirmedRef.current || !mounted.current) return;
        cardAllowProcessing.current = true;
        setCardNotice(null);
        setCardFormOpen(true);
      });
      return;
    }
    cardAllowProcessing.current = allowed;
    setCardNotice(null);
    setCardFormOpen(true);
  }, []);

  const closeCardForm = useCallback(() => {
    // A card being charged must get its answer on screen.
    if (chargingRef.current) return;
    setCardFormOpen(false);
  }, []);

  // One card at a time. A retry sends the same token: the server charges it
  // once (same idempotency key), so a lost answer never becomes two charges.
  const payCard = useCallback(async (form: CardFormData, deviceId: string | null): Promise<CardFormReply> => {
    const target = sessionRef.current;
    const paymentId = target?.paymentId;
    if (!target || target.method !== 'card' || !paymentId || confirmedRef.current) return { rebuild: true };
    if (busyRef.current) {
      setCardNotice('Aguarde um instante e toque em pagar de novo.');
      return { rebuild: false };
    }
    busyRef.current = true;
    chargingRef.current = true;
    setBusy('charge');
    setCardNotice(null);
    const attempt = attemptRef.current;
    const stale = () => attemptRef.current !== attempt || !mounted.current || sessionRef.current !== target;
    let allowProcessing = cardAllowProcessing.current;
    let result: CardPaymentResult | null = null;
    let lastError: unknown = null;
    try {
      for (let tries = 0; ; tries += 1) {
        try {
          result = await payPlanWithCard(paymentId, form, deviceId, allowProcessing);
          break;
        } catch (error) {
          if (stale()) return { rebuild: true };
          lastError = error;
          const api = error instanceof PaymentsApiError ? error : null;
          if (api?.code === 'payment_processing' && !allowProcessing) {
            // An earlier card of this payment is under review: ask first.
            setProcessing(true);
            if (!(await confirmPayAgain()) || stale()) {
              if (!stale()) setCardFormOpen(false);
              return { rebuild: true };
            }
            allowProcessing = true;
            cardAllowProcessing.current = true;
            continue;
          }
          // No answer: the charge may exist. The same request again is safe.
          const unknown = !api || api.code === 'payment_unknown' || api.code === 'payment_in_progress'
            || (api.status >= 500 && !api.code);
          if (unknown && tries < 2) {
            await wait(1500 * (tries + 1));
            if (stale()) return { rebuild: true };
            continue;
          }
          break;
        }
      }
    } finally {
      busyRef.current = false;
      chargingRef.current = false;
      if (mounted.current) setBusy(null);
    }
    if (stale()) return { rebuild: !result || result.status === 'rejected' };

    if (result?.status === 'approved') {
      const row = result.subscription ?? await getSubscription().catch(() => null);
      if (sessionRef.current === target) markConfirmed(row);
      return { rebuild: false };
    }
    if (result?.status === 'processing') {
      setProcessing(true);
      setCardFormOpen(false);
      void check(true);
      return { rebuild: false };
    }
    if (result?.status === 'rejected') {
      setDeclined(true);
      setCardNotice(result.message || 'O banco não aprovou o pagamento e nada foi cobrado. Tente outro cartão ou pague com Pix.');
      return { rebuild: true };
    }

    const api = lastError instanceof PaymentsApiError ? lastError : null;
    const code = api?.code ?? null;
    if (code === 'payment_expired' || code === 'payment_superseded' || code === 'payment_not_found') {
      // This payment is closed. Paid another way meanwhile? Otherwise a new
      // one opens and the form takes the card again.
      if (await check(true)) return { rebuild: false };
      if (stale()) return { rebuild: true };
      const opened = await switchMethod('card', allowProcessing);
      if (opened && sessionRef.current?.method === 'card') {
        setCardNotice('O pagamento anterior tinha expirado e abrimos outro. Digite os dados do cartão de novo.');
      } else if (sessionRef.current === target && mounted.current) {
        setCardFormOpen(false);
        setCardNotice(api?.message ?? 'Este pagamento foi encerrado. Toque em pagar de novo.');
      }
      return { rebuild: true };
    }
    if (api && api.status < 500 && code !== 'payment_in_progress') {
      // Refused before any charge: too many tries, incomplete form, …
      setCardNotice(api.message);
      return { rebuild: true };
    }
    // Still no answer after the retries: the card may have been charged, so
    // it counts as under review and paying again is asked about first.
    unansweredCards.set(paymentId, Date.now() + CARD_UNANSWERED_MS);
    setProcessing(true);
    setCardFormOpen(false);
    setCardNotice('Não recebemos a resposta do Mercado Pago. Estamos conferindo se o pagamento passou: aguarde antes de pagar de novo.');
    void check(true);
    return { rebuild: true };
  }, [check, markConfirmed, switchMethod]);

  // The monthly plan on the card typed in the app. Mercado Pago authorizes
  // the subscription right away, so the answer says whether the plan is on.
  // The card's token is not sent twice: an answer that does not come is
  // looked for on the plan instead.
  const subscribeCard = useCallback(async (form: CardFormData, deviceId: string | null): Promise<CardFormReply> => {
    const target = sessionRef.current;
    if (!target || target.method !== 'recurring' || confirmedRef.current) return { rebuild: true };
    if (busyRef.current) {
      setCardNotice('Aguarde um instante e toque em pagar de novo.');
      return { rebuild: false };
    }
    busyRef.current = true;
    chargingRef.current = true;
    setBusy('charge');
    setCardNotice(null);
    const attempt = attemptRef.current;
    const stale = () => attemptRef.current !== attempt || !mounted.current || sessionRef.current !== target;
    try {
      let result: CardSubscriptionResult | null = null;
      let api: PaymentsApiError | null = null;
      try {
        result = await subscribeMonthlyWithCard(form, deviceId, target.segment);
      } catch (error) {
        api = error instanceof PaymentsApiError ? error : null;
      }
      if (stale()) return { rebuild: !result };

      if (result && (result.status === 'authorized' || result.already_active)) {
        const row = result.subscription ?? await getSubscription().catch(() => null);
        if (sessionRef.current === target) markConfirmed(row);
        return { rebuild: false };
      }
      const code = api?.code ?? null;
      if (api?.status === 409 && code === 'subscription_in_progress') {
        // A first try whose answer was lost, or another phone: its answer
        // shows up on the plan. The card stays in the form meanwhile.
        setCardNotice('Sua assinatura já está sendo processada. Aguarde um instante.');
        void check(true);
        return { rebuild: false };
      }
      if (api?.status === 404 && !code) {
        // A server without this route yet: Mercado Pago's page still works.
        setCardFormOpen(false);
        setCardNotice('A assinatura com cartão no app ainda não está disponível. Toque em "Pagar na página do Mercado Pago" para assinar.');
        return { rebuild: true };
      }
      if (api && api.status < 500) {
        // Refused before any charge: card declined, debit card, incomplete form, …
        setCardNotice(api.message);
        return { rebuild: true };
      }

      // No answer: the subscription may exist. The plan says whether it does.
      for (let tries = 0; tries < 2; tries += 1) {
        if (tries) await wait(3000);
        if (stale()) return { rebuild: true };
        if (await check(true)) return { rebuild: false };
      }
      if (stale()) return { rebuild: true };
      setCardNotice(api?.status === 503 && !code
        ? api.message
        : 'Não conseguimos confirmar a sua assinatura com o Mercado Pago. Confira em instantes: se ela foi aprovada, o plano é liberado sozinho.');
      return { rebuild: true };
    } finally {
      busyRef.current = false;
      chargingRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }, [check, markConfirmed]);

  const resumePass = useCallback(async (
    pending: PendingPass,
    fallbackSegment: PlanSegment,
    baseRow?: SubscriptionRow | null,
  ) => {
    if (!pending.plan || busyRef.current) return;
    const attempt = attemptRef.current;
    const [user, row] = await Promise.all([currentUser(), getSubscription().catch(() => baseRow ?? null)]);
    if (attemptRef.current !== attempt || !mounted.current || busyRef.current) return;
    const running = !!row && row.status === 'active' && row.plan === pending.plan
      && String(row.due_date || '').slice(0, 10) >= new Date().toISOString().slice(0, 10);
    resetProgress();
    setSession({
      userId: user.id,
      plan: pending.plan,
      segment: pending.plan_segment ?? fallbackSegment,
      amount: Number(pending.amount) || 0,
      method: pending.method,
      url: pending.init_point,
      pix: pending.method === 'pix' ? pending.pix : null,
      paymentId: pending.payment_id,
      expiresAt: pending.pix?.expires_at ?? pending.expires_at,
      extend: running,
      pixUnavailable: false,
      payerEmail: user.email,
      baseline: subscriptionFingerprint(row),
      startedAt: Date.now(),
    });
    // Shown as under review right away, before the first check comes back. A
    // card the server lists as under review may have no payment id yet.
    if (pending.processing) {
      if (pending.method === 'card' && !cardUnanswered(pending.payment_id)) {
        unansweredCards.set(pending.payment_id, Date.now() + CARD_UNANSWERED_MS);
      }
      setProcessing(true);
    }
  }, [resetProgress, setSession]);

  const resumeCheckout = useCallback(async (
    pending: PendingCheckout,
    fallbackSegment: PlanSegment,
    baseRow?: SubscriptionRow | null,
  ) => {
    if (!pending.plan || !pending.init_point || busyRef.current) return;
    const attempt = attemptRef.current;
    const [userId, row] = await Promise.all([currentUserId(), getSubscription().catch(() => null)]);
    if (attemptRef.current !== attempt || !mounted.current || busyRef.current) return;
    resetProgress();
    setSession({
      userId,
      plan: pending.plan,
      segment: pending.plan_segment ?? fallbackSegment,
      amount: Number(pending.amount) || 0,
      method: 'recurring',
      url: pending.init_point,
      pix: null,
      paymentId: null,
      expiresAt: null,
      extend: false,
      pixUnavailable: false,
      payerEmail: null,
      // A row read now may already carry the approved subscription, which
      // would then never look like a change.
      baseline: subscriptionFingerprint(baseRow !== undefined ? baseRow : row),
      startedAt: Date.now(),
    });
  }, [resetProgress, setSession]);

  const checkNow = useCallback(async () => {
    setChecking(true);
    setNotYet(false);
    try {
      const paid = await check(true);
      if (!paid && mounted.current && sessionRef.current) setNotYet(true);
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [check]);

  const markReturned = useCallback(() => {
    if (!sessionRef.current || confirmedRef.current) return;
    setReturned(true);
    void check(true);
  }, [check]);

  const close = useCallback(() => {
    resetProgress();
    setSession(null);
  }, [resetProgress, setSession]);

  return {
    session, confirmed, confirmedRow, returned, busy, checking, notYet, intentClosed, declined, processing, intentStatus,
    cardFormOpen, cardNotice,
    start, resumePass, resumeCheckout, payWithCard, payWithPix, payWithCheckout, openCheckout,
    openCardForm, closeCardForm, payCard, subscribeCard, checkNow, markReturned, close,
  };
}

// ── Success ───────────────────────────────────────────────────────────────────
interface PlanSuccessProps {
  title: string;
  message: string;
  note?: string;
  primaryLabel?: string;
  /** Waited on, with a spinner on the button, when it returns a promise. */
  onPrimary: () => void | Promise<void>;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** The end of every plan flow: what happened, and the way back to the rides. */
export const PlanSuccess: React.FC<PlanSuccessProps> = ({
  title, message, note, primaryLabel = 'Ir para as corridas', onPrimary, secondaryLabel, onSecondary,
}) => {
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const go = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await onPrimary();
    } finally {
      leavingRef.current = false;
      if (mountedRef.current) setLeaving(false);
    }
  };
  return (
    <View style={p.panel} accessibilityLiveRegion="polite">
      <View style={p.successIcon}><CircleCheckBig size={44} color={Colors.success} /></View>
      <Text style={[p.title, p.center]} accessibilityRole="header">{title}</Text>
      <Text style={[p.sub, p.center]}>{message}</Text>
      {!!note && (
        <View style={p.note}>
          <Text style={p.noteTxt}>{note}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[p.doneBtn, leaving && p.dim]}
        onPress={() => { void go(); }}
        disabled={leaving}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
      >
        {leaving ? <ActivityIndicator size="small" color="#1A1A1A" /> : <Text style={p.doneBtnTxt}>{primaryLabel}</Text>}
      </TouchableOpacity>
      {!!secondaryLabel && !!onSecondary && (
        <TouchableOpacity style={p.linkBtn} onPress={onSecondary} disabled={leaving} activeOpacity={0.7} accessibilityRole="button">
          <Text style={p.linkTxt}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Panel ─────────────────────────────────────────────────────────────────────
function useExpired(expiresAt: string | null | undefined, active: boolean) {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  const [expired, setExpired] = useState(() => Number.isFinite(at) && at <= Date.now());
  useEffect(() => {
    if (!Number.isFinite(at)) { setExpired(false); return; }
    const left = at - Date.now();
    setExpired(left <= 0);
    if (left <= 0 || !active) return;
    const timer = setTimeout(() => setExpired(true), Math.min(left, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [at, active]);
  return expired;
}

/** True once `active` has held for `ms`. */
function useAfter(active: boolean, ms: number) {
  const [after, setAfter] = useState(false);
  useEffect(() => {
    setAfter(false);
    if (!active) return;
    const timer = setTimeout(() => setAfter(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return after;
}

const Countdown: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return (
    <View style={p.timerRow}>
      <Clock size={13} color="#6B7280" />
      <Text style={p.timerTxt}>Código válido por {pad(Math.floor(left / 60))}:{pad(left % 60)}</Text>
    </View>
  );
};

const Waiting: React.FC<{ text: string }> = ({ text }) => (
  <View style={p.waitingRow}>
    <ActivityIndicator size="small" color={Colors.primary} />
    <Text style={p.waitingTxt}>{text}</Text>
  </View>
);

const Or: React.FC = () => (
  <View style={p.orRow}>
    <View style={p.orLine} />
    <Text style={p.orTxt}>ou</Text>
    <View style={p.orLine} />
  </View>
);

interface CardSheetProps {
  visible: boolean;
  onClose: () => void;
  /** A card is being sent: the sheet stays until its answer is on screen. */
  charging: boolean;
  chargingText: string;
  title: string;
  subtitle: string;
  amount: number;
  notice: string | null;
  /** A new key loads the form again from scratch. */
  formKey: string;
  email: string | null;
  creditOnly?: boolean;
  onSubmit: (form: CardFormData, deviceId: string | null) => Promise<CardFormReply>;
  /** Other ways to pay, shown when the form cannot load. */
  fallback?: React.ReactNode;
}

/** Mercado Pago's card form over the panel, for a pass or the monthly subscription. */
const CardSheet: React.FC<CardSheetProps> = ({
  visible, onClose, charging, chargingText, title, subtitle, amount, notice, formKey, email, creditOnly, onSubmit, fallback,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={p.sheet}>
        <View style={[p.sheetHead, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={[p.sheetClose, charging && p.dim]}
            onPress={onClose}
            disabled={charging}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <X size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={p.sheetTitle}>{title}</Text>
            <Text style={p.sub} numberOfLines={1}>{subtitle}</Text>
          </View>
          <Text style={p.amount}>{fmtBRL(amount)}</Text>
        </View>
        {!!notice && (
          <View style={[p.expiredBox, p.sheetNotice]}>
            <AlertCircle size={16} color="#92400E" />
            <Text style={p.expiredTxt}>{notice}</Text>
          </View>
        )}
        <View style={p.sheetBody}>
          <CardPaymentForm
            key={formKey}
            amount={amount}
            email={email}
            creditOnly={creditOnly}
            onSubmit={onSubmit}
            fallback={fallback}
          />
          {charging && (
            <View style={p.sheetBusy}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={p.sheetBusyTxt}>{chargingText}</Text>
            </View>
          )}
        </View>
        <View style={[p.sheetFoot, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Lock size={13} color="#6B7280" />
          <Text style={p.sheetFootTxt}>Os dados do cartão ficam só com o Mercado Pago.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface PlanPaymentPanelProps {
  payment: PlanPayment;
  /** Leaves the panel without paying ("Voltar aos planos"). */
  onClose: () => void;
  /** After the payment is confirmed. */
  onDone: () => void | Promise<void>;
  closeLabel?: string;
  doneLabel?: string;
  /** A second way out of the confirmation, under the main button. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Shown on the confirmation instead of the renewal note. */
  doneNote?: string;
}

export const PlanPaymentPanel: React.FC<PlanPaymentPanelProps> = ({
  payment, onClose, onDone, closeLabel = 'Voltar aos planos', doneLabel = 'Ir para as corridas',
  secondaryLabel, onSecondary, doneNote,
}) => {
  const {
    session, confirmed, confirmedRow, returned, busy, checking, notYet, intentClosed, declined, processing, intentStatus,
    cardFormOpen, cardNotice,
  } = payment;
  const [copied, setCopied] = useState<'copied' | 'shared' | null>(null);
  const expiredByTime = useExpired(session?.expiresAt, !!session && !confirmed);
  // A subscription Mercado Pago has not confirmed after a while: the card was
  // probably refused on its page, which never comes back to say so.
  const recurringStalled = useAfter(!!session && session.method === 'recurring' && returned && !confirmed, 120_000);

  const paymentId = session?.paymentId;
  useEffect(() => { setCopied(null); }, [paymentId]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 5000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!session) return null;
  const label = PLAN_LABELS[session.plan];
  const pass = isPassPlan(session.plan);
  const busyAny = busy !== null;

  if (confirmed) {
    const row = confirmedRow;
    const until = row?.due_date ? fmtCutoff(row.due_date) : '';
    const renews = !pass && !!row?.provider_subscription_id;
    return (
      <PlanSuccess
        title="Pagamento confirmado!"
        message={`Plano ${label} ativo${until ? (renews ? `. Próxima cobrança em ${fmtDate(row?.due_date)}` : ` até ${until}`) : ''}. `
          + 'Você já pode ficar online e aceitar corridas.'}
        note={doneNote ?? (pass ? 'Esse plano não renova sozinho. Vamos te avisar antes de vencer para você renovar com um toque.' : undefined)}
        primaryLabel={doneLabel}
        onPrimary={onDone}
        secondaryLabel={secondaryLabel}
        onSecondary={onSecondary}
      />
    );
  }

  const header = (title: string, subtitle: string) => (
    <View style={p.headRow}>
      <View style={{ flex: 1 }}>
        <Text style={p.title}>{title}</Text>
        <Text style={p.sub}>{subtitle}</Text>
      </View>
      <Text style={p.amount}>{fmtBRL(session.amount)}</Text>
    </View>
  );
  const planLine = `Plano ${label}${session.extend ? ' · dias somados ao plano atual' : ''}`;
  const passNote = (
    <View style={p.note}>
      <Text style={p.noteTxt}>
        Pagamento único: não renova sozinho. Vamos te avisar antes de vencer para você renovar.
      </Text>
    </View>
  );
  const closeLink = (
    <TouchableOpacity style={p.linkBtn} onPress={onClose} activeOpacity={0.7} accessibilityRole="button">
      <Text style={p.linkTxt}>{closeLabel}</Text>
    </TouchableOpacity>
  );
  const verify = (
    <>
      <TouchableOpacity style={p.linkBtn} onPress={() => { void payment.checkNow(); }} disabled={checking} activeOpacity={0.7}>
        <Text style={[p.linkTxt, { color: Colors.primaryDark }]}>{checking ? 'Verificando…' : 'Já paguei, verificar agora'}</Text>
      </TouchableOpacity>
      {notYet && (
        <Text style={p.notYet}>
          Ainda não recebemos a confirmação. Se você já pagou, aguarde alguns segundos: a liberação é automática.
        </Text>
      )}
    </>
  );
  // Another payment while one is under review is asked about first.
  const payAgain = (pay: (options?: PayAgainOptions) => Promise<void>) => {
    if (!processing) { void pay(); return; }
    void confirmPayAgain().then((yes) => { if (yes) void pay({ allowProcessing: true }); });
  };

  // ── Pix ──
  if (session.method === 'pix') {
    const expired = intentClosed || expiredByTime;
    const code = session.pix?.qr_code ?? '';
    const copy = async () => {
      const result = await copyText(code);
      if (result === 'failed') Alert.alert('Não foi possível copiar', 'Toque e segure o código para copiar manualmente.');
      else setCopied(result);
    };
    return (
      <View style={p.panel}>
        {header('Pague com Pix', planLine)}

        {expired ? (
          <>
            <View style={p.expiredBox}>
              <Clock size={16} color="#92400E" />
              <Text style={p.expiredTxt}>
                {intentStatus === 'rejected'
                  ? 'O pagamento deste código foi recusado. Gere um novo para tentar de novo.'
                  : !expiredByTime
                    ? 'Este código Pix não vale mais. Gere um novo para pagar.'
                    : 'Este código Pix expirou. Gere um novo para pagar.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[p.primaryBtn, busyAny && p.dim]}
              onPress={() => { void payment.payWithPix(); }}
              disabled={busyAny}
              activeOpacity={0.85}
            >
              {busy === 'pix' ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={17} color="#fff" />}
              <Text style={p.primaryTxt}>{busy === 'pix' ? 'Gerando…' : 'Gerar novo código'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {(!!code || !!session.pix?.qr_code_base64) && (
              <View style={p.qrBox}>
                <View style={p.qrFrame}>
                  <PixQrCode value={code} fallbackBase64={session.pix?.qr_code_base64} size={188} />
                </View>
                <Text style={p.qrHint}>Escaneie com o app do banco ou copie o código abaixo.</Text>
              </View>
            )}
            <View style={p.codeBox}>
              <Text style={p.codeLabel}>PIX COPIA E COLA</Text>
              <Text style={p.code} numberOfLines={2} selectable>{code}</Text>
            </View>
            <TouchableOpacity
              style={[p.primaryBtn, copied && p.primaryDone]}
              onPress={() => { void copy(); }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {copied ? <CircleCheckBig size={18} color="#1A1A1A" /> : <Copy size={18} color="#fff" />}
              <Text style={[p.primaryTxt, copied && { color: '#1A1A1A' }]}>
                {copied === 'copied' ? 'Código copiado!' : copied === 'shared' ? 'Código enviado' : 'Copiar código Pix'}
              </Text>
            </TouchableOpacity>
            {session.expiresAt && <Countdown expiresAt={session.expiresAt} />}

            <View style={p.steps}>
              {[
                'Toque em "Copiar código Pix".',
                'Abra o app do seu banco e escolha Pix Copia e Cola.',
                'Cole o código, pague e volte aqui. A liberação é automática.',
              ].map((text, index) => (
                <View key={text} style={p.stepRow}>
                  <View style={p.stepNum}><Text style={p.stepNumTxt}>{index + 1}</Text></View>
                  <Text style={p.stepTxt}>{text}</Text>
                </View>
              ))}
            </View>


            <Waiting text={returned ? 'Conferindo seu pagamento…' : 'Aguardando o pagamento…'} />
            {verify}
          </>
        )}

        <Or />
        <TouchableOpacity
          style={[p.outlineBtn, busyAny && p.dim]}
          onPress={() => { void payment.payWithCard(); }}
          disabled={busyAny}
          activeOpacity={0.85}
        >
          {busy === 'card' || busy === 'open' ? <ActivityIndicator size="small" color="#1A1A1A" /> : <CreditCard size={17} color="#1A1A1A" />}
          <Text style={p.outlineTxt}>{busy === 'card' || busy === 'open' ? 'Abrindo…' : 'Pagar com cartão'}</Text>
        </TouchableOpacity>
        {passNote}
        {closeLink}
      </View>
    );
  }

  // ── Card in the app (Mercado Pago's form) ──
  if (session.method === 'card') {
    // A card still settling can be approved after the payment's hour is up.
    const cardExpired = intentClosed || (expiredByTime && !processing);
    const charging = busy === 'charge';
    // From the form that did not load: the other ways to pay.
    const leaveForm = (pay: (options?: PayAgainOptions) => Promise<void>) => {
      payment.closeCardForm();
      payAgain(pay);
    };
    const otherWays = (
      <View style={p.sheetOther}>
        <TouchableOpacity
          style={[p.outlineBtn, busyAny && p.dim]}
          onPress={() => leaveForm(payment.payWithPix)}
          disabled={busyAny}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <QrCode size={17} color="#1A1A1A" />
          <Text style={p.outlineTxt}>Pagar com Pix</Text>
        </TouchableOpacity>
        <TouchableOpacity style={p.linkBtn} onPress={() => leaveForm(payment.payWithCheckout)} disabled={busyAny} activeOpacity={0.7}>
          <Text style={p.linkTxt}>Pagar na página do Mercado Pago</Text>
        </TouchableOpacity>
      </View>
    );
    return (
      <View style={p.panel}>
        {header('Pagar com cartão', `${planLine}. Pague com o cartão aqui mesmo no app.`)}

        {processing && !intentClosed ? (
          <>
            <View style={p.expiredBox}>
              <Clock size={16} color="#92400E" />
              <Text style={p.expiredTxt}>
                {cardNotice ?? 'O Mercado Pago está processando o seu pagamento. Se ele ficar em análise, pode demorar mais. O plano é liberado sozinho quando for aprovado.'}
              </Text>
            </View>
            <Waiting text="Aguardando a aprovação do Mercado Pago…" />
            {verify}
            <TouchableOpacity
              style={p.linkBtn}
              onPress={() => { void confirmPayAgain().then((yes) => { if (yes) payment.openCardForm({ allowProcessing: true }); }); }}
              disabled={busyAny}
              activeOpacity={0.7}
            >
              <Text style={p.linkTxt}>Pagar com outro cartão</Text>
            </TouchableOpacity>
          </>
        ) : cardExpired ? (
          <>
            <View style={p.expiredBox}>
              <Clock size={16} color="#92400E" />
              <Text style={p.expiredTxt}>Este pagamento com cartão expirou e nada foi cobrado. Toque abaixo para pagar.</Text>
            </View>
            <TouchableOpacity
              style={[p.primaryBtn, busyAny && p.dim]}
              onPress={() => { void payment.payWithCard(); }}
              disabled={busyAny}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {busy === 'card' ? <ActivityIndicator size="small" color="#fff" /> : <CreditCard size={18} color="#fff" />}
              <Text style={p.primaryTxt}>{busy === 'card' ? 'Abrindo…' : 'Continuar com cartão'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {(!!cardNotice || declined) && (
              <View style={p.expiredBox}>
                <AlertCircle size={16} color="#92400E" />
                <Text style={p.expiredTxt}>
                  {cardNotice ?? 'O pagamento foi recusado e nada foi cobrado. Tente outro cartão ou pague com Pix.'}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[p.primaryBtn, busyAny && p.dim]}
              onPress={() => payment.openCardForm()}
              disabled={busyAny}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <CreditCard size={18} color="#fff" />
              <Text style={p.primaryTxt}>{declined ? 'Tentar outro cartão' : 'Digitar dados do cartão'}</Text>
            </TouchableOpacity>
            {(declined || !!cardNotice) && verify}
          </>
        )}

        <Or />
        <TouchableOpacity
          style={[p.outlineBtn, busyAny && p.dim]}
          onPress={() => payAgain(payment.payWithPix)}
          disabled={busyAny}
          activeOpacity={0.85}
        >
          {busy === 'pix' ? <ActivityIndicator size="small" color="#1A1A1A" /> : <QrCode size={17} color="#1A1A1A" />}
          <Text style={p.outlineTxt}>{busy === 'pix' ? 'Gerando o Pix…' : 'Pagar com Pix'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={p.linkBtn} onPress={() => payAgain(payment.payWithCheckout)} disabled={busyAny} activeOpacity={0.7}>
          <Text style={p.linkTxt}>{busy === 'open' ? 'Abrindo o Mercado Pago…' : 'Pagar na página do Mercado Pago'}</Text>
        </TouchableOpacity>
        {passNote}
        {closeLink}

        <CardSheet
          visible={cardFormOpen}
          onClose={payment.closeCardForm}
          charging={charging}
          chargingText="Processando o pagamento… não feche o app."
          title="Cartão de crédito ou débito"
          subtitle={planLine}
          amount={session.amount}
          notice={cardNotice}
          formKey={session.paymentId ?? 'card'}
          email={session.payerEmail}
          onSubmit={payment.payCard}
          fallback={otherWays}
        />
      </View>
    );
  }

  // ── Monthly subscription: the card in the app, Mercado Pago's page as the fallback ──
  if (session.method === 'recurring') {
    const charging = busy === 'charge';
    const opening = busy === 'open';
    // From the form that did not load: Mercado Pago's page, once the form is gone.
    const leaveForm = () => {
      payment.closeCardForm();
      setTimeout(() => { void payment.openCheckout(); }, 400);
    };
    return (
      <View style={p.panel}>
        {header(`Assinatura ${label}`, 'Cartão de crédito, cobrado todo mês. Assine aqui mesmo no app e cancele quando quiser.')}

        {!!cardNotice && (
          <View style={p.expiredBox}>
            <AlertCircle size={16} color="#92400E" />
            <Text style={p.expiredTxt}>{cardNotice}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[p.primaryBtn, busyAny && p.dim]}
          onPress={() => payment.openCardForm()}
          disabled={busyAny}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <CreditCard size={18} color="#fff" />
          <Text style={p.primaryTxt}>Assinar com cartão</Text>
        </TouchableOpacity>
        {returned && <Waiting text="Conferindo o pagamento com o Mercado Pago…" />}
        {(returned || !!cardNotice) && verify}
        {recurringStalled && (
          <View style={p.expiredBox}>
            <AlertCircle size={16} color="#92400E" />
            <Text style={p.expiredTxt}>
              O Mercado Pago ainda não confirmou a assinatura. Se o cartão foi recusado, toque em "Assinar com cartão" e use outro cartão, ou volte aos planos e escolha outra forma de pagamento.
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={p.linkBtn}
          onPress={() => { void payment.openCheckout(); }}
          disabled={busyAny}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={p.linkTxt}>{opening ? 'Abrindo o Mercado Pago…' : 'Pagar na página do Mercado Pago'}</Text>
        </TouchableOpacity>
        <View style={p.note}>
          <Text style={p.noteTxt}>
            Os dados do cartão ficam só com o Mercado Pago. O plano é liberado assim que a assinatura for aprovada.
          </Text>
        </View>
        {closeLink}

        <CardSheet
          visible={cardFormOpen}
          onClose={payment.closeCardForm}
          charging={charging}
          chargingText="Processando a assinatura… não feche o app."
          title="Cartão de crédito"
          subtitle={`Plano ${label} · cobrado todo mês`}
          amount={session.amount}
          notice={cardNotice}
          formKey={`recurring:${session.startedAt}`}
          email={session.payerEmail}
          creditOnly
          onSubmit={payment.subscribeCard}
          fallback={(
            <View style={p.sheetOther}>
              <TouchableOpacity style={p.linkBtn} onPress={leaveForm} disabled={busyAny} activeOpacity={0.7} accessibilityRole="button">
                <Text style={p.linkTxt}>Pagar na página do Mercado Pago</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  }

  // ── Card on Mercado Pago's page (Checkout Pro) ──
  // A payment still settling can be approved after the link's hour is up.
  const linkExpired = intentClosed || (expiredByTime && !processing);
  const opening = busy === 'open';
  return (
    <View style={p.panel}>
      {header('Pagar com cartão', `${planLine}. Cartão ou saldo do Mercado Pago, numa página segura.`)}

      {session.pixUnavailable && (
        <View style={p.expiredBox}>
          <AlertCircle size={16} color="#92400E" />
          <Text style={p.expiredTxt}>O Pix está indisponível agora. Pague com cartão ou saldo do Mercado Pago.</Text>
        </View>
      )}

      {processing && !intentClosed ? (
        <>
          <View style={p.expiredBox}>
            <Clock size={16} color="#92400E" />
            <Text style={p.expiredTxt}>
              O Mercado Pago está processando o seu pagamento. Se ele ficar em análise, pode demorar mais. O plano é liberado sozinho quando for aprovado.
            </Text>
          </View>
          <Waiting text="Aguardando a aprovação do Mercado Pago…" />
          {verify}
        </>
      ) : declined && !linkExpired ? (
        <>
          <View style={p.expiredBox}>
            <AlertCircle size={16} color="#92400E" />
            <Text style={p.expiredTxt}>O pagamento foi recusado. Tente outro cartão ou pague com Pix.</Text>
          </View>
          <TouchableOpacity
            style={[p.primaryBtn, busyAny && p.dim]}
            onPress={() => { void payment.payWithCheckout(); }}
            disabled={busyAny}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {busy === 'card' || opening ? <ActivityIndicator size="small" color="#fff" /> : <CreditCard size={18} color="#fff" />}
            <Text style={p.primaryTxt}>{busy === 'card' || opening ? 'Abrindo o Mercado Pago…' : 'Tentar outro cartão'}</Text>
          </TouchableOpacity>
          {verify}
        </>
      ) : linkExpired ? (
        <>
          <View style={p.expiredBox}>
            <Clock size={16} color="#92400E" />
            <Text style={p.expiredTxt}>Este link de pagamento expirou. Gere um novo para pagar.</Text>
          </View>
          <TouchableOpacity
            style={[p.primaryBtn, busyAny && p.dim]}
            onPress={() => { void payment.payWithCheckout(); }}
            disabled={busyAny}
            activeOpacity={0.85}
          >
            {busy === 'card' ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={17} color="#fff" />}
            <Text style={p.primaryTxt}>{busy === 'card' ? 'Gerando…' : 'Gerar novo link'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[p.primaryBtn, busyAny && p.dim]}
            onPress={() => { void payment.openCheckout(); }}
            disabled={busyAny}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {opening ? <ActivityIndicator size="small" color="#fff" /> : <CreditCard size={18} color="#fff" />}
            <Text style={p.primaryTxt}>
              {opening
                ? 'Pagamento aberto no Mercado Pago…'
                : returned ? 'Abrir o pagamento de novo' : 'Pagar com cartão'}
            </Text>
          </TouchableOpacity>
          {returned && <Waiting text="Conferindo o pagamento com o Mercado Pago…" />}
          {returned && verify}
        </>
      )}

      {!session.pixUnavailable && (
        <>
          <Or />
          <TouchableOpacity
            style={[p.outlineBtn, busyAny && p.dim]}
            onPress={() => payAgain(payment.payWithPix)}
            disabled={busyAny}
            activeOpacity={0.85}
          >
            {busy === 'pix' ? <ActivityIndicator size="small" color="#1A1A1A" /> : <QrCode size={17} color="#1A1A1A" />}
            <Text style={p.outlineTxt}>{busy === 'pix' ? 'Gerando o Pix…' : 'Pagar com Pix'}</Text>
          </TouchableOpacity>
        </>
      )}

      {passNote}
      {closeLink}
    </View>
  );
};

const p = StyleSheet.create({
  panel: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#E8E8E8',
    padding: 18, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  center: { textAlign: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 2 },
  sub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280', lineHeight: 17 },
  amount: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },

  codeBox: { backgroundColor: '#F7F8FA', borderRadius: 12, padding: 12, marginBottom: 12 },
  codeLabel: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 4 },
  code: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#4B5563', lineHeight: 16 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 15,
  },
  primaryDone: { backgroundColor: Colors.primary },
  primaryTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' },
  dim: { opacity: 0.6 },

  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  timerTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280' },

  steps: { marginTop: 14, gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: Colors.primaryDark },
  stepTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#374151', lineHeight: 19 },

  qrBox: { alignItems: 'center', marginBottom: 14 },
  qrFrame: { padding: 6, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  qrHint: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#6B7280', marginTop: 8, textAlign: 'center' },

  waitingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  waitingTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
  notYet: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#92400E', textAlign: 'center', lineHeight: 17, marginTop: 2 },

  expiredBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  expiredTxt: { flex: 1, fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 17 },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#9CA3AF' },

  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12, paddingVertical: 13, backgroundColor: '#fff',
  },
  outlineTxt: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A' },

  note: { backgroundColor: '#FFF9EC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F59E0B40', marginTop: 14 },
  noteTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 18 },

  linkBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  linkTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },

  sheet: { flex: 1, backgroundColor: '#fff' },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  sheetTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  sheetNotice: { marginHorizontal: 16, marginTop: 12, marginBottom: 0 },
  sheetBody: { flex: 1 },
  sheetBusy: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
  },
  sheetBusyTxt: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A', textAlign: 'center' },
  sheetFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingTop: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  sheetFootTxt: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B7280' },
  sheetOther: { alignSelf: 'stretch', gap: 4, marginTop: 8 },

  successIcon: { alignItems: 'center', marginBottom: 10 },
  doneBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 16 },
  doneBtnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
});
