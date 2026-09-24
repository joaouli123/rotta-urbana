import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, CheckCircle, AlertCircle, RefreshCw,
  Check, Zap,
} from 'lucide-react-native';
import { Colors, Radius } from '../../constants';
import {
  getSubscription, getAppSettings, selectPlan, createSubscriptionCheckout, syncSubscriptionStatus,
  getDriverPlanType, getDriverPlanSegment, getMercadoPagoConnectionStatus, startMercadoPagoConnection,
  disconnectMercadoPago, watchDriverSubscription, type PlanType,
} from '../../services/payments';
import type { SubscriptionRow, AppSettings, PlanSegment } from '../../types/db';
import type { MercadoPagoConnectionStatus } from '../../services/payments';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

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

// ── Plan definitions ──────────────────────────────────────────────────────────
interface PlanDef {
  id: PlanType;
  title: string;
  description: string;
  priceMain: string;
  priceUnit: string;
  priceStrike?: string;
  badge?: string;
  badgeColor: string;
  accentColor: string;
  immediate: boolean;
}

function buildPlans(settings: AppSettings | null, segment: PlanSegment | null): PlanDef[] {
  const isMoto = segment === 'moto';
  const daily   = isMoto ? (settings?.moto_daily_price ?? settings?.subscription_daily_amount ?? 10) : (settings?.subscription_daily_amount ?? 10);
  const weekly  = isMoto ? (settings?.moto_weekly_price ?? settings?.plan_weekly_price ?? 40) : (settings?.plan_weekly_price ?? (settings?.subscription_monthly_amount ?? 120) / 4);
  const monthly = isMoto ? (settings?.moto_monthly_price ?? settings?.subscription_monthly_amount ?? 150)
    : segment === 'comfort' ? (settings?.car_comfort_monthly_price ?? 380)
      : segment === 'premium' ? (settings?.car_premium_monthly_price ?? 450)
        : (settings?.car_economy_monthly_price ?? settings?.subscription_monthly_amount ?? 350);
  const pct     = isMoto ? (settings?.moto_commission_pct ?? settings?.commission_pct ?? 15) : (settings?.commission_pct ?? 15);

  return [
    {
      id: 'commission', title: 'Por Corrida', immediate: true,
      description: 'Sem mensalidade. Pague comissão só quando trabalhar.',
      priceMain: pct + '%', priceUnit: 'por corrida',
      badge: 'IMEDIATO', badgeColor: '#6DC228', accentColor: '#6DC228',
    },
    {
      id: 'daily', title: 'Diário', immediate: false,
      description: 'Pague hoje e trabalhe sem limites o dia todo.',
      priceMain: fmtBRL(daily), priceUnit: 'por dia',
      badgeColor: '#3B82F6', accentColor: '#3B82F6',
    },
    {
      id: 'weekly', title: 'Semanal', immediate: false,
      description: 'Melhor custo-benefício para quem trabalha toda semana.',
      priceMain: fmtBRL(weekly), priceUnit: 'por semana',
      priceStrike: fmtBRL(daily * 7) + '/sem',
      badge: 'POPULAR', badgeColor: '#7C3AED', accentColor: '#7C3AED',
    },
    {
      id: 'monthly', title: 'Mensal', immediate: false,
      description: 'Para motoristas dedicados. Maior economia no mês.',
      priceMain: fmtBRL(monthly), priceUnit: 'por mês',
      priceStrike: fmtBRL(weekly * 4) + '/mes',
      badge: 'ECONOMIA', badgeColor: '#F59E0B', accentColor: '#F59E0B',
    },
  ];
}

const PLAN_LABELS: Record<PlanType, string> = {
  commission: 'Por Corrida', daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal',
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface DriverSubscriptionScreenProps {
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
const DriverSubscriptionScreen: React.FC<DriverSubscriptionScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();

  const [sub, setSub]           = useState<SubscriptionRow | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanType | null>(null);
  const [currentSegment, setCurrentSegment] = useState<PlanSegment | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadInFlight = useRef(false);
  const hasLoaded = useRef(false);
  const [mpConnection, setMpConnection] = useState<MercadoPagoConnectionStatus | null>(null);
  const [connectingMp, setConnectingMp] = useState(false);

  // Plan-change flow
  const [pendingPlan, setPendingPlan]   = useState<PlanType | null>(null);
  const [switching, setSwitching]       = useState(false);
  const [pixCode, setPixCode]           = useState<string | null>(null);
  const [pixAmount, setPixAmount]       = useState(0);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const checkoutBaselinePaidAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!hasLoaded.current) setLoading(true);
    try {
      setLoadError(null);
      const result = await withTimeout((async () => {
        const [loadedSub, cfg, pt, segment, connection] = await Promise.all([
          getSubscription(),
          getAppSettings(),
          getDriverPlanType(),
          getDriverPlanSegment(),
          getMercadoPagoConnectionStatus().catch(() => null),
        ]);
        const s = loadedSub?.provider_subscription_id
          ? await syncSubscriptionStatus().catch(() => loadedSub)
          : loadedSub;
        return { s, cfg, pt, segment, connection, loadedSub };
      })(), 15000, 'A consulta demorou demais. Verifique sua conexão e toque em atualizar.');
      const { s, cfg, pt, segment, connection, loadedSub } = result;
      setSub(s);
      setSettings(cfg);
      setCurrentPlan(pt);
      setCurrentSegment(segment ?? (loadedSub?.plan_segment ?? 'economy'));
      setMpConnection(connection);
      hasLoaded.current = true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar seu plano. Tente novamente.');
    } finally {
      loadInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const connectMercadoPago = async () => {
    if (connectingMp) return;
    setConnectingMp(true);
    try {
      const url = await startMercadoPagoConnection();
      const result = await WebBrowser.openAuthSessionAsync(url, MERCADO_PAGO_APP_REDIRECT_URI, {
        showTitle: true,
        createTask: false,
      });
      const callback = result.type === 'success' ? mercadoPagoCallback(result.url) : null;
      const status = await getMercadoPagoConnectionStatus().catch(() => null);
      if (status) setMpConnection(status);
      await load();
      if (status?.connected) {
        Alert.alert('Mercado Pago conectado', 'Sua conta foi vinculada e está pronta para receber os repasses automáticos.');
      } else if (callback?.status === 'error') {
        Alert.alert('Não foi possível conectar', callback.message || 'A autorização falhou. Confira se o endereço de retorno OAuth do app no Mercado Pago está cadastrado exatamente como no servidor e tente novamente.');
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        Alert.alert('Conexão não concluída', 'O navegador foi fechado antes de confirmar a autorização. Você pode tentar novamente.');
      } else if (result.type === 'success') {
        Alert.alert('Autorização não confirmada', 'O retorno chegou, mas o servidor ainda não confirmou a conta. Confira a URL de retorno OAuth e tente novamente.');
      }
    } catch (error) {
      Alert.alert('Não foi possível conectar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setConnectingMp(false);
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
    load();
    const listener = AppState.addEventListener('change', (state) => {
      // Native alerts and payment sheets can briefly leave the active state.
      // Refresh silently on return so dismissing an alert never replaces the
      // whole screen with a blocking spinner.
      if (state === 'active' && hasLoaded.current) load();
    });
    return () => listener.remove();
  }, [load]);

  useEffect(() => {
    if (!pixCode || !pendingPlan || paymentConfirmed) return;
    return watchDriverSubscription((subscription) => {
      if (subscription) setSub(subscription);
      if (subscription?.status === 'active' && subscription.plan === pendingPlan
          && subscription.paid_at && subscription.paid_at !== checkoutBaselinePaidAt.current) {
        setCurrentPlan(pendingPlan);
        setCurrentSegment(subscription.plan_segment ?? currentSegment);
        setPaymentConfirmed(true);
      }
    });
  }, [pixCode, pendingPlan, paymentConfirmed, currentSegment]);

  const plans = buildPlans(settings, currentSegment);

  // ── Plan change ──────────────────────────────────────────────────────────────
  const handleSelectPlan = (plan: PlanType) => {
    if (plan === currentPlan) { Alert.alert('Plano atual', 'Você já está neste plano.'); return; }
    Alert.alert(
      'Trocar para ' + PLAN_LABELS[plan],
      plan === 'commission'
        ? 'Você passará a pagar comissão por corrida, sem mensalidade fixa. Acesso imediato.'
        : 'Você será encaminhado ao Mercado Pago para pagar com cartão ou Pix no plano ' + PLAN_LABELS[plan] + '. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => doSwitch(plan) },
      ],
    );
  };

  const doSwitch = async (plan: PlanType) => {
    setSwitching(true);
    setPendingPlan(plan);
    setPixCode(null);
    setPaymentConfirmed(false);
    try {
      const segment = currentSegment ?? 'economy';
      if (plan === 'commission') {
        await withTimeout(selectPlan(plan, segment), 15000, 'A atualização do plano demorou. Verifique a conexão e tente novamente.');
        setCurrentPlan(plan);
        Alert.alert('Plano atualizado!', 'Você está no plano Por Corrida. Acesso imediato.');
        setPendingPlan(null);
        load();
        return;
      }
      if (plan !== 'daily') {
        await withTimeout(selectPlan(plan, segment), 15000, 'A atualização do plano demorou. Verifique a conexão e tente novamente.');
        setCurrentPlan(plan);
      }
      const beforeCheckout = await getSubscription();
      checkoutBaselinePaidAt.current = beforeCheckout?.paid_at ?? null;
      const result = await withTimeout(createSubscriptionCheckout(plan, segment), 20000, 'O checkout demorou para responder. Seu plano continua pendente; atualize a tela ou tente novamente.');
      setPixCode(result.init_point);
      setPixAmount(result.amount);
    } catch (err: unknown) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Tente novamente.');
      setPendingPlan(null);
      load();
    } finally {
      setSwitching(false);
    }
  };

  const dismissPix = () => {
    setPixCode(null);
    setPendingPlan(null);
    setPaymentConfirmed(false);
    load();
  };

  // ── Status card helpers ──────────────────────────────────────────────────────
  const days    = daysUntil(sub?.due_date);
  const isOverdue  = days !== null && days < 0;
  const isDueSoon  = days !== null && days <= 3 && days >= 0;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={s.iconBtn}>
          <ChevronLeft size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Plano & Mensalidade</Text>
        <TouchableOpacity onPress={load} style={s.iconBtn}>
          <RefreshCw size={17} color="#999" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <View style={s.loadError}>
            <Text style={s.loadErrorText}>{loadError}</Text>
            <TouchableOpacity onPress={load} style={s.loadRetry}><Text style={s.loadRetryText}>Tentar novamente</Text></TouchableOpacity>
          </View>
        )}
        {/* ── Warning banner ── */}
        {(isOverdue || isDueSoon) && currentPlan !== 'commission' && (
          <View style={[s.banner, { backgroundColor: isOverdue ? '#FEE2E2' : '#FEF3C7', borderColor: isOverdue ? Colors.danger + '40' : Colors.warning + '40' }]}>
            <AlertCircle size={15} color={isOverdue ? Colors.danger : Colors.warning} />
            <Text style={[s.bannerTxt, { color: isOverdue ? Colors.danger : '#92400E' }]}>
              {isOverdue
                ? 'Mensalidade vencida. Regularize para continuar usando o app.'
                : ('Mensalidade vence em ' + days + (days !== 1 ? ' dias.' : ' dia.'))}
            </Text>
          </View>
        )}

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
                {mpConnection?.connected ? 'CONECTADO' : 'PENDENTE'}
              </Text>
            </View>
          </View>
          {mpConnection?.connected ? (
            <TouchableOpacity style={s.mpSecondaryBtn} onPress={disconnect} activeOpacity={0.8}>
              <Text style={s.mpSecondaryText}>Desconectar conta</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.mpButton} onPress={connectMercadoPago} disabled={connectingMp} activeOpacity={0.85}>
              {connectingMp ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Zap size={16} color="#FFFFFF" />}
              <Text style={s.mpButtonText}>{connectingMp ? 'Abrindo autorização…' : 'Conectar Mercado Pago'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── PIX panel (shown after switching to a fixed plan) ── */}
        {pixCode !== null && pendingPlan && (
          <View style={s.pixPanel}>
            <Text style={s.pixPanelTitle}>{paymentConfirmed ? 'Pagamento confirmado!' : 'Pagamento seguro'}</Text>
            <Text style={s.pixPanelSub}>
              {paymentConfirmed
                ? `Plano ${PLAN_LABELS[pendingPlan]} ativado. Seu acesso já foi atualizado.`
                : pendingPlan === 'daily'
                ? 'Pague uma única diária com Pix ou cartão. O Checkout Pro permite pagar sem entrar na conta Mercado Pago.'
                : `O Mercado Pago abrirá o checkout para pagar com Pix ou cartão no plano ${PLAN_LABELS[pendingPlan]}.`}
            </Text>

            <View style={s.pixAmountBox}>
              <Text style={s.pixAmountLabel}>{pendingPlan === 'daily' ? 'Valor da diária' : 'Valor a pagar'}</Text>
              <Text style={s.pixAmount}>{fmtBRL(pixAmount)}</Text>
            </View>

            {!paymentConfirmed && (
              <TouchableOpacity
                style={s.copyBtn}
                onPress={() => WebBrowser.openBrowserAsync(pixCode).catch(() => Alert.alert('Não foi possível abrir o pagamento', 'Verifique sua conexão e tente novamente.'))}
                activeOpacity={0.85}
              >
                <Text style={s.copyBtnTxt}>{pendingPlan === 'daily' ? 'Pagar diária com Pix ou cartão' : 'Abrir checkout do Mercado Pago'}</Text>
              </TouchableOpacity>
            )}

            <View style={s.pixNote}>
              <Text style={s.pixNoteTxt}>
                {paymentConfirmed
                  ? 'O webhook confirmou o pagamento e ativou seu plano.'
                  : pendingPlan === 'daily'
                  ? 'A diária começa após a confirmação e não renova automaticamente. Para trabalhar outro dia, faça uma nova compra.'
                  : 'A cobrança recorrente e a confirmação são processadas automaticamente pelo Mercado Pago. Não digite os dados do cartão no app.'}
              </Text>
            </View>

            <TouchableOpacity style={s.doneBtn} onPress={dismissPix} activeOpacity={0.85}>
              <Check size={15} color="#1A1A1A" strokeWidth={2.5} />
              <Text style={s.doneBtnTxt}>Voltar ao app</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Trocar plano ── */}
        {pixCode === null && (
          <>
            <Text style={s.sectionTitle}>
              {currentPlan ? 'Trocar plano' : 'Escolher plano'}
            </Text>

            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    s.planCard,
                    isCurrent && { borderColor: plan.accentColor, borderWidth: 2 },
                  ]}
                  onPress={() => handleSelectPlan(plan.id)}
                  disabled={switching}
                  activeOpacity={0.82}
                >
                  {/* Radio / check circle */}
                  <View style={[
                    s.radio,
                    isCurrent && { backgroundColor: plan.accentColor, borderColor: plan.accentColor },
                  ]}>
                    {isCurrent && <Check size={11} color="#fff" strokeWidth={3} />}
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
                      {isCurrent && (
                        <View style={[s.badge, { backgroundColor: '#1A1A1A' }]}>
                          <Text style={s.badgeTxt}>ATUAL</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.planDesc}>{plan.description}</Text>
                    <View style={s.priceRow}>
                      <Text style={[s.priceMain, isCurrent && { color: plan.accentColor }]}>
                        {plan.priceMain}
                      </Text>
                      <Text style={s.priceUnit}> / {plan.priceUnit}</Text>
                    </View>
                    {plan.priceStrike && (
                      <Text style={s.priceStrike}>{plan.priceStrike}</Text>
                    )}
                  </View>

                  {/* Spinner while switching to this plan */}
                  {switching && pendingPlan === plan.id && (
                    <ActivityIndicator size="small" color={plan.accentColor} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
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
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#F7F8FA',
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  topTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  bannerTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', lineHeight: 18 },

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

  // PIX panel
  pixPanel: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#E8E8E8',
    padding: 20, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  pixPanelTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 4 },
  pixPanelSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#888', marginBottom: 18 },
  pixAmountBox: { backgroundColor: '#F7F8FA', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 14 },
  pixAmountLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#999', marginBottom: 4 },
  pixAmount: { fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  pixCodeBox: { backgroundColor: '#F7F8FA', borderRadius: 12, padding: 14, marginBottom: 14 },
  pixCodeLabel: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#AAA', letterSpacing: 0.8, marginBottom: 8 },
  pixCode: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#444', lineHeight: 17, marginBottom: 12 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 12 },
  copyBtnTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' },
  pixNote: { backgroundColor: '#FFF9EC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F59E0B40', marginBottom: 16 },
  pixNoteTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 18 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14 },
  doneBtnTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },

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
  badgeTxt: { fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: 0.4 },
  planDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#888', marginBottom: 8, lineHeight: 17 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceMain: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  priceUnit: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#999' },
  priceStrike: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#BFBFBF', textDecorationLine: 'line-through', marginTop: 2 },
});

export default DriverSubscriptionScreen;
