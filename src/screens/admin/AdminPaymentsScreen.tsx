import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Send,
  Filter,
} from 'lucide-react-native';
import { Card, Badge, Avatar } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

const PAYMENTS = [
  { id: '1', driver: 'Carlos Mendes', amount: 150, status: 'paid', date: '01/05/2026', method: 'PIX' },
  { id: '2', driver: 'Roberto Lima', amount: 150, status: 'paid', date: '03/05/2026', method: 'PIX' },
  { id: '3', driver: 'André Santos', amount: 150, status: 'pending', date: '—', method: '—' },
  { id: '4', driver: 'João Oliveira', amount: 150, status: 'overdue', date: '—', method: '—', daysLate: 15 },
  { id: '5', driver: 'Pedro Costa', amount: 150, status: 'overdue', date: '—', method: '—', daysLate: 32 },
  { id: '6', driver: 'Marcos Freitas', amount: 150, status: 'paid', date: '05/05/2026', method: 'PIX' },
];

const statusConfig = {
  paid: { label: 'Pago', variant: 'success' as const, icon: CheckCircle, color: Colors.success },
  pending: { label: 'Aguardando', variant: 'warning' as const, icon: Clock, color: Colors.warning },
  overdue: { label: 'Atrasado', variant: 'danger' as const, icon: AlertTriangle, color: Colors.danger },
};

interface AdminPaymentsScreenProps {
  onBack: () => void;
}

const AdminPaymentsScreen: React.FC<AdminPaymentsScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'overdue'>('all');

  const filtered = PAYMENTS.filter((p) => {
    if (activeTab === 'all') return true;
    return p.status === activeTab;
  });

  const totalReceived = PAYMENTS.filter((p) => p.status === 'paid').length * 150;
  const totalPending = PAYMENTS.filter((p) => p.status !== 'paid').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Mensalidades</Text>
        <TouchableOpacity style={styles.filterBtn}>
          <Filter size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Summary */}
        <LinearGradient colors={[Colors.pix, '#25a99c']} style={styles.summaryCard}>
          <View style={styles.pixIcon}>
            <Text style={styles.pixLabel}>PIX</Text>
          </View>
          <Text style={styles.summaryTitle}>Receita do mês</Text>
          <Text style={styles.summaryValue}>R$ {totalReceived.toLocaleString('pt-BR')},00</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <CheckCircle size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.summaryText}>{PAYMENTS.filter((p) => p.status === 'paid').length} pagamentos</Text>
            </View>
            <View style={styles.summaryItem}>
              <AlertTriangle size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.summaryText}>{totalPending} pendentes</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>R$ 150</Text>
            <Text style={styles.statLabel}>Valor/mês</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {PAYMENTS.filter((p) => p.status === 'paid').length}
            </Text>
            <Text style={styles.statLabel}>Pagos</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.danger }]}>
              {PAYMENTS.filter((p) => p.status === 'overdue').length}
            </Text>
            <Text style={styles.statLabel}>Atrasados</Text>
          </Card>
        </View>

        {/* PIX Key Info */}
        <Card style={styles.pixCard}>
          <Text style={styles.pixCardTitle}>Chave PIX da plataforma</Text>
          <View style={styles.pixKeyRow}>
            <Text style={styles.pixKey}>rottaurbana@pix.com.br</Text>
            <TouchableOpacity style={styles.copyBtn}>
              <Text style={styles.copyText}>Copiar</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.pixNote}>Motoristas devem usar esta chave para pagar a mensalidade</Text>
        </Card>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['all', 'pending', 'overdue'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'Todos' : tab === 'pending' ? 'Pendentes' : 'Atrasados'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Payments List */}
        {filtered.map((payment) => {
          const config = statusConfig[payment.status as keyof typeof statusConfig];
          const StatusIcon = config.icon;
          return (
            <Card key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <Avatar name={payment.driver} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentDriver}>{payment.driver}</Text>
                  <Text style={styles.paymentDate}>
                    {payment.status === 'paid' ? `Pago em ${payment.date}` : payment.daysLate ? `${payment.daysLate} dias em atraso` : 'Aguardando pagamento'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[styles.paymentAmount, { color: payment.status === 'paid' ? Colors.success : Colors.danger }]}>
                    R$ {payment.amount},00
                  </Text>
                  <Badge label={config.label} variant={config.variant} />
                </View>
              </View>

              {payment.status !== 'paid' && (
                <TouchableOpacity style={styles.sendReminderBtn}>
                  <Send size={14} color={Colors.primary} />
                  <Text style={styles.sendReminderText}>Enviar cobrança via WhatsApp</Text>
                </TouchableOpacity>
              )}
            </Card>
          );
        })}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  summaryCard: {
    borderRadius: Radius.xl, padding: 24, marginBottom: 16,
    shadowColor: Colors.pix, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  pixIcon: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.sm, alignSelf: 'flex-start', marginBottom: 12,
  },
  pixLabel: { fontWeight: '800', color: '#fff', letterSpacing: 2 },
  summaryTitle: { ...Typography.small, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  summaryValue: { fontSize: 36, fontWeight: '800', color: '#fff', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { ...Typography.small, color: 'rgba(255,255,255,0.8)' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, padding: 14, alignItems: 'center' },
  statValue: { ...Typography.h4, color: Colors.textPrimary },
  statLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  pixCard: { padding: 16, marginBottom: 16, borderColor: Colors.pix + '44', borderWidth: 1 },
  pixCardTitle: { ...Typography.smallMedium, color: Colors.textMuted, marginBottom: 8 },
  pixKeyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pixKey: { ...Typography.bodyMedium, color: Colors.pix },
  copyBtn: { backgroundColor: Colors.pix + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  copyText: { ...Typography.smallMedium, color: Colors.pix },
  pixNote: { ...Typography.caption, color: Colors.textMuted },
  tabs: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.md,
    padding: 4, marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { ...Typography.smallMedium, color: Colors.textMuted },
  tabTextActive: { color: Colors.white, fontWeight: '600' },
  paymentCard: { padding: 14, marginBottom: 10 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0 },
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
