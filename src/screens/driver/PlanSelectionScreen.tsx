import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar, BackHandler, AppState,
} from 'react-native';
import { Check, Clock, AlertCircle, HelpCircle, LogOut } from 'lucide-react-native';
import { Colors } from '../../constants';
import {
  getAppSettings, selectCommissionPlan, loadSubscriptionSnapshot, planPrice, getSubscription, isSubscriptionCurrent,
  type PlanType, type PendingPass, type PendingCheckout,
} from '../../services/payments';
import { getMyPrimaryVehicleSegment } from '../../services/drivers';
import {
  usePlanPayment, PlanPaymentPanel, PlanSuccess, activePlanMessage, takeReturnSignal, PLAN_LABELS, fmtBRL, type PaidPlan,
} from '../../components/PlanPayment';
import type { AppSettings, PlanSegment, SubscriptionRow } from '../../types/db';

// ── Plan definitions ──────────────────────────────────────────────────────────
interface PlanDef {
  id: PlanType;
  title: string;
  description: string;
  priceMain: string;    // e.g. "15%"  or  "R$ 10,00"
  priceUnit: string;    // e.g. "de cada corrida"
  priceStrike?: string; // optional strikethrough value
  badge?: string;
  badgeColor: string;
  accentColor: string;
  immediate: boolean;
  segment: PlanSegment;
}

const CAR_SEGMENTS = ['economy', 'comfort', 'premium'] as const;

// One tab per kind of plan; a tab with no priced plan is not shown.
type PlanTab = 'commission' | 'daily' | 'weekly' | 'monthly';
const TAB_ORDER: PlanTab[] = ['commission', 'daily', 'weekly', 'monthly'];
const TAB_LABELS: Record<PlanTab, string> = {
  commission: 'Por corrida', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal',
};

// A plan the admin has not priced is not offered: the server would refuse it.
function buildPlans(settings: AppSettings | null, vehicle: 'moto' | 'car'): PlanDef[] {
  const segment: PlanSegment = vehicle === 'moto' ? 'moto' : 'economy';
  const pct = vehicle === 'moto'
    ? (settings?.moto_commission_pct ?? settings?.commission_pct ?? 15)
    : (settings?.commission_pct ?? 15);
  const daily = planPrice(settings, 'daily', segment);
  const weekly = planPrice(settings, 'weekly', segment);

  const plans: PlanDef[] = [{
    id: 'commission', segment, title: 'Por Corrida',
    description: 'Sem mensalidade fixa. Pague uma comissão só quando trabalhar.',
    priceMain: pct + '%', priceUnit: 'por corrida',
    badge: 'ACESSO IMEDIATO', badgeColor: '#6DC228', accentColor: '#6DC228', immediate: true,
  }];
  if (daily > 0) {
    plans.push({
      id: 'daily', segment, title: 'Diário',
      description: 'Pague com Pix na hora e trabalhe o dia todo. Não renova sozinho.',
      priceMain: fmtBRL(daily), priceUnit: 'por dia',
      badgeColor: '#3B82F6', accentColor: '#3B82F6', immediate: false,
    });
  }
  if (weekly > 0) {
    plans.push({
      id: 'weekly', segment, title: 'Semanal',
      description: '7 dias por Pix ou cartão. Pagamento único, sem renovação automática.',
      priceMain: fmtBRL(weekly), priceUnit: 'por semana',
      priceStrike: daily * 7 > weekly ? fmtBRL(daily * 7) + '/semana' : undefined,
      badge: 'MAIS POPULAR', badgeColor: '#7C3AED', accentColor: '#7C3AED', immediate: false,
    });
  }

  if (vehicle === 'moto') {
    const monthly = planPrice(settings, 'monthly', 'moto');
    if (monthly > 0) {
      const strike = weekly * 4 > monthly ? fmtBRL(weekly * 4) + '/mês' : undefined;
      plans.push({
        id: 'monthly', segment: 'moto', title: 'Mensal',
        description: 'Assinatura no cartão, renovada todo mês. Cancele quando quiser.',
        priceMain: fmtBRL(monthly), priceUnit: 'por mês',
        priceStrike: strike,
        badge: strike ? 'MAIOR ECONOMIA' : undefined, badgeColor: '#F59E0B', accentColor: '#F59E0B',
        immediate: false,
      });
    }
    return plans;
  }

  for (const carSegment of CAR_SEGMENTS) {
    const monthly = planPrice(settings, 'monthly', carSegment);
    if (monthly <= 0) continue;
    plans.push({
      id: 'monthly', segment: carSegment,
      title: carSegment === 'economy' ? 'Mensal Econômico' : carSegment === 'comfort' ? 'Mensal Conforto' : 'Mensal Prêmio',
      description: carSegment === 'economy'
        ? 'Assinatura no cartão para corridas econômicas, renovada todo mês.'
        : carSegment === 'comfort'
          ? 'Assinatura no cartão para a categoria conforto, renovada todo mês.'
          : 'Assinatura no cartão para a categoria premium, renovada todo mês.',
      priceMain: fmtBRL(monthly), priceUnit: 'por mês',
      badge: carSegment === 'comfort' ? 'MAIS POPULAR' : undefined,
      badgeColor: carSegment === 'comfort' ? '#7C3AED' : '#3B82F6',
      accentColor: carSegment === 'premium' ? '#8B5CF6' : carSegment === 'comfort' ? '#F59E0B' : '#3B82F6',
      immediate: false,
    });
  }
  return plans;
}

// ── PlanCard ──────────────────────────────────────────────────────────────────
interface PlanCardProps {
  plan: PlanDef;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** A payment for this plan was started and not paid yet. */
  awaiting?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, selected, onPress, disabled, awaiting }) => (
  <TouchableOpacity
    style={[
      pc.card,
      selected && { borderColor: plan.accentColor, borderWidth: 2 },
    ]}
    onPress={onPress}
    activeOpacity={0.82}
    disabled={disabled}
  >
    {/* Radio circle */}
    <View style={[pc.radio, selected && { backgroundColor: plan.accentColor, borderColor: plan.accentColor }]}>
      {selected && <Check size={12} color="#fff" strokeWidth={3} />}
    </View>

    {/* Content */}
    <View style={pc.body}>
      {/* Title row + badge */}
      <View style={pc.titleRow}>
        <Text style={pc.title}>{plan.title}</Text>
        {awaiting ? (
          <View style={[pc.badge, { backgroundColor: '#F59E0B' }]}>
            <Text style={pc.badgeTxt}>AGUARDANDO PAGAMENTO</Text>
          </View>
        ) : plan.badge ? (
          <View style={[pc.badge, { backgroundColor: plan.badgeColor }]}>
            <Text style={pc.badgeTxt}>{plan.badge}</Text>
          </View>
        ) : null}
      </View>

      {/* Description */}
      <Text style={pc.desc}>{plan.description}</Text>

      {/* Price */}
      <View style={pc.priceRow}>
        <Text style={[pc.priceMain, selected && { color: plan.accentColor }]}>
          {plan.priceMain}
        </Text>
        <Text style={pc.priceUnit}> / {plan.priceUnit}</Text>
      </View>

      {/* Strike-through original price */}
      {plan.priceStrike && (
        <Text style={pc.priceStrike}>{plan.priceStrike}</Text>
      )}
    </View>
  </TouchableOpacity>
);

const pc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 14,
  },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#CCCCCC',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  title: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  badge: {
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#ffffff', letterSpacing: 0.4 },
  desc: {
    fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#888',
    marginBottom: 8, lineHeight: 17,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceMain: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  priceUnit: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#999' },
  priceStrike: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#BBBBBB',
    textDecorationLine: 'line-through', marginTop: 2,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────
interface PlanSelectionScreenProps {
  /** Leaves for the rides once the driver has a plan; `row` is the plan just read as in date. */
  onDone: (row?: SubscriptionRow | null) => void | Promise<void>;
  /** Bumped each time a Mercado Pago return link reaches the app. */
  returnSignal?: number;
  onSupport?: () => void;
  onLogout?: () => void;
}

interface Success { title: string; message: string; row: SubscriptionRow | null }

const PlanSelectionScreen: React.FC<PlanSelectionScreenProps> = ({ onDone, returnSignal, onSupport, onLogout }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [segment, setSegment] = useState<'moto' | 'car'>('car');
  const [selected, setSelected] = useState<{ id: PlanType; segment: PlanSegment } | null>(null);
  const [tab, setTab] = useState<PlanTab | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [pendingPass, setPendingPass] = useState<PendingPass | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  // A plan chosen without a payment on screen (Por Corrida, or one already paid).
  const [success, setSuccess] = useState<Success | null>(null);
  const successRef = useRef(success);
  successRef.current = success;
  // Back from Mercado Pago with no payment on screen: a plan found in date is
  // that payment.
  const returningRef = useRef(false);
  // The plan read together with the unpaid payments above.
  const pendingBaseRef = useRef<SubscriptionRow | null | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);

  const payment = usePlanPayment();
  const { session } = payment;
  const paymentRef = useRef(payment);
  paymentRef.current = payment;

  // Unpaid payments from an earlier visit, so the driver does not pay twice.
  const loadPending = useCallback(async (returning = false) => {
    const snapshot = await loadSubscriptionSnapshot(8000).catch(() => null);
    if (!snapshot) return;
    pendingBaseRef.current = snapshot.subscription ?? null;
    setPendingPass(snapshot.pending_pass?.plan ? snapshot.pending_pass : null);
    setPendingCheckout(snapshot.pending_checkout?.plan === 'monthly' && snapshot.pending_checkout.init_point
      ? snapshot.pending_checkout : null);
    // Paid meanwhile (with the app closed, on another phone, by the admin):
    // there is nothing left to choose.
    const row = snapshot.subscription ?? null;
    if (isSubscriptionCurrent(row) && !paymentRef.current.session && !successRef.current) {
      setSuccess({
        title: returning || returningRef.current ? 'Pagamento confirmado!' : 'Seu plano já está ativo',
        message: `${activePlanMessage(row)} Você já pode ficar online e aceitar corridas.`,
        row,
      });
    }
  }, []);

  // Without the prices the plans cannot be shown: never guess them.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [cfg, vehicle] = await Promise.all([getAppSettings(), getMyPrimaryVehicleSegment(), loadPending()]);
      setSettings(cfg);
      setSegment(vehicle);
      if (!cfg) setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadPending]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Back in the app with no payment on screen: a plan paid meanwhile shows up.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !paymentRef.current.session && !successRef.current) void loadPending();
    });
    return () => listener.remove();
  }, [loadPending]);

  // The Mercado Pago return link: check the payment right away.
  useEffect(() => {
    if (!takeReturnSignal(returnSignal)) return;
    if (paymentRef.current.session) {
      paymentRef.current.markReturned();
      return;
    }
    returningRef.current = true;
    void loadPending(true);
  }, [returnSignal, loadPending]);

  // A new payment opens at the top, where the panel is.
  const sessionKey = session ? `${session.plan}:${session.startedAt}` : '';
  useEffect(() => {
    if (sessionKey) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [sessionKey]);

  const closePanel = useCallback(() => {
    paymentRef.current.close();
    void loadPending();
  }, [loadPending]);

  // Android's back button leaves the payment panel; on the plan list it
  // leaves the app, since there is nowhere else to go without a plan.
  useEffect(() => {
    if (!session) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paymentRef.current.confirmed) void onDone(paymentRef.current.confirmedRow); else closePanel();
      return true;
    });
    return () => backSub.remove();
  }, [session, closePanel, onDone]);

  // On the success screen, back does what "Ir para as corridas" does.
  useEffect(() => {
    if (!success || session) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      void onDone(successRef.current?.row);
      return true;
    });
    return () => backSub.remove();
  }, [success, session, onDone]);

  const plans = buildPlans(settings, segment);
  const fallbackSegment: PlanSegment = segment === 'moto' ? 'moto' : 'economy';
  const pendingFor = (plan: PlanType, planSegment: PlanSegment): 'pass' | 'checkout' | null => {
    if (pendingPass?.plan === plan && (pendingPass.plan_segment ?? fallbackSegment) === planSegment) return 'pass';
    if (pendingCheckout?.plan === plan && (pendingCheckout.plan_segment ?? fallbackSegment) === planSegment) return 'checkout';
    return null;
  };
  // Only one unpaid payment is offered back: the most useful is the one the
  // driver can still pay in the app.
  const resumable = pendingPass?.plan
    ? {
      plan: pendingPass.plan as PaidPlan,
      amount: pendingPass.amount,
      method: pendingPass.method,
      kind: 'pass' as const,
      processing: !!pendingPass.processing,
    }
    : pendingCheckout?.plan
      ? { plan: pendingCheckout.plan, amount: pendingCheckout.amount, method: 'recurring' as const, kind: 'checkout' as const, processing: false }
      : null;

  // The open payment's tab comes first, so the driver finds it without looking.
  const tabs = TAB_ORDER.filter(id => plans.some(p => p.id === id));
  const activeTab: PlanTab | null = tab && tabs.includes(tab)
    ? tab
    : resumable && tabs.includes(resumable.plan) ? resumable.plan : tabs[0] ?? null;
  const tabPlans = plans.filter(p => p.id === activeTab);
  // A tab with a single plan has it chosen already; Mensal for a car lists the categories.
  const chosen = selected && selected.id === activeTab && tabPlans.some(p => p.segment === selected.segment)
    ? selected
    : tabPlans.length === 1 ? { id: tabPlans[0].id, segment: tabPlans[0].segment } : null;

  const resume = async (kind: 'pass' | 'checkout') => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (kind === 'pass' && pendingPass) await payment.resumePass(pendingPass, fallbackSegment, pendingBaseRef.current);
      else if (kind === 'checkout' && pendingCheckout) await payment.resumeCheckout(pendingCheckout, fallbackSegment, pendingBaseRef.current);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!chosen) { Alert.alert('Escolha um plano', 'Selecione uma opção antes de continuar.'); return; }
    if (submittingRef.current || payment.busy) return;
    const pending = pendingFor(chosen.id, chosen.segment);
    if (pending) { await resume(pending); return; }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (chosen.id === 'commission') {
        let row: SubscriptionRow | null;
        try {
          row = await selectCommissionPlan(chosen.segment);
        } catch (err) {
          // The switch may have gone through before the connection dropped.
          const now = await getSubscription().catch(() => null);
          if (now?.plan !== 'commission' || !isSubscriptionCurrent(now)) throw err;
          row = now;
        }
        setSuccess({
          title: 'Plano Por Corrida ativado!',
          message: 'Sem mensalidade: você paga a comissão só nas corridas. Você já pode ficar online e aceitar corridas.',
          row,
        });
        return;
      }
      const result = await payment.start(chosen.id, chosen.segment, { method: 'pix' });
      // Paid already (for example on another phone): nothing to pay again.
      if (result === 'already_active') {
        const row = await getSubscription().catch(() => null);
        setSuccess({
          title: 'Seu plano já está ativo',
          message: `${activePlanMessage(row)} Não é preciso pagar de novo: você já pode ficar online e aceitar corridas.`,
          row,
        });
      }
    } catch (err: unknown) {
      Alert.alert('Não foi possível continuar', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F8FA" />
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={s.loadingTxt}>Carregando planos...</Text>
      </View>
    );
  }

  const busy = submitting || payment.busy !== null;
  const selectedPlan = chosen ? plans.find(p => p.id === chosen.id && p.segment === chosen.segment) : undefined;
  const selectedPending = chosen ? pendingFor(chosen.id, chosen.segment) : null;
  const hasPass = plans.some(p => p.id === 'daily' || p.id === 'weekly');
  const hasMonthly = plans.some(p => p.id === 'monthly');
  const panelOpen = !!session || !!success;
  const listShown = !panelOpen && !loadError;
  const confirmLogout = () => {
    if (!onLogout) return;
    Alert.alert('Sair da conta?', 'Você pode entrar de novo quando quiser.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FA" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>Rotta Urbana</Text>
          <Text style={s.title}>
            {success && !session ? 'Tudo certo!' : session ? 'Pagamento do plano' : segment === 'moto' ? 'Planos para sua moto' : 'Plano para seu carro'}
          </Text>
          {!panelOpen && (
            <Text style={s.subtitle}>
              {hasPass && hasMonthly
                ? 'Diário e Semanal: pagamento único por Pix ou cartão. Mensal: assinatura no cartão.'
                : hasPass
                  ? 'Pague por Pix ou cartão, sem assinatura. Você renova quando quiser.'
                  : hasMonthly
                    ? 'Assinatura no cartão, renovada todo mês. Cancele quando quiser.'
                    : 'Escolha como quer pagar pelo uso do aplicativo.'}
            </Text>
          )}
        </View>

        {session && (
          <PlanPaymentPanel
            payment={payment}
            onClose={closePanel}
            onDone={() => onDone(payment.confirmedRow)}
            closeLabel="Escolher outro plano"
            doneLabel="Ir para as corridas"
          />
        )}

        {success && !session && (
          <PlanSuccess title={success.title} message={success.message} onPrimary={() => onDone(success.row)} />
        )}

        {!panelOpen && loadError && (
          <View style={s.errorBox}>
            <View style={s.resumeRow}>
              <AlertCircle size={18} color={Colors.danger} />
              <Text style={[s.errorTxt, { flex: 1 }]}>
                Não conseguimos carregar os planos. Verifique sua conexão e tente novamente.
              </Text>
            </View>
            <TouchableOpacity style={s.errorBtn} onPress={() => { void loadAll(); }} activeOpacity={0.85} accessibilityRole="button">
              <Text style={s.errorBtnTxt}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Unpaid payment from before */}
        {listShown && resumable && (
          <View style={s.resumeBox}>
            <View style={s.resumeRow}>
              <Clock size={18} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={s.resumeTitle}>{resumable.processing ? 'Pagamento em análise' : 'Pagamento em aberto'}</Text>
                <Text style={s.resumeTxt}>
                  {PLAN_LABELS[resumable.plan]} · {fmtBRL(resumable.amount)}
                  {resumable.processing
                    ? '. O Mercado Pago está analisando o seu pagamento. Quando for aprovado, o plano é liberado sozinho, sem pagar de novo.'
                    : `${resumable.method === 'pix' ? ' · Pix já gerado' : resumable.method === 'checkout' || resumable.method === 'card' ? ' · cartão' : ' · assinatura'}. Continue de onde parou, sem gerar outro.`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.resumeBtn, busy && { opacity: 0.7 }]}
              onPress={() => { void resume(resumable.kind); }}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={s.resumeBtnTxt}>{resumable.processing ? 'Ver pagamento' : 'Continuar pagamento'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Plan tabs */}
        {listShown && tabs.length > 1 && (
          <View style={s.tabs} accessibilityRole="tablist">
            {tabs.map((id) => {
              const active = id === activeTab;
              const awaiting = plans.some(p => p.id === id && pendingFor(p.id, p.segment) !== null);
              return (
                <TouchableOpacity
                  key={id}
                  style={[s.tab, active && s.tabActive]}
                  onPress={() => setTab(id)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active, disabled: busy }}
                >
                  <Text
                    style={[s.tabTxt, active && s.tabTxtActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {TAB_LABELS[id]}
                  </Text>
                  {awaiting && <View style={s.tabDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Plan cards */}
        {listShown && tabPlans.map((plan) => (
          <PlanCard
            key={`${plan.id}-${plan.segment}`}
            plan={plan}
            selected={chosen?.id === plan.id && chosen.segment === plan.segment}
            onPress={() => setSelected({ id: plan.id, segment: plan.segment })}
            disabled={busy}
            awaiting={pendingFor(plan.id, plan.segment) !== null}
          />
        ))}

        {/* CTA button */}
        {listShown && (
          <TouchableOpacity
            style={[s.btn, (!chosen || busy) && s.btnDisabled]}
            onPress={handleConfirm}
            disabled={!chosen || busy}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>
                  {!selectedPlan
                    ? activeTab === 'monthly' ? 'Escolha a categoria' : 'Selecione um plano'
                    : selectedPending
                      ? resumable?.processing && resumable.plan === selectedPlan.id ? 'Ver pagamento em análise' : 'Continuar pagamento'
                      : selectedPlan.id === 'commission'
                        ? 'Começar com Por Corrida'
                        : selectedPlan.id === 'monthly'
                          ? 'Assinar ' + selectedPlan.title
                          : 'Pagar ' + selectedPlan.title + ' · ' + selectedPlan.priceMain}
                </Text>
            }
          </TouchableOpacity>
        )}

        {/* Help and the way out, for a driver who cannot pay now */}
        {!panelOpen && (onSupport || onLogout) && (
          <View style={s.footer}>
            {onSupport && (
              <TouchableOpacity style={s.footerBtn} onPress={onSupport} disabled={busy} activeOpacity={0.7} accessibilityRole="button">
                <HelpCircle size={16} color="#6B7280" />
                <Text style={s.footerTxt}>Falar com o suporte</Text>
              </TouchableOpacity>
            )}
            {onLogout && (
              <TouchableOpacity style={s.footerBtn} onPress={confirmLogout} disabled={busy} activeOpacity={0.7} accessibilityRole="button">
                <LogOut size={16} color="#6B7280" />
                <Text style={s.footerTxt}>Sair da conta</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA' },
  center: { flex: 1, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingTxt: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#999' },
  scroll: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 24 },

  header: { marginBottom: 32 },
  eyebrow: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#999', marginBottom: 4 },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 8 },
  subtitle: {
    fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#888', lineHeight: 20,
  },

  resumeBox: {
    backgroundColor: '#FFF9EC', borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B55',
    padding: 14, marginBottom: 16, gap: 12,
  },
  resumeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  resumeTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#92400E', marginBottom: 2 },
  resumeTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 18 },
  resumeBtn: {
    backgroundColor: '#F59E0B', borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  resumeBtnTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },

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

  btn: {
    backgroundColor: '#1A1A1A', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 14, marginTop: 6,
  },
  btnDisabled: { backgroundColor: '#D1D5DB' },
  btnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#ffffff' },

  errorBox: {
    backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    padding: 14, marginBottom: 16, gap: 12,
  },
  errorTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.danger, lineHeight: 19 },
  errorBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  errorBtnTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#ffffff' },

  footer: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8 },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  footerTxt: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#6B7280' },
});

export default PlanSelectionScreen;
