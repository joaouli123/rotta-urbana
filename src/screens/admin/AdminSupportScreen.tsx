import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import { ArrowLeft, ChevronDown, ChevronUp, Check, Clock, AlertCircle } from 'lucide-react-native';
import { Colors, Radius } from '../../constants';

// ── Mock Tickets ──────────────────────────────────────────────
const MOCK_TICKETS = [
  {
    id: 'T001', user: 'Ana Lima',       topic: 'Cobranca incorreta',     rideDate: 'Hoje, 14:32',
    status: 'aberto' as const,
    comment: 'A corrida foi cobrada duas vezes no cartao de credito. O valor de R$14,00 apareceu duplicado na fatura.',
    photo: null,
  },
  {
    id: 'T002', user: 'Pedro Santos',   topic: 'Motorista nao chegou',   rideDate: 'Ontem, 09:10',
    status: 'em_analise' as const,
    comment: 'Aguardei 15 minutos no local indicado e o motorista nao apareceu. A corrida foi cobrada mesmo assim.',
    photo: null,
  },
  {
    id: 'T003', user: 'Maria Souza',    topic: 'Objeto perdido',         rideDate: '10/06, 18:45',
    status: 'resolvido' as const,
    comment: 'Esqueci minha bolsa no banco traseiro. A bolsa e preta com detalhes dourados.',
    photo: null,
  },
  {
    id: 'T004', user: 'Carlos Melo',    topic: 'Questao de seguranca',   rideDate: '09/06, 11:20',
    status: 'aberto' as const,
    comment: 'O motorista dirigiu de forma perigosa na rodovia, em alta velocidade e usando o celular.',
    photo: null,
  },
  {
    id: 'T005', user: 'Joana Ferreira', topic: 'Problema com pagamento', rideDate: '08/06, 16:05',
    status: 'em_analise' as const,
    comment: 'O pagamento via PIX foi debitado mas o app ainda mostra corrida pendente de pagamento.',
    photo: null,
  },
];

type Status = 'aberto' | 'em_analise' | 'resolvido';

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: any }> = {
  aberto:      { label: 'Aberto',     color: Colors.danger,  icon: AlertCircle },
  em_analise:  { label: 'Em analise', color: Colors.warning, icon: Clock },
  resolvido:   { label: 'Resolvido',  color: Colors.success, icon: Check },
};

interface Props {
  onBack: () => void;
}

const AdminSupportScreen: React.FC<Props> = ({ onBack }) => {
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [tickets, setTickets]           = useState(MOCK_TICKETS);
  const [activeFilter, setActiveFilter] = useState<'todos' | Status>('todos');

  const filteredTickets = activeFilter === 'todos'
    ? tickets
    : tickets.filter(t => t.status === activeFilter);

  const updateStatus = (id: string, status: Status) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const counts = {
    todos:      tickets.length,
    aberto:     tickets.filter(t => t.status === 'aberto').length,
    em_analise: tickets.filter(t => t.status === 'em_analise').length,
    resolvido:  tickets.filter(t => t.status === 'resolvido').length,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Suporte Admin</Text>
          <Text style={styles.headerSub}>{tickets.length} solicitacoes recebidas</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(['todos', 'aberto', 'em_analise', 'resolvido'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
            onPress={() => setActiveFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterLabel, activeFilter === f && styles.filterLabelActive]}>
              {f === 'todos' ? 'Todos' : f === 'aberto' ? 'Abertos' : f === 'em_analise' ? 'Em analise' : 'Resolvidos'}
              {'  '}{counts[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ticket List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filteredTickets.map(ticket => {
          const cfg = STATUS_CONFIG[ticket.status];
          const StatusIcon = cfg.icon;
          const open = expanded === ticket.id;

          return (
            <View key={ticket.id} style={styles.ticketCard}>
              {/* Card Header */}
              <TouchableOpacity
                style={styles.ticketHeader}
                onPress={() => setExpanded(open ? null : ticket.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketUser}>{ticket.user}</Text>
                  <Text style={styles.ticketTopic}>{ticket.topic}</Text>
                  <Text style={styles.ticketDate}>{ticket.rideDate}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <StatusIcon size={12} color={cfg.color} strokeWidth={2.5} />
                  <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                {open ? (
                  <ChevronUp size={18} color={Colors.textMuted} strokeWidth={2} />
                ) : (
                  <ChevronDown size={18} color={Colors.textMuted} strokeWidth={2} />
                )}
              </TouchableOpacity>

              {/* Expanded Detail */}
              {open && (
                <View style={styles.ticketDetail}>
                  <View style={styles.detailDivider} />
                  <Text style={styles.detailSectionLabel}>COMENTARIO DO USUARIO</Text>
                  <Text style={styles.detailComment}>{ticket.comment}</Text>

                  {ticket.photo && (
                    <>
                      <Text style={[styles.detailSectionLabel, { marginTop: 14 }]}>ANEXO</Text>
                      <Image source={{ uri: ticket.photo }} style={styles.attachThumb} />
                    </>
                  )}

                  {/* Action Buttons */}
                  {ticket.status !== 'resolvido' && (
                    <View style={styles.actionRow}>
                      {ticket.status === 'aberto' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: Colors.warning + '1A', borderColor: Colors.warning + '55' }]}
                          onPress={() => updateStatus(ticket.id, 'em_analise')}
                          activeOpacity={0.8}
                        >
                          <Clock size={15} color={Colors.warning} strokeWidth={2} />
                          <Text style={[styles.actionBtnText, { color: Colors.warning }]}>Em analise</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.success + '1A', borderColor: Colors.success + '55', flex: 1 }]}
                        onPress={() => updateStatus(ticket.id, 'resolvido')}
                        activeOpacity={0.8}
                      >
                        <Check size={15} color={Colors.success} strokeWidth={2.5} />
                        <Text style={[styles.actionBtnText, { color: Colors.success }]}>Marcar como resolvido</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {ticket.status === 'resolvido' && (
                    <View style={styles.resolvedBadge}>
                      <Check size={14} color={Colors.success} strokeWidth={2.5} />
                      <Text style={styles.resolvedText}>Caso encerrado</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {filteredTickets.length === 0 && (
          <View style={styles.emptyState}>
            <Check size={40} color={Colors.success} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nenhum ticket</Text>
            <Text style={styles.emptySub}>Nenhuma solicitacao nesta categoria.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  headerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  filterTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary },
  filterLabelActive: { color: Colors.textInverse },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 10 },

  ticketCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  ticketHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  ticketUser: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  ticketTopic: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  ticketDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },

  ticketDetail: { paddingHorizontal: 14, paddingBottom: 16 },
  detailDivider: { height: 1, backgroundColor: Colors.borderLight, marginBottom: 14 },
  detailSectionLabel: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold',
    color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 6,
  },
  detailComment: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, lineHeight: 22 },
  attachThumb: { width: 120, height: 90, borderRadius: Radius.sm, backgroundColor: Colors.border },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: Radius.md, borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  resolvedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
  },
  resolvedText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.success },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  emptySub: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
});

export default AdminSupportScreen;