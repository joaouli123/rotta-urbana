import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, Share, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, CreditCard, CheckCircle, AlertCircle, Clock,
  Copy, RefreshCw, Calendar, DollarSign, ExternalLink, ShieldCheck,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Typography } from '../../constants';
import {
  getSubscription, getPayments, buildSubscriptionPix, getAppSettings, setSubscriptionPlan,
} from '../../services/payments';
import type { SubscriptionRow, PaymentRow, AppSettings } from '../../types/db';

interface DriverSubscriptionScreenProps {
  onBack: () => void;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPrice(val?: number): string {
  if (!val) return '—';
  return `R$ ${Number(val).toFixed(2).replace('.', ',')}`;
}
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:    { label: 'Ativa',    color: Colors.success,   icon: <CheckCircle size={16} color={Colors.success} /> },
  expired:   { label: 'Vencida',  color: Colors.danger,    icon: <AlertCircle size={16} color={Colors.danger} /> },
  suspended: { label: 'Suspensa', color: Colors.warning,   icon: <Clock size={16} color={Colors.warning} /> },
  inactive:  { label: 'Inativa',  color: Colors.textMuted, icon: <AlertCircle size={16} color={Colors.textMuted} /> },
};

const PAY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  approved:  { label: 'Aprovado',  color: Colors.success },
  pending:   { label: 'Pendente',  color: Colors.warning },
  rejected:  { label: 'Rejeitado', color: Colors.danger },
  refunded:  { label: 'Reembolso', color: Colors.info },
  cancelled: { label: 'Cancelado', color: Colors.textMuted },
};

const DriverSubscriptionScreen: React.FC<DriverSubscriptionScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixAmount, setPixAmount] = useState(0);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, cfg] = await Promise.all([
        getSubscription(),
        getPayments(20),
        getAppSettings(),
      ]);
      setSub(s);
      setPayments(p);
      setSettings(cfg);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGeneratePix = async () => {
    setGeneratingPix(true);
    try {
      const res = await buildSubscriptionPix();
      if (!res) { Alert.alert('Erro', 'Não foi possível gerar o PIX.'); return; }
      setPixCode(res.code);
      setPixAmount(res.amount);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Erro ao gerar PIX');
    } finally {
      setGeneratingPix(false);
    }
  };

  const copyPix = async () => {
    if (!pixCode) return;
    try {
      await Share.share({ message: pixCode });
    } catch { /* user dismissed */ }
  };

  // Subscription is paid OUTSIDE the app (external web portal) to stay clear of
  // the stores' in-app subscription rules.
  const openPortal = () => {
    const url = settings?.subscription_portal_url;
    if (!url) { Alert.alert('Portal indisponível', 'O portal de pagamento ainda não foi configurado. Use o PIX abaixo ou fale com o suporte.'); return; }
    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o portal de pagamento.'));
  };

  const handleChangePlan = (plan: 'daily' | 'monthly') => {
    Alert.alert(
      'Trocar plano',
      `Deseja mudar para o plano ${plan === 'daily' ? 'diário' : 'mensal'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: async () => {
          setChangingPlan(true);
          try {
            const updated = await setSubscriptionPlan(plan);
            setSub(updated);
            Alert.alert('Plano atualizado!', `Agora você está no plano ${plan === 'daily' ? 'diário' : 'mensal'}.`);
          } catch (e: any) {
            Alert.alert('Erro', e?.message ?? 'Erro ao trocar plano');
          } finally {
            setChangingPlan(false);
          }
        }},
      ]
    );
  };

  const stConfig = sub ? (STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.inactive) : STATUS_CONFIG.inactive;
  const days = daysUntil(sub?.due_date);
  const isOverdue = days !== null && days < 0;
  const isDueSoon = days !== null && days <= 3 && days >= 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Mensalidade</Text>
        <TouchableOpacity onPress={load} style={styles.backBtn}>
          <RefreshCw size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Status card */}
          <LinearGradient
            colors={isOverdue ? [Colors.danger, Colors.dangerLight] : [Colors.darkElevated, Colors.dark]}
            style={styles.statusCard}
          >
            <View style={styles.statusTop}>
              <View style={styles.statusPill}>
                {stConfig.icon}
                <Text style={[styles.statusPillTxt, { color: stConfig.color }]}>{stConfig.label}</Text>
              </View>
              <Text style={styles.planTxt}>
                Plano {sub?.status ? (settings?.default_plan === 'daily' ? 'diário' : 'mensal') : '—'}
              </Text>
            </View>

            <Text style={styles.amountLarge}>{fmtPrice(sub?.amount)}</Text>
            <Text style={styles.amountSub}>valor da assinatura</Text>

            <View style={styles.dueDateRow}>
              <Calendar size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.dueDateTxt}>
                Próximo vencimento: {fmtDate(sub?.due_date)}
                {days !== null && !isOverdue && days <= 7 ? ` (em ${days} dia${days !== 1 ? 's' : ''})` : ''}
                {isOverdue ? ' (VENCIDA)' : ''}
              </Text>
            </View>

            {sub?.paid_at && (
              <Text style={styles.paidAtTxt}>Último pagamento: {fmtDate(sub.paid_at)}</Text>
            )}
          </LinearGradient>

          {/* Warning banner */}
          {(isOverdue || isDueSoon) && (
            <View style={[styles.warningBanner, { backgroundColor: isOverdue ? Colors.danger + '15' : Colors.warning + '15', borderColor: isOverdue ? Colors.danger + '35' : Colors.warning + '35' }]}>
              <AlertCircle size={16} color={isOverdue ? Colors.danger : Colors.warning} />
              <Text style={[styles.warningTxt, { color: isOverdue ? Colors.danger : Colors.warning }]}>
                {isOverdue ? 'Sua mensalidade está vencida. Regularize para continuar usando o app.' : `Mensalidade vence em ${days} dia${days !== 1 ? 's' : ''}.`}
              </Text>
            </View>
          )}

          {/* Plan options */}
          {settings && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Planos disponíveis</Text>
              <View style={styles.plansRow}>
                {([
                  { plan: 'daily' as const, label: 'Diário', amount: settings.subscription_daily_amount, sub: 'Pague por dia trabalhado' },
                  { plan: 'monthly' as const, label: 'Mensal', amount: settings.subscription_monthly_amount, sub: 'Economia de longo prazo' },
                ] as const).map(p => (
                  <TouchableOpacity
                    key={p.plan}
                    style={[styles.planCard, settings.default_plan === p.plan && styles.planCardActive]}
                    onPress={() => handleChangePlan(p.plan)}
                    disabled={changingPlan}
                    activeOpacity={0.8}
                  >
                    {settings.default_plan === p.plan && (
                      <View style={styles.activePlanBadge}><Text style={styles.activePlanTxt}>Atual</Text></View>
                    )}
                    <Text style={styles.planLabel}>{p.label}</Text>
                    <Text style={styles.planAmount}>{fmtPrice(p.amount)}</Text>
                    <Text style={styles.planSub}>{p.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Pagar mensalidade */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pagar mensalidade</Text>

            {settings?.subscription_portal_url ? (
              <>
                <TouchableOpacity style={styles.pixBtn} onPress={openPortal} activeOpacity={0.85}>
                  <ExternalLink size={18} color="#000" />
                  <Text style={styles.pixBtnTxt}>Pagar no portal seguro</Text>
                </TouchableOpacity>
                <View style={styles.portalNote}>
                  <ShieldCheck size={13} color={Colors.textMuted} />
                  <Text style={styles.portalNoteTxt}>Você será levado ao ambiente de pagamento no navegador.</Text>
                </View>
              </>
            ) : (
              // Fallback enquanto o portal não está configurado: PIX copia-e-cola
              !pixCode ? (
                <TouchableOpacity style={styles.pixBtn} onPress={handleGeneratePix} disabled={generatingPix} activeOpacity={0.85}>
                  {generatingPix
                    ? <ActivityIndicator color="#000" size="small" />
                    : <><DollarSign size={18} color="#000" /><Text style={styles.pixBtnTxt}>Gerar código PIX</Text></>
                  }
                </TouchableOpacity>
              ) : (
                <View style={styles.pixCodeBox}>
                  <Text style={styles.pixCodeLabel}>Código PIX copia-e-cola — {fmtPrice(pixAmount)}</Text>
                  <Text style={styles.pixCode} numberOfLines={3} selectable>{pixCode}</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={copyPix} activeOpacity={0.8}>
                    <Copy size={15} color="#000" />
                    <Text style={styles.copyTxt}>Copiar / compartilhar</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>

          {/* Payment history */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Histórico de pagamentos</Text>
            {payments.length === 0 ? (
              <Text style={styles.emptyTxt}>Nenhum pagamento registrado</Text>
            ) : (
              payments.map(p => {
                const pConf = PAY_STATUS_CONFIG[p.status] ?? PAY_STATUS_CONFIG.pending;
                return (
                  <View key={p.id} style={styles.payRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payAmount}>{fmtPrice(p.amount)}</Text>
                      <Text style={styles.payDate}>{fmtDate(p.created_at)}</Text>
                    </View>
                    <View style={[styles.payStatusPill, { backgroundColor: pConf.color + '18', borderColor: pConf.color + '40' }]}>
                      <Text style={[styles.payStatusTxt, { color: pConf.color }]}>{pConf.label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  content: { paddingHorizontal: 16 },

  statusCard: { borderRadius: Radius.xl, padding: 24, marginBottom: 14 },
  statusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  statusPillTxt: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  planTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.55)' },
  amountLarge: { fontSize: 36, fontFamily: 'Poppins_700Bold', color: '#fff', marginBottom: 2 },
  amountSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.5)', marginBottom: 14 },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dueDateTxt: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.7)' },
  paidAtTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.45)', marginTop: 6 },

  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Radius.md, padding: 14, borderWidth: 1, marginBottom: 14,
  },
  warningTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold' },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },

  plansRow: { flexDirection: 'row', gap: 10 },
  planCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 16,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  activePlanBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 8 },
  activePlanTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#000' },
  planLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 4 },
  planAmount: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 4 },
  planSub: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'center' },

  pixBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16,
  },
  pixBtnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#000' },
  portalNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 10 },
  portalNoteTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  pixCodeBox: {
    backgroundColor: Colors.card, borderRadius: Radius.md, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  pixCodeLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted, marginBottom: 10 },
  pixCode: {
    fontSize: 11, fontFamily: 'monospace', color: Colors.textPrimary,
    backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 10,
    marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12,
  },
  copyTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#000' },

  payRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  payAmount: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  payDate: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  payStatusPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1,
  },
  payStatusTxt: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
  emptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
});

export default DriverSubscriptionScreen;
