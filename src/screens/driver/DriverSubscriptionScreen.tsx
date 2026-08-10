import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState,
  StatusBar, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, CheckCircle, AlertCircle, Clock, RefreshCw,
  Check, Calendar, Zap,
} from 'lucide-react-native';
import { Colors, Radius } from '../../constants';
import {
  getSubscription, getAppSettings, selectPlan, createSubscriptionCheckout, syncSubscriptionStatus,
  getDriverPlanType, type PlanType,
} from '../../services/payments';
import type { SubscriptionRow, AppSettings } from '../../types/db';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

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

function buildPlans(settings: AppSettings | null): PlanDef[] {
  const daily   = settings?.plan_daily_price   ?? settings?.subscription_daily_amount   ?? 10;
  const weekly  = settings?.plan_weekly_price  ?? (settings?.subscription_monthly_amount ?? 120) / 4;
  const monthly = settings?.subscription_monthly_amount ?? 120;
  const pct     = settings?.commission_pct ?? 15;

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

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  active:    { label: 'Ativo',    color: Colors.success, Icon: CheckCircle },
  expired:   { label: 'Vencido', color: Colors.danger,  Icon: AlertCircle },
  suspended: { label: 'Suspenso',color: Colors.warning,  Icon: Clock },
  inactive:  { label: 'Inativo', color: Colors.textMuted, Icon: AlertCircle },
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
  const [loading, setLoading]   = useState(true);

  // Plan-change flow
  const [pendingPlan, setPendingPlan]   = useState<PlanType | null>(null);
  const [switching, setSwitching]       = useState(false);
  const [pixCode, setPixCode]           = useState<string | null>(null);
  const [pixAmount, setPixAmount]       = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedSub, cfg, pt] = await Promise.all([
        getSubscription(),
        getAppSettings(),
        getDriverPlanType(),
      ]);
      const s = loadedSub?.provider_subscription_id
        ? await syncSubscriptionStatus().catch(() => loadedSub)
        : loadedSub;
      setSub(s);
      setSettings(cfg);
      setCurrentPlan(pt);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => listener.remove();
  }, [load]);

  const plans = buildPlans(settings);

  // ── Plan change ──────────────────────────────────────────────────────────────
  const handleSelectPlan = (plan: PlanType) => {
    if (plan === currentPlan) { Alert.alert('Plano atual', 'Você já está neste plano.'); return; }
    Alert.alert(
      'Trocar para ' + PLAN_LABELS[plan],
      plan === 'commission'
        ? 'Você passará a pagar comissão por corrida, sem mensalidade fixa. Acesso imediato.'
        : 'Você será encaminhado ao Mercado Pago para escolher cartão, Pix ou boleto no plano ' + PLAN_LABELS[plan] + '. Continuar?',
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
    try {
      await selectPlan(plan);
      setCurrentPlan(plan);
      if (plan === 'commission') {
        Alert.alert('Plano atualizado!', 'Você está no plano Por Corrida. Acesso imediato.');
        setPendingPlan(null);
        load();
        return;
      }
      const result = await createSubscriptionCheckout(plan);
      setPixCode(result.init_point);
      setPixAmount(result.amount);
    } catch (err: unknown) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Tente novamente.');
      setPendingPlan(null);
    } finally {
      setSwitching(false);
    }
  };

  const dismissPix = () => {
    setPixCode(null);
    setPendingPlan(null);
    load();
  };

  // ── Status card helpers ──────────────────────────────────────────────────────
  const stKey   = sub?.status ?? 'inactive';
  const stConf  = STATUS_CONFIG[stKey] ?? STATUS_CONFIG.inactive;
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
        {/* ── Status card ── */}
        <View style={[s.statusCard, isOverdue && { borderColor: Colors.danger + '60' }]}>
          {/* Row: plan + status pill */}
          <View style={s.statusTop}>
            <View>
              <Text style={s.statusLabel}>Plano atual</Text>
              <Text style={s.planName}>
                {currentPlan ? PLAN_LABELS[currentPlan] : '—'}
              </Text>
            </View>
            <View style={[s.statusPill, { backgroundColor: stConf.color + '18', borderColor: stConf.color + '44' }]}>
              <stConf.Icon size={13} color={stConf.color} />
              <Text style={[s.statusPillTxt, { color: stConf.color }]}>{stConf.label}</Text>
            </View>
          </View>

          {/* Amount + due date (hidden for commission plan) */}
          {currentPlan !== 'commission' && sub && (
            <>
              <Text style={s.amount}>
                {fmtBRL(sub.amount)}
                <Text style={s.amountUnit}> / {currentPlan ? PLAN_LABELS[currentPlan].toLowerCase() : '—'}</Text>
              </Text>
              <View style={s.dueRow}>
                <Calendar size={13} color="#999" />
                <Text style={s.dueTxt}>
                  Vencimento: {fmtDate(sub.due_date)}
                  {!isOverdue && days !== null && days <= 7 ? ('  ·  ' + days + 'd') : ''}
                  {isOverdue ? '  ·  VENCIDO' : ''}
                </Text>
              </View>
            </>
          )}

          {currentPlan === 'commission' && (
            <View style={s.commissionRow}>
              <Zap size={14} color="#6DC228" />
              <Text style={s.commissionTxt}>Sem mensalidade fixa — comissão descontada por corrida.</Text>
            </View>
          )}
        </View>

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

        {/* ── PIX panel (shown after switching to a fixed plan) ── */}
        {pixCode !== null && pendingPlan && (
          <View style={s.pixPanel}>
            <Text style={s.pixPanelTitle}>Pagamento seguro</Text>
            <Text style={s.pixPanelSub}>
              O Mercado Pago abre uma tela segura para escolher cartão, Pix ou boleto no plano {PLAN_LABELS[pendingPlan]}.
            </Text>

            <View style={s.pixAmountBox}>
              <Text style={s.pixAmountLabel}>Valor a pagar</Text>
              <Text style={s.pixAmount}>{fmtBRL(pixAmount)}</Text>
            </View>

            <TouchableOpacity style={s.copyBtn} onPress={() => Linking.openURL(pixCode)} activeOpacity={0.85}>
              <Text style={s.copyBtnTxt}>Abrir checkout do Mercado Pago</Text>
            </TouchableOpacity>

            <View style={s.pixNote}>
              <Text style={s.pixNoteTxt}>
                A cobrança recorrente e a confirmação são processadas automaticamente pelo Mercado Pago. Não digite os dados do cartão no app.
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
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#F7F8FA',
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  topTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  // Status card
  statusCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statusTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  statusLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#999', marginBottom: 2 },
  planName: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  statusPillTxt: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
  amount: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 8 },
  amountUnit: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#999' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dueTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888' },
  commissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commissionTxt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#555', flex: 1 },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  bannerTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', lineHeight: 18 },

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
