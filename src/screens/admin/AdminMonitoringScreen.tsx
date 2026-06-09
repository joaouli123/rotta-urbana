import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Activity,
  MapPin,
  Navigation,
  Users,
  AlertTriangle,
  Car,
  Flag,
  CheckCircle,
  ChevronRight,
  X,
  Clock,
  Eye,
} from 'lucide-react-native';
import { Card } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

interface AdminMonitoringScreenProps {
  onBack: () => void;
}

const ACTIVE_RIDES = [
  { id: '#4521', passenger: 'Lucas S.', driver: 'Carlos M.', status: 'in_ride', eta: '5 min', origin: 'Centro', dest: 'Shopping Sinop' },
  { id: '#4522', passenger: 'Ana P.', driver: 'Roberto L.', status: 'driver_on_way', eta: '3 min', origin: 'UNEMAT', dest: 'Aeroporto' },
  { id: '#4523', passenger: 'Bruno T.', driver: 'André S.', status: 'in_ride', eta: '12 min', origin: 'Terminal', dest: 'Hospital' },
  { id: '#4524', passenger: 'Carla F.', driver: '—', status: 'searching', eta: '—', origin: 'Parque', dest: 'Escola Est.' },
  { id: '#4525', passenger: 'Marcos O.', driver: 'João O.', status: 'driver_arrived', eta: 'Aguardando', origin: 'Norte', dest: 'Sul' },
];

type ReportStatus = 'pending' | 'resolved';
interface Report {
  id: string;
  rideId: string;
  reporter: string;
  reporterRole: 'passenger' | 'driver';
  reason: string;
  time: string;
  status: ReportStatus;
}

const INITIAL_REPORTS: Report[] = [
  { id: 'R1', rideId: '#4521', reporter: 'Lucas S.', reporterRole: 'passenger', reason: 'Rota diferente do combinado', time: 'Há 4 min', status: 'pending' },
  { id: 'R2', rideId: '#4523', reporter: 'André S.', reporterRole: 'driver', reason: 'Passageiro agressivo', time: 'Há 12 min', status: 'pending' },
  { id: 'R3', rideId: '#4519', reporter: 'Maria L.', reporterRole: 'passenger', reason: 'Comportamento inadequado', time: 'Há 28 min', status: 'resolved' },
  { id: 'R4', rideId: '#4518', reporter: 'Pedro C.', reporterRole: 'driver', reason: 'Recusa de pagamento', time: 'Há 45 min', status: 'resolved' },
];

const statusLabel: Record<string, { label: string; color: string }> = {
  searching: { label: 'Procurando motorista', color: Colors.warning },
  driver_on_way: { label: 'Motorista a caminho', color: Colors.info },
  driver_arrived: { label: 'Motorista chegou', color: Colors.primary },
  in_ride: { label: 'Em corrida', color: Colors.success },
};

const AdminMonitoringScreen: React.FC<AdminMonitoringScreenProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'rides' | 'reports'>('rides');
  const [reports, setReports] = useState<Report[]>(INITIAL_REPORTS);
  const [selectedRide, setSelectedRide] = useState<typeof ACTIVE_RIDES[0] | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const pendingReports = reports.filter(r => r.status === 'pending');

  const resolveReport = (id: string) => {
    Vibration.vibrate(60);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r));
    setSelectedReport(null);
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
          { icon: <Navigation size={16} color={Colors.success} />, val: '23', lbl: 'Em andamento', color: Colors.success },
          { icon: <Users size={16} color={Colors.info} />, val: '89', lbl: 'Motoristas', color: Colors.info },
          { icon: <Activity size={16} color={Colors.warning} />, val: '14', lbl: 'Buscando', color: Colors.warning },
          { icon: <Flag size={16} color={Colors.danger} />, val: String(pendingReports.length), lbl: 'Alertas', color: Colors.danger },
        ].map(s => (
          <View key={s.lbl} style={styles.statCard}>
            {s.icon}
            <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={styles.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Map mini */}
      <View style={styles.mapContainer}>
        <LinearGradient colors={['#0a1a0a', '#0a0a1a', '#1a1a0a']} style={styles.map}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={[styles.mapLine, { top: i * 22 }]} />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={[styles.mapLineV, { left: i * 40 }]} />
          ))}
          {([
            { top: 55, left: 60, color: Colors.success },
            { top: 110, left: 130, color: Colors.info },
            { top: 80, left: 210, color: Colors.success },
            { top: 145, left: 175, color: Colors.success },
            { top: 50, left: 245, color: Colors.warning },
            { top: 130, left: 45, color: Colors.success },
          ] as const).map((d, i) => (
            <View key={i} style={[styles.mapDriver, { top: d.top, left: d.left }]}>
              <LinearGradient colors={[d.color, d.color]} style={styles.mapDriverInner}>
                <Car size={9} color="#fff" />
              </LinearGradient>
            </View>
          ))}
          <Text style={styles.mapTitle}>Sinop, MT — Mapa ao vivo</Text>
        </LinearGradient>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'rides' && styles.tabActive]}
          onPress={() => setTab('rides')}
        >
          <Car size={15} color={tab === 'rides' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabTxt, tab === 'rides' && styles.tabTxtActive]}>Corridas ativas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'reports' && styles.tabActive]}
          onPress={() => setTab('reports')}
        >
          <Flag size={15} color={tab === 'reports' ? Colors.danger : Colors.textMuted} />
          <Text style={[styles.tabTxt, tab === 'reports' && { color: Colors.danger, fontFamily: 'Poppins_600SemiBold' }]}>
            Denúncias
          </Text>
          {pendingReports.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeTxt}>{pendingReports.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'rides' ? (
          ACTIVE_RIDES.map(ride => {
            const st = statusLabel[ride.status];
            return (
              <TouchableOpacity
                key={ride.id}
                style={styles.rideCard}
                onPress={() => setSelectedRide(ride)}
                activeOpacity={0.75}
              >
                <View style={styles.rideTop}>
                  <View style={styles.rideIdBadge}>
                    <Text style={styles.rideId}>{ride.id}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: st.color + '18', borderColor: st.color + '40' }]}>
                    <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                    <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <ChevronRight size={15} color={Colors.textMuted} />
                </View>
                <View style={styles.rideDetails}>
                  <View style={styles.rideParty}>
                    <Users size={12} color={Colors.textMuted} />
                    <Text style={styles.ridePartyTxt}>{ride.passenger}</Text>
                  </View>
                  <View style={styles.rideParty}>
                    <Car size={12} color={Colors.textMuted} />
                    <Text style={styles.ridePartyTxt}>{ride.driver}</Text>
                  </View>
                  {ride.eta !== '—' && (
                    <View style={styles.rideParty}>
                      <Clock size={12} color={Colors.primary} />
                      <Text style={[styles.ridePartyTxt, { color: Colors.primary }]}>{ride.eta}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          reports.map(report => (
            <TouchableOpacity
              key={report.id}
              style={[styles.reportCard, report.status === 'resolved' && styles.reportResolved]}
              onPress={() => report.status === 'pending' && setSelectedReport(report)}
              activeOpacity={0.75}
            >
              <View style={styles.reportTop}>
                <View style={styles.reportLeft}>
                  <View style={[styles.reportIconWrap, { backgroundColor: report.status === 'pending' ? Colors.danger + '18' : Colors.success + '18' }]}>
                    {report.status === 'pending'
                      ? <Flag size={15} color={Colors.danger} />
                      : <CheckCircle size={15} color={Colors.success} />
                    }
                  </View>
                  <View>
                    <View style={styles.reportTopRow}>
                      <Text style={styles.reportRideId}>{report.rideId}</Text>
                      <View style={[styles.rolePill, { backgroundColor: report.reporterRole === 'passenger' ? Colors.info + '18' : Colors.warning + '18' }]}>
                        <Text style={[styles.roleTxt, { color: report.reporterRole === 'passenger' ? Colors.info : Colors.warning }]}>
                          {report.reporterRole === 'passenger' ? 'Passageiro' : 'Motorista'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reportReason}>{report.reason}</Text>
                    <View style={styles.reportMeta}>
                      <Text style={styles.reportReporter}>por {report.reporter}</Text>
                      <Text style={styles.reportTime}> • {report.time}</Text>
                    </View>
                  </View>
                </View>
                {report.status === 'pending' ? (
                  <View style={styles.pendingBadge}><Text style={styles.pendingTxt}>Pendente</Text></View>
                ) : (
                  <View style={styles.resolvedBadge}><Text style={styles.resolvedTxt}>Resolvido</Text></View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* ── Ride detail modal ────────────────────────────────── */}
      <Modal visible={!!selectedRide} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Corrida {selectedRide?.id}</Text>
              <TouchableOpacity onPress={() => setSelectedRide(null)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedRide && (
              <View style={{ gap: 14 }}>
                <View style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: statusLabel[selectedRide.status].color + '18', borderColor: statusLabel[selectedRide.status].color + '40' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusLabel[selectedRide.status].color }]} />
                  <Text style={[styles.statusTxt, { color: statusLabel[selectedRide.status].color }]}>{statusLabel[selectedRide.status].label}</Text>
                </View>
                {[
                  { icon: <Users size={15} color={Colors.info} />, lbl: 'Passageiro', val: selectedRide.passenger },
                  { icon: <Car size={15} color={Colors.success} />, lbl: 'Motorista', val: selectedRide.driver },
                  { icon: <MapPin size={15} color={Colors.primary} />, lbl: 'Origem', val: selectedRide.origin },
                  { icon: <Navigation size={15} color={Colors.danger} />, lbl: 'Destino', val: selectedRide.dest },
                  { icon: <Clock size={15} color={Colors.warning} />, lbl: 'ETA', val: selectedRide.eta },
                ].map(row => (
                  <View key={row.lbl} style={styles.detailRow}>
                    {row.icon}
                    <Text style={styles.detailLbl}>{row.lbl}</Text>
                    <Text style={styles.detailVal}>{row.val}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Report resolve modal ──────────────────────────────── */}
      <Modal visible={!!selectedReport} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Denúncia {selectedReport?.id}</Text>
              <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.closeBtn}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedReport && (
              <>
                <View style={{ gap: 12, marginBottom: 20 }}>
                  {[
                    { lbl: 'Corrida', val: selectedReport.rideId },
                    { lbl: 'Reportado por', val: `${selectedReport.reporter} (${selectedReport.reporterRole === 'passenger' ? 'Passageiro' : 'Motorista'})` },
                    { lbl: 'Motivo', val: selectedReport.reason },
                    { lbl: 'Quando', val: selectedReport.time },
                  ].map(row => (
                    <View key={row.lbl} style={styles.detailRow}>
                      <Text style={styles.detailLbl}>{row.lbl}</Text>
                      <Text style={styles.detailVal}>{row.val}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={() => resolveReport(selectedReport.id)}
                  activeOpacity={0.85}
                >
                  <CheckCircle size={17} color="#FFF" />
                  <Text style={styles.resolveBtnTxt}>Marcar como resolvido</Text>
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

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.danger + '18', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger + '40',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.danger },
  liveText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.danger, letterSpacing: 1 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 10, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border },
  statVal: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  statLbl: { fontSize: 9, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'center' },

  mapContainer: { marginHorizontal: 16, borderRadius: Radius.xl, overflow: 'hidden', height: 180, marginBottom: 12 },
  map: { flex: 1 },
  mapLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  mapDriver: { position: 'absolute', transform: [{ translateX: -10 }, { translateY: -10 }] },
  mapDriverInner: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mapTitle: { position: 'absolute', bottom: 10, right: 12, fontSize: 10, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.35)' },

  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: Radius.md, backgroundColor: Colors.surface, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: Radius.md - 2 },
  tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },
  tabTxtActive: { color: Colors.primary, fontFamily: 'Poppins_600SemiBold' },
  tabBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  tabBadgeTxt: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#FFF' },

  content: { paddingHorizontal: 16, paddingBottom: 40 },

  rideCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  rideTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rideIdBadge: { backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  rideId: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', flex: 1 },
  rideDetails: { flexDirection: 'row', gap: 14 },
  rideParty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ridePartyTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },

  reportCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  reportResolved: { opacity: 0.6 },
  reportTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  reportLeft: { flexDirection: 'row', gap: 10, flex: 1 },
  reportIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reportTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  reportRideId: { fontSize: 12, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  roleTxt: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  reportReason: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 4 },
  reportMeta: { flexDirection: 'row' },
  reportReporter: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  reportTime: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  pendingBadge: { backgroundColor: Colors.danger + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger + '40' },
  pendingTxt: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.danger },
  resolvedBadge: { backgroundColor: Colors.success + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.success + '40' },
  resolvedTxt: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: Colors.success },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  detailTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailLbl: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, width: 90 },
  detailVal: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flex: 1 },

  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 14,
  },
  resolveBtnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#FFF' },
});

export default AdminMonitoringScreen;
