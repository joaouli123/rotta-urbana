import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Clipboard,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle,
  Zap,
  Calendar,
  Clock,
  TrendingUp,
  Copy,
  ChevronRight,
} from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';
import {
  getAppSettings,
  selectPlan,
  buildPlanPix,
  type PlanType,
} from '../../services/payments';
import type { AppSettings } from '../../types/db';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanSelectionScreenProps {
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function fmtBRL(val: number): string {
  return val.toFixed(2).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Plan definitions (built once we have settings)
// ---------------------------------------------------------------------------

interface PlanDef {
  id: PlanType;
  title: string;
  subtitle: string;
  price: string;
  priceLabel: string;
  description: string;
  highlight: string;
  icon: React.ElementType;
  color: string;
  immediate: boolean;
}

function buildPlans(settings: AppSettings | null): PlanDef[] {
  return [
    {
      id: 'commission',
      title: 'Por Corrida',
      subtitle: 'Comissão %',
      price: `${settings?.commission_pct ?? 15}%`,
      priceLabel: 'de cada corrida',
      description: 'Sem mensalidade. Pague apenas quando trabalhar.',
      highlight: 'Acesso imediato',
      icon: TrendingUp,
      color: Colors.primary,
      immediate: true,
    },
    {
      id: 'daily',
      title: 'Diário',
      subtitle: 'Plano diário',
      price: `R$ ${fmtBRL(settings?.plan_daily_price ?? settings?.subscription_daily_amount ?? 10)}`,
      priceLabel: 'por dia',
      description: 'Pague hoje e trabalhe o dia todo.',
      highlight: 'Pague via PIX',
      icon: Zap,
      color: Colors.info,
      immediate: false,
    },
    {
      id: 'weekly',
      title: 'Semanal',
      subtitle: 'Plano semanal',
      price: `R$ ${fmtBRL(settings?.plan_weekly_price ?? (settings?.subscription_monthly_amount ?? 120) / 4)}`,
      priceLabel: 'por semana',
      description: 'A melhor relação custo-benefício para trabalhar toda semana.',
      highlight: 'Pague via PIX',
      icon: Clock,
      color: Colors.warning,
      immediate: false,
    },
    {
      id: 'monthly',
      title: 'Mensal',
      subtitle: 'Plano mensal',
      price: `R$ ${fmtBRL(settings?.subscription_monthly_amount ?? 120)}`,
      priceLabel: 'por mês',
      description: 'Para motoristas dedicados. Maior economia no longo prazo.',
      highlight: 'Pague via PIX',
      icon: Calendar,
      color: '#7C3AED',
      immediate: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PlanSelectionScreen: React.FC<PlanSelectionScreenProps> = ({ onDone }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixAmount, setPixAmount] = useState(0);

  // Load app settings on mount
  useEffect(() => {
    (async () => {
      try {
        const cfg = await getAppSettings();
        setSettings(cfg);
      } catch {
        // non-fatal — defaults will be used
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const plans = buildPlans(settings);
  const selectedPlan = plans.find((p) => p.id === selected) ?? null;

  // -------------------------------------------------------------------------
  // Confirm handler
  // -------------------------------------------------------------------------

  const handleConfirm = async () => {
    if (!selected) {
      Alert.alert('Escolha um plano', 'Por favor, selecione um plano antes de continuar.');
      return;
    }

    setSubmitting(true);
    try {
      await selectPlan(selected);

      if (selected === 'commission') {
        onDone();
        return;
      }

      // Fixed plan — generate PIX
      const result = await buildPlanPix(selected);
      setPixCode(result.code);
      setPixAmount(result.amount);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.';
      Alert.alert('Erro', message);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Copy PIX code to clipboard
  // -------------------------------------------------------------------------

  const handleCopyPix = () => {
    if (!pixCode) return;
    Clipboard.setString(pixCode);
    Alert.alert('Copiado!', 'Código PIX copiado para a área de transferência.');
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Carregando planos...</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>Bem-vindo à</Text>
          <Text style={styles.headerTitle}>ROTTA URBANA</Text>
          <Text style={styles.headerSubtitle}>Escolha como quer trabalhar</Text>
          <View style={styles.divider} />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Plan cards                                                        */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.cardsSection}>
          {plans.map((plan) => {
            const isSelected = selected === plan.id;
            const IconComp = plan.icon;

            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.card,
                  isSelected && { borderColor: plan.color, borderWidth: 2 },
                ]}
                onPress={() => setSelected(plan.id)}
                activeOpacity={0.85}
                disabled={submitting}
              >
                {/* Selection check */}
                {isSelected && (
                  <View style={styles.cardCheckIcon}>
                    <CheckCircle size={22} color={plan.color} />
                  </View>
                )}

                {/* Left accent bar */}
                <View style={[styles.accentBar, { backgroundColor: plan.color }]} />

                {/* Card body */}
                <View style={styles.cardBody}>
                  {/* Icon + title row */}
                  <View style={styles.cardTitleRow}>
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: plan.color + '1A' },
                      ]}
                    >
                      <IconComp size={20} color={plan.color} />
                    </View>
                    <View style={styles.cardTitleTexts}>
                      <Text style={styles.cardTitle}>{plan.title}</Text>
                      <Text style={styles.cardSubtitle}>{plan.subtitle}</Text>
                    </View>
                  </View>

                  {/* Price */}
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceText, { color: plan.color }]}>
                      {plan.price}
                    </Text>
                    <Text style={styles.priceLabel}> / {plan.priceLabel}</Text>
                  </View>

                  {/* Description */}
                  <Text style={styles.cardDescription}>{plan.description}</Text>

                  {/* Highlight badge */}
                  <View
                    style={[
                      styles.highlightBadge,
                      { backgroundColor: plan.color + '1A' },
                    ]}
                  >
                    <Text style={[styles.highlightText, { color: plan.color }]}>
                      {plan.highlight}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Confirm button                                                    */}
        {/* ---------------------------------------------------------------- */}
        <TouchableOpacity
          style={[
            styles.confirmButton,
            (!selected || submitting) && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selected || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#000000" size="small" />
          ) : (
            <>
              <Text style={styles.confirmButtonText}>
                {selectedPlan
                  ? `Confirmar — ${selectedPlan.title}`
                  : 'Selecione um plano'}
              </Text>
              {selected && <ChevronRight size={18} color="#000000" />}
            </>
          )}
        </TouchableOpacity>

        {/* ---------------------------------------------------------------- */}
        {/* PIX section (shown only after a fixed plan is confirmed)          */}
        {/* ---------------------------------------------------------------- */}
        {pixCode !== null && (
          <View style={styles.pixSection}>
            {/* Header */}
            <View style={styles.pixHeader}>
              <CheckCircle size={22} color={Colors.primary} />
              <Text style={styles.pixHeaderText}>PIX gerado com sucesso!</Text>
            </View>

            {/* Amount */}
            <Text style={styles.pixAmount}>
              R$ {fmtBRL(pixAmount)}
            </Text>

            {/* Code box */}
            <View style={styles.pixCodeBox}>
              <Text style={styles.pixCodeLabel}>Código PIX — copia e cola</Text>
              <Text style={styles.pixCode} selectable numberOfLines={4}>
                {pixCode}
              </Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyPix}
                activeOpacity={0.8}
              >
                <Copy size={15} color="#000000" />
                <Text style={styles.copyButtonText}>Copiar código PIX</Text>
              </TouchableOpacity>
            </View>

            {/* Instructions */}
            <View style={styles.pixInstructions}>
              <Text style={styles.pixInstructionsTitle}>Como pagar:</Text>
              <Text style={styles.pixInstructionsText}>
                {'1. Copie o código PIX\n2. Abra seu banco e pague\n3. Aguarde a confirmação (pode levar alguns minutos)'}
              </Text>
            </View>

            {/* Warning note */}
            <View style={styles.pixNote}>
              <Text style={styles.pixNoteText}>
                Seu acesso será liberado após confirmação do pagamento pelo administrador.
              </Text>
            </View>

            {/* Continue button */}
            <TouchableOpacity
              style={styles.continueButton}
              onPress={onDone}
              activeOpacity={0.85}
            >
              <CheckCircle size={18} color="#000000" />
              <Text style={styles.continueButtonText}>Já paguei — Continuar</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
  },

  // ---------- Header ----------
  header: {
    marginBottom: 28,
  },
  headerEyebrow: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  // ---------- Cards ----------
  cardsSection: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  cardCheckIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitleTexts: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  priceText: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
  },
  priceLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted,
  },
  cardDescription: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  highlightBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  highlightText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },

  // ---------- Confirm button ----------
  confirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  confirmButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  confirmButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    color: '#000000',
  },

  // ---------- PIX section ----------
  pixSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    padding: 20,
    marginBottom: 24,
    // Shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  pixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pixHeaderText: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    color: Colors.primary,
  },
  pixAmount: {
    fontSize: 28,
    fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  pixCodeBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  pixCodeLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pixCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.textPrimary,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    lineHeight: 16,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
    color: '#000000',
  },
  pixInstructions: {
    marginBottom: 14,
  },
  pixInstructionsTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  pixInstructionsText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  pixNote: {
    backgroundColor: Colors.warning + '1A',
    borderRadius: Radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    marginBottom: 16,
  },
  pixNoteText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: '#92400E',
    lineHeight: 18,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  continueButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    color: '#000000',
  },

  // ---------- Bottom spacer ----------
  bottomSpacer: {
    height: 40,
  },
});

export default PlanSelectionScreen;
