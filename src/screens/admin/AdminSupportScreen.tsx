import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { ArrowLeft, ChevronDown, ChevronUp, Check, Clock, AlertCircle } from 'lucide-react-native';
import { Colors, Radius } from '../../constants';
import { getAdminTickets, setTicketStatus, type AdminTicket, type TicketStatus } from '../../services/admin';

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: any }> = {
  open:        { label: 'Aberto',     color: Colors.danger,  icon: AlertCircle },
  in_progress: { label: 'Em análise', color: Colors.warning, icon: Clock },
  closed:      { label: 'Resolvido',  color: Colors.success, icon: Check },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 86_400_000) return `Hoje, ${time}`;
  if (diff < 172_800_000) return `Ontem, ${time}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + time;
}

interface Props {
  onBack: () => void;
}

const AdminSupportScreen: React.FC<Props> = ({ onBack }) => {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'todos' | TicketStatus>('todos');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets(await getAdminTickets(200)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTickets = useMemo(() => activeFilter === 'todos'
    ? tickets
    : tickets.filter(t => t.status === activeFilter), [tickets, activeFilter]);

  const updateStatus = async (id: string, status: TicketStatus) => {
    setActing(id);
    try {
      await setTicketStatus(id, status);
      setTickets(prev => prev.map(t => t.ticket_id === id ? { ...t, status } : t));
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível atualizar o chamado.');
    } finally {
      setActing(null);
    }
  };

  const counts = {
    todos:       tickets.length,
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
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
          <Text style={styles.headerSub}>{tickets.length} solicitações recebidas</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(['todos', 'open', 'in_progress', 'closed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
            onPress={() => setActiveFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterLabel, activeFilter === f && styles.filterLabelActive]}>
              {f === 'todos' ? 'Todos' : f === 'open' ? 'Abertos' : f === 'in_progress' ? 'Em análise' : 'Resolvidos'}
              {'  '}{counts[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && tickets.length === 0 ? (
        <View style={styles.emptyState}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        >
          {filteredTickets.map(ticket => {
            const cfg = STATUS_CONFIG[ticket.status];
            const StatusIcon = cfg.icon;
            const open = expanded === ticket.ticket_id;
            const busy = acting === ticket.ticket_id;

            return (
              <View key={ticket.ticket_id} style={styles.ticketCard}>
                <TouchableOpacity
                  style={styles.ticketHeader}
                  onPress={() => setExpanded(open ? null : ticket.ticket_id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketUser}>{ticket.user_name ?? 'Usuário'}</Text>
                    <Text style={styles.ticketTopic} numberOfLines={1}>{ticket.subject}</Text>
                    <Text style={styles.ticketDate}>{fmtDate(ticket.created_at)}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <StatusIcon size={12} color={cfg.color} strokeWidth={2.5} />
                    <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  {open ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                </TouchableOpacity>

                {open && (
                  <View style={styles.ticketDetail}>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailSectionLabel}>MENSAGEM DO USUÁRIO</Text>
                    <Text style={styles.detailComment}>{ticket.message}</Text>

                    {ticket.status !== 'closed' && (
                      <View style={styles.actionRow}>
                        {ticket.status === 'open' && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: Colors.warning + '1A', borderColor: Colors.warning + '55' }]}
                            onPress={() => updateStatus(ticket.ticket_id, 'in_progress')}
                            disabled={busy}
                            activeOpacity={0.8}
                          >
                            <Clock size={15} color={Colors.warning} strokeWidth={2} />
                            <Text style={[styles.actionBtnText, { color: Colors.warning }]}>Em análise</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: Colors.success + '1A', borderColor: Colors.success + '55', flex: 1 }]}
                          onPress={() => updateStatus(ticket.ticket_id, 'closed')}
                          disabled={busy}
                          activeOpacity={0.8}
                        >
                          <Check size={15} color={Colors.success} strokeWidth={2.5} />
                          <Text style={[styles.actionBtnText, { color: Colors.success }]}>{busy ? 'Salvando...' : 'Marcar como resolvido'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {ticket.status === 'closed' && (
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
              <Text style={styles.emptySub}>Nenhuma solicitação nesta categoria.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.background,
  },
  backBtn: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  headerSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight, height: 36 },
  filterTabActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  filterLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary },
  filterLabelActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 10 },
  ticketCard: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden' },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  ticketUser: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  ticketTopic: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  ticketDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
  ticketDetail: { paddingHorizontal: 14, paddingBottom: 16 },
  detailDivider: { height: 1, backgroundColor: Colors.borderLight, marginBottom: 14 },
  detailSectionLabel: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 6 },
  detailComment: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, lineHeight: 22 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  resolvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  resolvedText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.success },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  emptySub: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
});

export default AdminSupportScreen;
