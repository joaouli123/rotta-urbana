import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Alert, Linking, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, CheckCircle, Clock, AlertTriangle, Send, Copy,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getAdminPayments, type AdminPayment } from '../../services/admin';
import { getAppSettings } from '../../services/payments';
import type { AppSettings } from '../../types/db';

const fmtMoney = (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted'; color: string }> = {
  approved:  { label: 'Pago',        variant: 'success', color: Colors.success },
  pending:   { label: 'Aguardando',  variant: 'warning', color: Colors.warning },
  rejected:  { label: 'Rejeitado',   variant: 'danger',  color: Colors.danger },
  cancelled: { label: 'Cancelado',   variant: 'muted',   color: Colors.textMuted },
  refunded:  { label: 'Reembolsado', variant: 'muted',   color: Colors.info },
};

interface AdminPaymentsScreenProps {
  onBack: () => void;
}

const AdminPaymentsScreen: React.FC<AdminPaymentsScreenProps> = ({ onBack }) => {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'pending'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pays, cfg] = await Promise.all([getAdminPayments(200), getAppSettings().catch(() => null)]);
      setPayments(pays);
      setSettings(cfg);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => payments.filter((p) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'approved') return p.status === 'approved';
    return p.status === 'pending';
  }), [payments, activeTab]);

  const approved = payments.filter((p) => p.status === 'approved');
  const totalReceived = approved.reduce((s, p) => s + Number(p.amount), 0);
  const pendingCount = payments.filter((p) => p.status === 'pending').length;
  const overdueCount = payments.filter((p) => p.subscription_status === 'expired').length;

  const pixKey = settings?.platform_pix_key ?? '—';

  const copyPix = async () => {
    if (!settings?.platform_pix_key) return;
    try {
      await Share.share({ message: settings.platform_pix_key });
    } catch { /* user dismissed */ }
  };

  const sendReminder = (p: AdminPayment) => {
    const phone = (p.driver_phone ?? '').replace(/\D/g, '');
    if (!phone) { Alert.alert('Sem telefone', 'Este motorista não tem telefone cadastrado.'); return; }
    const full = phone.startsWith('55') ? phone : `55${phone}`;
    const amount = fmtMoney(Number(p.amount));
    const msg = encodeURIComponent(
      `Olá ${p.driver_name ?? ''}! Sua mensalidade Rotta Urbana de ${amount} está pendente. ` +
      `Pague via PIX na chave: ${pixKey}. Obrigado!`
    );
    Linking.openURL(`https://wa.me/${full}?text=${msg}`).catch(() =>
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Mensalidades</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
      >
        {loading && payments.length === 0 ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : (
        <>
        {/* Summary */}
        <LinearGradient colors={[Colors.pix, '#25a99c']} style={styles.summaryCard}>
          <View style={styles.pixIcon}><Text style={styles.pixLabel}>PIX</Text></View>
          <Text style={styles.summaryTitle}>Receita recebida</Text>
          <Text style={styles.summaryValue}>{fmtMoney(totalReceived)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <CheckCircle size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.summaryText}>{approved.length} pagamentos</Text>
            </View>
            <View style={styles.summaryItem}>
              <AlertTriangle size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.summaryText}>{pendingCount} pendentes</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{approved.length}</Text>
            <Text style={styles.statLabel}>Pagos</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pendentes</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.danger }]}>{overdueCount}</Text>
            <Text style={styles.statLabel}>Inadimplentes</Text>
          </Card>
        </View>

        {/* PIX Key Info */}
        <Card style={styles.pixCard}>
          <Text style={styles.pixCardTitle}>Chave PIX da plataforma</Text>
          <View style={styles.pixKeyRow}>
            <Text style={styles.pixKey} numberOfLines={1}>{pixKey}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyPix}>
              <Copy size={13} color={Colors.pix} />
              <Text style={styles.copyText}>Copiar</Text>
            </TouchableOpacity>
            {/* opens the native share sheet (includes Copy) — no clipboard native module needed */}
          </View>
          <Text style={styles.pixNote}>Motoristas devem usar esta chave para pagar a mensalidade</Text>
        </Card>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['all', 'approved', 'pending'] as const).map((tab) => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'Todos' : tab === 'approved' ? 'Pagos' : 'Pendentes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Payments List */}
        {filtered.length === 0 && <Text style={styles.emptyTxt}>Nenhum pagamento encontrado</Text>}
        {filtered.map((payment) => {
          const config = statusConfig[payment.status] ?? statusConfig.pending;
          return (
            <Card key={payment.payment_id} style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <Avatar name={payment.driver_name ?? 'Motorista'} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentDriver}>{payment.driver_name ?? 'Motorista'}</Text>
                  <Text style={styles.paymentDate}>
                    {payment.status === 'approved' && payment.paid_at
                      ? `Pago em ${fmtDate(payment.paid_at)}`
                      : `Criado em ${fmtDate(payment.created_at)}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[styles.paymentAmount, { color: config.color }]}>{fmtMoney(Number(payment.amount))}</Text>
                  <Badge label={config.label} variant={config.variant} />
                </View>
              </View>

              {payment.status !== 'approved' && (
                <TouchableOpacity style={styles.sendReminderBtn} onPress={() => sendReminder(payment)}>
                  <Send size={14} color={Colors.primary} />
                  <Text style={styles.sendReminderText}>Enviar cobrança via WhatsApp</Text>
                </TouchableOpacity>
              )}
            </Card>
          );
        })}
        </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  summaryCard: {
    borderRadius: Radius.xl, padding: 24, marginBottom: 16,
    shadowColor: Colors.pix, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  pixIcon: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, alignSelf: 'flex-start', marginBottom: 12 },
  pixLabel: { fontWeight: '800', color: '#fff', letterSpacing: 2 },
  summaryTitle: { ...Typography.small, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  summaryValue: { fontSize: 34, fontFamily: 'Poppins_700Bold', color: '#fff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { ...Typography.small, color: 'rgba(255,255,255,0.85)' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, padding: 14, alignItems: 'center' },
  statValue: { ...Typography.h4, color: Colors.textPrimary },
  statLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  pixCard: { padding: 16, marginBottom: 16, borderColor: Colors.pix + '44', borderWidth: 1 },
  pixCardTitle: { ...Typography.smallMedium, color: Colors.textMuted, marginBottom: 8 },
  pixKeyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  pixKey: { ...Typography.bodyMedium, color: Colors.pix, flex: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.pix + '22', paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.sm },
  copyText: { ...Typography.smallMedium, color: Colors.pix },
  pixNote: { ...Typography.caption, color: Colors.textMuted },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.dark },
  tabText: { ...Typography.smallMedium, color: Colors.textMuted },
  tabTextActive: { color: '#fff', fontFamily: 'Poppins_600SemiBold' },
  emptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center', paddingVertical: 30 },
  paymentCard: { padding: 14, marginBottom: 10 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentDriver: { ...Typography.bodyMedium, color: Colors.textPrimary },
  paymentDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  paymentAmount: { ...Typography.h5, fontWeight: '700' },
  sendReminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: Colors.primary + '11', borderWidth: 1, borderColor: Colors.primary + '33',
  },
  sendReminderText: { ...Typography.smallMedium, color: Colors.primary },
});

export default AdminPaymentsScreen;
