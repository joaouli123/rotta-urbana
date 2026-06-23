import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import {
  ChevronLeft,
  X,
  AlertCircle,
  Clock,
  CheckCircle,
  MessageSquare,
} from 'lucide-react-native';
import { Card, Badge } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import {
  getAdminTickets,
  setTicketStatus,
  type AdminTicket,
  type TicketStatus,
} from '../../services/admin';

type FilterValue = TicketStatus | 'all';

const FILTER_TABS: { key: FilterValue; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'open', label: 'Abertos' },
  { key: 'in_progress', label: 'Em andamento' },
  { key: 'closed', label: 'Fechados' },
];

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; badgeVariant: 'danger' | 'warning' | 'success' }> = {
  open:        { label: 'Aberto',       color: Colors.danger,  badgeVariant: 'danger' },
  in_progress: { label: 'Em andamento', color: Colors.warning, badgeVariant: 'warning' },
  closed:      { label: 'Fechado',      color: Colors.success, badgeVariant: 'success' },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  onBack: () => void;
}

const ManagerSupportScreen: React.FC<Props> = ({ onBack }) => {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [response, setResponse] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets(await getAdminTickets(200)); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    filter === 'all' ? tickets : tickets.filter((t) => t.status === filter),
    [tickets, filter],
  );

  const openCount  = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets]);

  const openDetail = (ticket: AdminTicket) => {
    setSelected(ticket);
    setResponse(ticket.response ?? '');
  };

  const closeModal = () => {
    setSelected(null);
    setResponse('');
  };

  const doSetStatus = async (status: TicketStatus) => {
    if (!selected || acting) return;
    setActing(true);
    try {
      const resp = response.trim() || undefined;
      await setTicketStatus(selected.ticket_id, status, resp);
      const updated: AdminTicket = { ...selected, status, response: resp ?? selected.response };
      setTickets((prev) => prev.map((t) => t.ticket_id === selected.ticket_id ? updated : t));
      setSelected(null);
      setResponse('');
      Alert.alert(
        'Ticket atualizado',
        status === 'in_progress'
          ? 'Ticket marcado como em andamento.'
          : 'Ticket fechado com sucesso.',
      );
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível atualizar o ticket.');
    } finally {
      setActing(false);
    }
  };

  const counts: Record<FilterValue, number> = {
    all:         tickets.length,
    open:        openCount,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    closed:      tickets.filter((t) => t.status === 'closed').length,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>Suporte</Text>
          {openCount > 0 && (
            <View style={styles.openPill}>
              <Text style={styles.openPillText}>{openCount} abertos</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Filter chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.chip, filter === tab.key && styles.chipActive]}
            onPress={() => setFilter(tab.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, filter === tab.key && styles.chipTextActive]}>
              {tab.label}{'  '}{counts[tab.key]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && tickets.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        >
          {filtered.length === 0 && (
            <View style={styles.emptyWrap}>
              <CheckCircle size={40} color={Colors.success} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Sem tickets</Text>
              <Text style={styles.emptyText}>Nenhuma solicitação nesta categoria.</Text>
            </View>
          )}

          {filtered.map((ticket) => {
            const cfg = STATUS_CONFIG[ticket.status];
            return (
              <TouchableOpacity key={ticket.ticket_id} onPress={() => openDetail(ticket)} activeOpacity={0.8}>
                <Card style={styles.ticketCard}>
                  {/* Status indicator bar */}
                  <View style={[styles.statusBar, { backgroundColor: cfg.color }]} />

                  <View style={styles.ticketBody}>
                    <View style={styles.ticketTop}>
                      <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                      <Badge label={cfg.label} variant={cfg.badgeVariant} />
                    </View>

                    <Text style={styles.ticketUser}>{ticket.user_name ?? 'Usuário'}</Text>
                    <Text style={styles.ticketPreview} numberOfLines={2}>{ticket.message}</Text>

                    <View style={styles.ticketMeta}>
                      <MessageSquare size={12} color={Colors.textMuted} />
                      <Text style={styles.ticketDate}>{fmtDate(ticket.created_at)}</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Detail modal ── */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selected?.subject ?? 'Ticket'}
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={closeModal}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Status + user */}
                <View style={styles.modalMeta}>
                  <Badge label={STATUS_CONFIG[selected.status].label} variant={STATUS_CONFIG[selected.status].badgeVariant} size="md" />
                  <Text style={styles.modalUser}>{selected.user_name ?? 'Usuário'}</Text>
                  <Text style={styles.modalDate}>{fmtDate(selected.created_at)}</Text>
                </View>

                {/* Message */}
                <Text style={styles.sectionLabel}>MENSAGEM</Text>
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>{selected.message}</Text>
                </View>

                {/* Previous response */}
                {selected.response ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>RESPOSTA ANTERIOR</Text>
                    <View style={[styles.messageBox, { backgroundColor: Colors.success + '12' }]}>
                      <Text style={[styles.messageText, { color: Colors.success }]}>{selected.response}</Text>
                    </View>
                  </>
                ) : null}

                {/* Response input — only if not closed */}
                {selected.status !== 'closed' && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>RESPOSTA (OPCIONAL)</Text>
                    <TextInput
                      style={styles.responseInput}
                      placeholder="Escreva uma resposta ao usuário..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={4}
                      value={response}
                      onChangeText={setResponse}
                      textAlignVertical="top"
                    />
                  </>
                )}

                {/* Action buttons */}
                <View style={styles.modalActions}>
                  {selected.status === 'open' && (
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: Colors.warning }]}
                      onPress={() => doSetStatus('in_progress')}
                      disabled={acting}
                      activeOpacity={0.85}
                    >
                      <Clock size={16} color="#fff" />
                      <Text style={styles.modalBtnText}>
                        {acting ? 'Salvando...' : 'Em andamento'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {(selected.status === 'open' || selected.status === 'in_progress') && (
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: Colors.success }]}
                      onPress={() => doSetStatus('closed')}
                      disabled={acting}
                      activeOpacity={0.85}
                    >
                      <CheckCircle size={16} color="#fff" />
                      <Text style={styles.modalBtnText}>
                        {acting ? 'Fechando...' : 'Fechar ticket'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {selected.status === 'closed' && (
                    <View style={styles.closedNote}>
                      <CheckCircle size={16} color={Colors.success} />
                      <Text style={styles.closedNoteText}>Ticket encerrado</Text>
                    </View>
                  )}
                </View>

                {/* Cancel */}
                <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} activeOpacity={0.75}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  openPill: {
    backgroundColor: Colors.danger + '22', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger + '55',
  },
  openPillText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.danger },

  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 12, paddingTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, height: 34,
  },
  chipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  chipText: { ...Typography.smallMedium, color: Colors.textMuted },
  chipTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },

  ticketCard: { padding: 0, overflow: 'hidden', flexDirection: 'row' },
  statusBar: { width: 4, borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg },
  ticketBody: { flex: 1, padding: 14 },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  ticketSubject: { ...Typography.bodySemiBold, color: Colors.textPrimary, flex: 1 },
  ticketUser: { ...Typography.small, color: Colors.textSecondary, marginBottom: 4 },
  ticketPreview: { ...Typography.small, color: Colors.textMuted, lineHeight: 18, marginBottom: 8 },
  ticketMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ticketDate: { ...Typography.caption, color: Colors.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, flex: 1, marginRight: 12 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },

  modalMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  modalUser: { ...Typography.smallMedium, color: Colors.textSecondary },
  modalDate: { ...Typography.caption, color: Colors.textMuted },

  sectionLabel: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold',
    color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 8,
  },
  messageBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  messageText: { ...Typography.body, color: Colors.textPrimary, lineHeight: 22 },

  responseInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
    ...Typography.body, color: Colors.textPrimary,
    minHeight: 100, lineHeight: 22,
  },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  modalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: Radius.md, paddingVertical: 14, minWidth: 130,
  },
  modalBtnText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },

  closedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: Radius.md,
    backgroundColor: Colors.success + '15', flex: 1,
  },
  closedNoteText: { ...Typography.bodyMedium, color: Colors.success },

  cancelBtn: {
    alignItems: 'center', paddingVertical: 14, marginTop: 10,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { ...Typography.bodyMedium, color: Colors.textSecondary },
});

export default ManagerSupportScreen;
