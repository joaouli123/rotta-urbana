import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar, Dimensions, Linking,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { Colors } from '../../constants';
import {
  getAppSettings, selectPlan, createSubscriptionCheckout, type PlanType,
} from '../../services/payments';
import type { AppSettings } from '../../types/db';

const { width: W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(val: number): string {
  return val.toFixed(2).replace('.', ',');
}

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
}

function buildPlans(settings: AppSettings | null): PlanDef[] {
  const daily   = settings?.plan_daily_price   ?? settings?.subscription_daily_amount   ?? 10;
  const weekly  = settings?.plan_weekly_price  ?? (settings?.subscription_monthly_amount ?? 120) / 4;
  const monthly = settings?.subscription_monthly_amount ?? 120;
  const pct     = settings?.commission_pct ?? 15;

  return [
    {
      id: 'commission',
      title: 'Por Corrida',
      description: 'Sem mensalidade fixa. Pague uma comissão só quando trabalhar.',
      priceMain: pct + '%',
      priceUnit: 'de comissao por corrida',
      badge: 'ACESSO IMEDIATO',
      badgeColor: '#6DC228',
      accentColor: '#6DC228',
      immediate: true,
    },
    {
      id: 'daily',
      title: 'Diário',
      description: 'Pague hoje e trabalhe o dia todo sem limites.',
      priceMain: 'R$ ' + fmtBRL(daily),
      priceUnit: 'por dia',
      badgeColor: '#3B82F6',
      accentColor: '#3B82F6',
      immediate: false,
    },
    {
      id: 'weekly',
      title: 'Semanal',
      description: 'Melhor custo-benefício para quem trabalha toda semana.',
      priceMain: 'R$ ' + fmtBRL(weekly),
      priceUnit: 'por semana',
      priceStrike: 'R$ ' + fmtBRL(daily * 7) + '/semana',
      badge: 'MAIS POPULAR',
      badgeColor: '#7C3AED',
      accentColor: '#7C3AED',
      immediate: false,
    },
    {
      id: 'monthly',
      title: 'Mensal',
      description: 'Para motoristas dedicados. Maior economia no mês.',
      priceMain: 'R$ ' + fmtBRL(monthly),
      priceUnit: 'por mes',
      priceStrike: 'R$ ' + fmtBRL(weekly * 4) + '/mes',
      badge: 'MAIOR ECONOMIA',
      badgeColor: '#F59E0B',
      accentColor: '#F59E0B',
      immediate: false,
    },
  ];
}

// ── PlanCard ──────────────────────────────────────────────────────────────────
interface PlanCardProps {
  plan: PlanDef;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, selected, onPress, disabled }) => (
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
        {plan.badge && (
          <View style={[pc.badge, { backgroundColor: plan.badgeColor }]}>
            <Text style={pc.badgeTxt}>{plan.badge}</Text>
          </View>
        )}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
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

// ── PIX panel ─────────────────────────────────────────────────────────────────
interface PixPanelProps {
  code: string;
  amount: number;
  onDone: () => void;
}

const PixPanel: React.FC<PixPanelProps> = ({ code, amount, onDone }) => (
  <View style={px.panel}>
    <Text style={px.title}>Pagamento seguro</Text>
    <Text style={px.sub}>O Mercado Pago abre uma tela segura para pagar com cartão ou Pix.</Text>

    <View style={px.amountBox}>
      <Text style={px.amountLabel}>Valor da recorrência</Text>
      <Text style={px.amount}>R$ {fmtBRL(amount)}</Text>
    </View>

    <TouchableOpacity style={px.copyBtn} onPress={() => Linking.openURL(code)} activeOpacity={0.85}>
      <Text style={px.copyBtnTxt}>Abrir checkout do Mercado Pago</Text>
    </TouchableOpacity>

    <View style={px.note}>
      <Text style={px.noteTxt}>
        A cobrança recorrente e a confirmação são processadas automaticamente pelo Mercado Pago. Não digite os dados do cartão no app.
      </Text>
    </View>

    <TouchableOpacity style={px.doneBtn} onPress={onDone} activeOpacity={0.85}>
      <Check size={16} color="#1A1A1A" strokeWidth={2.5} />
      <Text style={px.doneBtnTxt}>Voltar ao app</Text>
    </TouchableOpacity>
  </View>
);

const px = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  title: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 4 },
  sub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#888', marginBottom: 20 },
  amountBox: {
    backgroundColor: '#F7F8FA', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 16,
  },
  amountLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#999', marginBottom: 4 },
  amount: { fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
  codeBox: { backgroundColor: '#F7F8FA', borderRadius: 12, padding: 14, marginBottom: 14 },
  codeLabel: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#AAA',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  code: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#444',
    lineHeight: 17, marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 12,
  },
  copyBtnTxt: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#fff' },
  note: {
    backgroundColor: '#FFF9EC', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#F59E0B40', marginBottom: 16,
  },
  noteTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#92400E', lineHeight: 18 },
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
  },
  doneBtnTxt: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
interface PlanSelectionScreenProps {
  onDone: () => void;
}

const PlanSelectionScreen: React.FC<PlanSelectionScreenProps> = ({ onDone }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixAmount, setPixAmount] = useState(0);

  useEffect(() => {
    getAppSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const plans = buildPlans(settings);

  const handleConfirm = async () => {
    if (!selected) { Alert.alert('Escolha um plano', 'Selecione uma opção antes de continuar.'); return; }
    setSubmitting(true);
    try {
      await selectPlan(selected);
      if (selected === 'commission') { onDone(); return; }
      const result = await createSubscriptionCheckout(selected);
      setPixCode(result.init_point);
      setPixAmount(result.amount);
    } catch (err: unknown) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FA" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>Rotta Urbana</Text>
          <Text style={s.title}>Escolha seu plano</Text>
          <Text style={s.subtitle}>
            Selecione como quer trabalhar. Você pode trocar depois.
          </Text>
        </View>

        {/* Plan cards */}
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selected === plan.id}
            onPress={() => { setSelected(plan.id); setPixCode(null); }}
            disabled={submitting}
          />
        ))}

        {/* PIX panel (only shown after confirming a fixed plan) */}
        {pixCode !== null && (
          <PixPanel code={pixCode} amount={pixAmount} onDone={onDone} />
        )}

        {/* CTA button */}
        {pixCode === null && (
          <TouchableOpacity
            style={[s.btn, (!selected || submitting) && s.btnDisabled]}
            onPress={handleConfirm}
            disabled={!selected || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>
                  {selected
                    ? ('Continuar com ' + (plans.find(p => p.id === selected)?.title ?? ''))
                    : 'Selecione um plano'}
                </Text>
            }
          </TouchableOpacity>
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

  btn: {
    backgroundColor: '#1A1A1A', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 14, marginTop: 6,
  },
  btnDisabled: { backgroundColor: '#D1D5DB' },
  btnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#ffffff' },
});

export default PlanSelectionScreen;
