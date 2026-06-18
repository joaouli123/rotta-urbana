import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Modal, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Navigation, Users, Flag, Car, CheckCircle,
  ChevronRight, X, Clock, AlertTriangle, XCircle,
} from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';
import { supabase } from '../../lib/supabase';
import {
  getAdminActiveRides, getAdminTickets, setTicketStatus,
  type AdminActiveRide, type AdminTicket,
} from '../../services/admin';

interface AdminMonitoringScreenProps {
  onBack: () => void;
}

interface CancelledRide {
  ride_id: string;
  passenger_name: string | null;
  driver_name: string | null;
  origin_address: string;
  destination_address: string;
  cancel_reason: string | null;
  cancelled_by: 'passenger' | 'driver' | 'admin' | null;
  cancelled_at: string | null;
  requested_at: string | null;
}

const statusLabel: Record<string, { label: string; color: string }> = {
  searching:      { label: 'Procurando motorista', color: Colors.warning },
  driver_found:   { label: 'Motorista encontrado', color: Colors.info },
  driver_on_way:  { label: 'Motorista a caminho',  color: Colors.info },
  driver_arrived: { label: 'Motorista chegou',     color: Colors.primary },
  in_progress:    { label: 'Em corrida',            color: Colors.success },
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Agora';
  if (diff < 3_600_000) return `Há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Há ${Math.floor(diff / 3_600_000)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function shortId(id?: string | null): string {
  return id ? id.slice(0, 8).toUpperCase() : '—';
}
const stripDenuncia = (s: string) => s.replace(/^Den[uú]ncia:\s*/i, '');

const AdminMonitoringScreen: React.FC<AdminMonitoringScreenProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'rides' | 'cancels' | 'reports'>('rides');
  const [selectedRide, setSelectedRide] = useState<AdminActiveRide | null>(null);
  const [selectedReport, setSelectedReport] = useState<AdminTicket | null>(null);
  const [selectedCancel, setSelectedCancel] = useState<CancelledRide | null>(null);

  // Active rides
  const [active, setActive] = useState<AdminActiveRide[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);
  // Cancelled rides
  const [cancels, setCancels] = useState<CancelledRide[]>([]);
  const [cancelsLoading, setCancelsLoading] = useState(false);
  const [cancelsError, setCancelsError] = useState<string | null>(null);
  // Reports (denúncias = support tickets prefixed "Denúncia")
  const [reports, setReports] = useState<AdminTicket[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    try { setActive(await getAdminActiveRides(100)); } catch { /* ignore */ }
    finally { setActiveLoading(false); }
  }, []);

  const loadCancels = useCallback(async () => {
    setCancelsLoading(true);
    setCancelsError(null);
    try {
      const { data, error } = await supabase.rpc('admin_cancelled_rides', { p_limit: 50 });
      if (error) throw error;
      setCancels((data as CancelledRide[]) ?? []);
    } catch (e: any) {
      setCancelsError(e?.message ?? 'Erro ao carregar cancelamentos');
    } finally {
      setCancelsLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const all = await getAdminTickets(200);
      setReports(all.filter((t) => /^den[uú]ncia/i.test(t.subject)));
    } catch { /* ignore */ }
    finally { setReportsLoading(false); }
  }, []);

  // Active rides power the live stats, so always load on mount.
  useEffect(() => { loadActive(); }, [loadActive]);
  useEffect(() => {
    if (tab === 'cancels') loadCancels();
    if (tab === 'reports') loadReports();
  }, [tab, loadCancels, loadReports]);

  const pendingReports = reports.filter((r) => r.status !== 'closed');

  const resolveReport = async (id: string) => {
    setResolving(id);
    try {
      await setTicketStatus(id, 'closed');
      setReports((prev) => prev.map((r) => r.ticket_id === id ? { ...r, status: 'closed' } : r));
      setSelectedReport(null);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível resolver a denúncia.');
    } finally {
      setResolving(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Monitoramento</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      </View>

      {/* Live stats */}
      <View style={styles.statsRow}>
        {[
          { icon: <Navigation size={16} color={Colors.success} />, val: String(active.filter(r => r.status === 'in_progress').length), lbl: 'Em corrida', color: Colors.success },
          { icon: <Users size={16} color={Colors.info} />, val: String(active.length), lbl: 'Ativas', color: Colors.info },
          { icon: <Clock size={16} color={Colors.warning} />, val: String(active.filter(r => r.status === 'searching').length), lbl: 'Buscando', color: Colors.warning },
          { icon: <XCircle size={16} color={Colors.danger} />, val: String(cancels.length), lbl: 'Cancels', color: Colors.danger },
        ].map(s => (
          <View key={s.lbl} style={styles.statCard}>
            {s.icon}
            <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={styles.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === 'rides' && styles.tabActive]} onPress={() => setTab('rides')}>
          <Car size={13} color={tab === 'rides' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabTxt, tab === 'rides' && styles.tabTxtActive]}>Ativas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'cancels' && styles.tabActive]} onPress={() => setTab('cancels')}>
          <XCircle size={13} color={tab === 'cancels' ? Colors.danger : Colors.textMuted} />
          <Text style={[styles.tabTxt, tab === 'cancels' && styles.tabTxtCancels]}>Cancelamentos</Text>
          {cancels.length > 0 && <View style={[styles.tabBadge, { backgroundColor: Colors.danger }]}><Text style={styles.tabBadgeTxt}>{cancels.length > 99 ? '99+' : cancels.length}</Text></View>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'reports' && styles.tabActive]} onPress={() => setTab('reports')}>
          <Flag size={13} color={tab === 'reports' ? Colors.warning : Colors.textMuted} />
          <Text style={[styles.tabTxt, tab === 'reports' && styles.tabTxtReports]}>Denúncias</Text>
          {pendingReports.length > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeTxt}>{pendingReports.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={tab === 'rides' ? activeLoading : tab === 'cancels' ? cancelsLoading : reportsLoading}
            onRefresh={tab === 'rides' ? loadActive : tab === 'cancels' ? loadCancels : loadReports}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── ACTIVE RIDES ── */}
        {tab === 'rides' && (
          <>
            {activeLoading && active.length === 0 && <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>}
            {!activeLoading && active.length === 0 && (
              <View style={styles.center}><Car size={36} color={Colors.textMuted} /><Text style={styles.emptyTxt}>Nenhuma corrida ativa agora</Text></View>
            )}
            {active.map((ride) => {
              const st = statusLabel[ride.status] ?? { label: ride.status, color: Colors.textMuted };
              return (
                <TouchableOpacity key={ride.ride_id} style={styles.rideCard} onPress={() => setSelectedRide(ride)} activeOpacity={0.75}>
                  <View style={styles.rideTop}>
                    <View style={styles.rideIdBadge}><Text style={styles.rideId}>#{shortId(ride.ride_id)}</Text></View>
                    <View style={[styles.statusPill, { backgroundColor: st.color + '18', borderColor: st.color + '40' }]}>
                      <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                      <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                    </View>
                    <ChevronRight size={15} color={Colors.textMuted} />
                  </View>
                  <View style={styles.rideDetails}>
                    <View style={styles.rideParty}><Users size={12} color={Colors.textMuted} /><Text style={styles.ridePartyTxt}>{ride.passenger_name ?? 'Passageiro'}</Text></View>
                    <View style={styles.rideParty}><Car size={12} color={Colors.textMuted} /><Text style={styles.ridePartyTxt}>{ride.driver_name ?? 'Buscando...'}</Text></View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── CANCELAMENTOS ── */}
        {tab === 'cancels' && (
          <>
            {cancelsLoading && cancels.length === 0 && <View style={styles.center}><ActivityIndicator color={Colors.primary} /><Text style={styles.loadingTxt}>Carregando...</Text></View>}
            {cancelsError && (
              <View style={styles.center}><AlertTriangle size={32} color={Colors.danger} /><Text style={styles.errorTxt}>{cancelsError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadCancels}><Text style={styles.retryTxt}>Tentar novamente</Text></TouchableOpacity></View>
            )}
            {!cancelsLoading && !cancelsError && cancels.length === 0 && (
              <View style={styles.center}><CheckCircle size={36} color={Colors.success} /><Text style={styles.emptyTxt}>Nenhum cancelamento registrado</Text></View>
            )}
            {cancels.map((c) => (
              <TouchableOpacity key={c.ride_id} style={styles.cancelCard} onPress={() => setSelectedCancel(c)} activeOpacity={0.75}>
                <View style={styles.cancelCardTop}>
                  <View style={[styles.cancelByBadge, { backgroundColor: c.cancelled_by === 'driver' ? Colors.warning + '20' : Colors.info + '20', borderColor: c.cancelled_by === 'driver' ? Colors.warning + '50' : Colors.info + '50' }]}>
                    <Text style={[styles.cancelByTxt, { color: c.cancelled_by === 'driver' ? Colors.warning : Colors.info }]}>
                      {c.cancelled_by === 'driver' ? 'Motorista' : c.cancelled_by === 'passenger' ? 'Passageiro' : 'Admin'}
                    </Text>
                  </View>
                  <Text style={styles.cancelIdTxt}>#{shortId(c.ride_id)}</Text>
                  <Text style={styles.cancelTimeTxt}>{fmtDate(c.cancelled_at)}</Text>
                </View>
                <View style={styles.cancelNames}>
                  <View style={styles.cancelParty}><Users size={11} color={Colors.textMuted} /><Text style={styles.cancelPartyTxt} numberOfLines={1}>{c.passenger_name ?? 'Passageiro'}</Text></View>
                  {c.driver_name && <View style={styles.cancelParty}><Car size={11} color={Colors.textMuted} /><Text style={styles.cancelPartyTxt} numberOfLines={1}>{c.driver_name}</Text></View>}
                </View>
                {c.cancel_reason
                  ? <Text style={styles.cancelReasonPreview} numberOfLines={2}>{c.cancel_reason}</Text>
                  : <Text style={[styles.cancelReasonPreview, { color: Colors.textMuted, fontStyle: 'italic' }]}>Sem motivo registrado</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── DENÚNCIAS ── */}
        {tab === 'reports' && (
          <>
            {reportsLoading && reports.length === 0 && <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>}
            {!reportsLoading && reports.length === 0 && (
              <View style={styles.center}><CheckCircle size={36} color={Colors.success} /><Text style={styles.emptyTxt}>Nenhuma denúncia registrada</Text></View>
            )}
            {reports.map((report) => {
              const resolved = report.status === 'closed';
              return (
                <TouchableOpacity key={report.ticket_id} style={[styles.reportCard, resolved && styles.reportResolved]} onPress={() => !resolved && setSelectedReport(report)} activeOpacity={0.75}>
                  <View style={styles.reportTop}>
                    <View style={styles.reportLeft}>
                      <View style={[styles.reportIconWrap, { backgroundColor: resolved ? Colors.success + '18' : Colors.danger + '18' }]}>
                        {resolved ? <CheckCircle size={15} color={Colors.success} /> : <Flag size={15} color={Colors.danger} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportReason} numberOfLines={1}>{stripDenuncia(report.subject)}</Text>
                        <View style={styles.reportMeta}>
                          <Text style={styles.reportReporter}>por {report.user_name ?? 'Usuário'}</Text>
                          <Text style={styles.reportTime}> • {fmtDate(report.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                    {resolved
                      ? <View style={styles.resolvedBadge}><Text style={styles.resolvedTxt}>Resolvido</Text></View>
                      : <View style={styles.pendingBadge}><Text style={styles.pendingTxt}>Pendente</Text></View>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Active ride detail modal */}
      <Modal visible={!!selectedRide} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Corrida #{shortId(selectedRide?.ride_id)}</Text>
              <TouchableOpacity onPress={() => setSelectedRide(null)} style={styles.closeBtn}><X size={20} color={Colors.textPrimary} /></TouchableOpacity>
            </View>
            {selectedRide && (() => {
              const st = statusLabel[selectedRide.status] ?? { label: selectedRide.status, color: Colors.textMuted };
              return (
                <View style={{ gap: 12 }}>
                  <View style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: st.color + '18', borderColor: st.color + '40' }]}>
                    <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                    <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                  </View>
                  {[
                    { lbl: 'Passageiro', val: selectedRide.passenger_name ?? '—' },
                    { lbl: 'Motorista', val: selectedRide.driver_name ?? 'Buscando...' },
                    { lbl: 'Origem', val: selectedRide.origin_address },
                    { lbl: 'Destino', val: selectedRide.destination_address },
                    { lbl: 'Categoria', val: selectedRide.ride_type === 'moto' ? 'Moto' : selectedRide.ride_type === 'economy' ? 'Econômico' : selectedRide.ride_type === 'comfort' ? 'Conforto' : 'Premium' },
                    { lbl: 'Solicitada', val: fmtDate(selectedRide.requested_at) },
                  ].map(row => (
                    <View key={row.lbl} style={styles.detailRow}><Text style={styles.detailLbl}>{row.lbl}</Text><Text style={styles.detailVal} numberOfLines={2}>{row.val}</Text></View>
                  ))}
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Cancel detail modal */}
      <Modal visible={!!selectedCancel} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Cancelamento</Text>
              <TouchableOpacity onPress={() => setSelectedCancel(null)} style={styles.closeBtn}><X size={20} color={Colors.textPrimary} /></TouchableOpacity>
            </View>
            {selectedCancel && (
              <View style={{ gap: 12 }}>
                <View style={[styles.cancelByBadge, { alignSelf: 'flex-start', backgroundColor: selectedCancel.cancelled_by === 'driver' ? Colors.warning + '20' : Colors.info + '20', borderColor: selectedCancel.cancelled_by === 'driver' ? Colors.warning + '50' : Colors.info + '50' }]}>
                  <Text style={[styles.cancelByTxt, { color: selectedCancel.cancelled_by === 'driver' ? Colors.warning : Colors.info }]}>
                    Cancelado pelo {selectedCancel.cancelled_by === 'driver' ? 'motorista' : selectedCancel.cancelled_by === 'passenger' ? 'passageiro' : 'admin'}
                  </Text>
                </View>
                {[
                  { lbl: 'Passageiro', val: selectedCancel.passenger_name ?? '—' },
                  { lbl: 'Motorista', val: selectedCancel.driver_name ?? '—' },
                  { lbl: 'Origem', val: selectedCancel.origin_address },
                  { lbl: 'Destino', val: selectedCancel.destination_address },
                  { lbl: 'Quando', val: fmtDate(selectedCancel.cancelled_at) },
                ].map(row => (
                  <View key={row.lbl} style={styles.detailRow}><Text style={styles.detailLbl}>{row.lbl}</Text><Text style={styles.detailVal} numberOfLines={2}>{row.val}</Text></View>
                ))}
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonBoxLabel}>Motivo registrado</Text>
                  <Text style={styles.reasonBoxTxt}>{selectedCancel.cancel_reason ?? 'Nenhum motivo informado'}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Report resolve modal */}
      <Modal visible={!!selectedReport} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Denúncia</Text>
              <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.closeBtn}><X size={20} color={Colors.textPrimary} /></TouchableOpacity>
            </View>
            {selectedReport && (
              <>
                <View style={{ gap: 12, marginBottom: 20 }}>
                  {[
                    { lbl: 'Motivo', val: stripDenuncia(selectedReport.subject) },
                    { lbl: 'Reportado por', val: selectedReport.user_name ?? 'Usuário' },
                    { lbl: 'Quando', val: fmtDate(selectedReport.created_at) },
                  ].map(row => (
                    <View key={row.lbl} style={styles.detailRow}><Text style={styles.detailLbl}>{row.lbl}</Text><Text style={styles.detailVal}>{row.val}</Text></View>
                  ))}
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonBoxLabel}>Detalhes</Text>
                    <Text style={styles.reasonBoxTxt}>{selectedReport.message}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.resolveBtn} onPress={() => resolveReport(selectedReport.ticket_id)} disabled={resolving === selectedReport.ticket_id} activeOpacity={0.85}>
                  <CheckCircle size={17} color="#FFF" />
                  <Text style={styles.resolveBtnTxt}>{resolving === selectedReport.ticket_id ? 'Resolvendo...' : 'Marcar como resolvido'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.danger + '18', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger + '40' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.danger },
  liveText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.danger, letterSpacing: 1 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 10, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border },
  statVal: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  statLbl: { fontSize: 9, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'center' },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: Radius.md, backgroundColor: Colors.surface, padding: 4, gap: 2 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.md - 2 },
  tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabTxt: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },
  tabTxtActive: { color: Colors.primary, fontFamily: 'Poppins_600SemiBold' },
  tabTxtCancels: { color: Colors.danger, fontFamily: 'Poppins_600SemiBold' },
  tabTxtReports: { color: Colors.warning, fontFamily: 'Poppins_600SemiBold' },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#FFF' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  rideCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rideTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rideIdBadge: { backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  rideId: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', flex: 1 },
  rideDetails: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  rideParty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ridePartyTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  cancelCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.danger + '25' },
  cancelCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cancelByBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  cancelByTxt: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
  cancelIdTxt: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary, flex: 1 },
  cancelTimeTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  cancelNames: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cancelParty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cancelPartyTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, maxWidth: 140 },
  cancelReasonPreview: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, lineHeight: 18 },
  reportCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  reportResolved: { opacity: 0.6 },
  reportTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportLeft: { flexDirection: 'row', gap: 10, flex: 1 },
  reportIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reportReason: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 4 },
  reportMeta: { flexDirection: 'row' },
  reportReporter: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  reportTime: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  pendingBadge: { backgroundColor: Colors.danger + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger + '40' },
  pendingTxt: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.danger },
  resolvedBadge: { backgroundColor: Colors.success + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.success + '40' },
  resolvedTxt: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.success },
  center: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingTxt: { ...Typography.bodyMedium, color: Colors.textMuted },
  emptyTxt: { ...Typography.bodyMedium, color: Colors.textMuted },
  errorTxt: { ...Typography.bodyMedium, color: Colors.danger, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  retryTxt: { ...Typography.smallMedium, color: Colors.primary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  detailTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLbl: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, width: 90, paddingTop: 1 },
  detailVal: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flex: 1 },
  reasonBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 4 },
  reasonBoxLabel: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: Colors.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  reasonBoxTxt: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, lineHeight: 21 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 14 },
  resolveBtnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#FFF' },
});

export default AdminMonitoringScreen;
