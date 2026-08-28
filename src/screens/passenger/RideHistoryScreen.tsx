import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Navigation, Star, CheckCircle, XCircle,
  MapPin, Clock, DollarSign, X, HelpCircle,
} from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';
import { getRideHistory } from '../../services/rides';
import type { RideRow } from '../../types/db';

interface RideHistoryScreenProps {
  onBack: () => void;
  onSupport?: () => void;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 86_400_000) return `Hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff < 172_800_000) return `Ontem, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function fmtPrice(val?: number | null): string {
  if (!val) return '—';
  return `R$ ${val.toFixed(2).replace('.', ',')}`;
}

const RideHistoryScreen: React.FC<RideHistoryScreenProps> = ({ onBack, onSupport }) => {
  const insets = useSafeAreaInsets();
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RideRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRideHistory(50);
      setRides(data);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completed = rides.filter(r => r.status === 'completed');
  const totalSpent = completed.reduce((s, r) => s + (r.price ?? 0), 0);

  const renderItem = ({ item }: { item: RideRow }) => {
    const ok = item.status === 'completed';
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.75}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: ok ? Colors.success + '18' : Colors.danger + '18' }]}>
            {ok ? <CheckCircle size={16} color={Colors.success} /> : <XCircle size={16} color={Colors.danger} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.destText} numberOfLines={1}>
              {item.destination_address.split(',')[0]}
            </Text>
            <Text style={styles.dateText}>{fmtDate(item.requested_at)}</Text>
          </View>
          <Text style={[styles.priceText, { color: ok ? Colors.textPrimary : Colors.textMuted }]}>
            {ok ? fmtPrice(item.price) : 'Cancelada'}
          </Text>
        </View>
        <View style={styles.originRow}>
          <MapPin size={11} color={Colors.textMuted} />
          <Text style={styles.originTxt} numberOfLines={1}>{item.origin_address.split(',')[0]}</Text>
          {item.duration_min && (
            <><Clock size={11} color={Colors.textMuted} /><Text style={styles.originTxt}>{item.duration_min} min</Text></>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Histórico de corridas</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats */}
      {!loading && rides.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{completed.length}</Text>
            <Text style={styles.statLbl}>Concluídas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>{fmtPrice(totalSpent)}</Text>
            <Text style={styles.statLbl}>Total gasto</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{rides.length}</Text>
            <Text style={styles.statLbl}>Total</Text>
          </View>
        </View>
      )}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingTxt}>Carregando histórico...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryTxt}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && rides.length === 0 && (
        <View style={styles.center}>
          <Navigation size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTxt}>Nenhuma corrida ainda</Text>
          <Text style={styles.emptySubTxt}>Suas corridas concluídas aparecerão aqui</Text>
        </View>
      )}

      {!loading && rides.length > 0 && (
        <FlatList
          data={rides}
          keyExtractor={r => r.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Detalhes da corrida</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <X size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selected && (
              <>
                <View style={{ gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Status', value: selected.status === 'completed' ? 'Concluída' : 'Cancelada' },
                    { label: 'Embarque', value: selected.origin_address },
                    { label: 'Destino', value: selected.destination_address },
                    { label: 'Valor', value: fmtPrice(selected.price) },
                    { label: 'Distância', value: selected.distance_km ? `${selected.distance_km.toFixed(1)} km` : '—' },
                    { label: 'Duração', value: selected.duration_min ? `${selected.duration_min} min` : '—' },
                    { label: 'Pagamento', value: selected.payment_method === 'mercadopago' ? 'Mercado Pago' : selected.payment_method === 'pix' ? 'PIX direto' : selected.payment_method === 'card' ? 'Cartão' : 'Dinheiro' },
                    { label: 'Data', value: fmtDate(selected.requested_at) },
                    { label: 'Tipo', value: selected.ride_type === 'moto' ? 'Moto' : selected.ride_type === 'economy' ? 'Econômico' : selected.ride_type === 'comfort' ? 'Conforto' : 'Premium' },
                    ...(selected.cancel_reason ? [{ label: 'Motivo cancel.', value: selected.cancel_reason }] : []),
                  ].map(row => (
                    <View key={row.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={styles.detailValue} numberOfLines={3}>{row.value}</Text>
                    </View>
                  ))}
                </View>
                {onSupport && (
                  <TouchableOpacity style={styles.helpBtn} onPress={() => { setSelected(null); onSupport(); }} activeOpacity={0.85}>
                    <HelpCircle size={17} color={Colors.primary} />
                    <Text style={styles.helpTxt}>Preciso de ajuda com essa corrida</Text>
                  </TouchableOpacity>
                )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statVal: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  statLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  destText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  dateText: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 2 },
  priceText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
  originRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  originTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  loadingTxt: { ...Typography.bodyMedium, color: Colors.textMuted },
  errorTxt: { ...Typography.bodyMedium, color: Colors.danger, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  retryTxt: { ...Typography.smallMedium, color: Colors.primary },
  emptyTxt: { ...Typography.h5, color: Colors.textMuted },
  emptySubTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  detailLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, width: 90 },
  detailValue: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flex: 1 },
  helpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '0A',
  },
  helpTxt: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.primary },
});

export default RideHistoryScreen;
