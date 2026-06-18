import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Star, MessageSquare } from 'lucide-react-native';
import { Colors, Radius, Typography } from '../../constants';
import { supabase } from '../../lib/supabase';

interface DriverRatingsScreenProps {
  onBack: () => void;
}

interface RatingItem {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  origin_address?: string;
  destination_address?: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StarRow({ stars }: { stars: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <Star
          key={s}
          size={14}
          color={s <= stars ? Colors.warning : Colors.borderLight}
          fill={s <= stars ? Colors.warning : 'transparent'}
        />
      ))}
    </View>
  );
}

const DriverRatingsScreen: React.FC<DriverRatingsScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [average, setAverage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('not authenticated');

      // Get ratings given by passengers on rides where I was the driver
      const { data, error: rErr } = await supabase
        .from('ride_ratings')
        .select(`
          id, stars, comment, created_at, rater_role,
          rides!inner ( origin_address, destination_address, driver_id )
        `)
        .eq('rater_role', 'passenger')
        .eq('rides.driver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (rErr) throw rErr;

      const items: RatingItem[] = (data ?? []).map((r: any) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment,
        created_at: r.created_at,
        origin_address: r.rides?.origin_address,
        destination_address: r.rides?.destination_address,
      }));

      setRatings(items);
      if (items.length > 0) {
        setAverage(items.reduce((s, i) => s + i.stars, 0) / items.length);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar avaliações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Distribution
  const dist = [5,4,3,2,1].map(s => ({
    stars: s,
    count: ratings.filter(r => r.stars === s).length,
    pct: ratings.length > 0 ? ratings.filter(r => r.stars === s).length / ratings.length : 0,
  }));

  const renderItem = ({ item }: { item: RatingItem }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <StarRow stars={item.stars} />
        <Text style={styles.cardDate}>{fmtDate(item.created_at)}</Text>
      </View>
      {item.destination_address && (
        <Text style={styles.routeTxt} numberOfLines={1}>
          {(item.origin_address ?? '').split(',')[0]} → {item.destination_address.split(',')[0]}
        </Text>
      )}
      {item.comment ? (
        <View style={styles.commentBox}>
          <MessageSquare size={13} color={Colors.textMuted} />
          <Text style={styles.commentTxt}>"{item.comment}"</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Avaliações</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
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

      {!loading && !error && (
        <FlatList
          data={ratings}
          keyExtractor={r => r.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListHeaderComponent={() => (
            <View>
              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.avgNumber}>{ratings.length > 0 ? average.toFixed(1) : '—'}</Text>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <StarRow stars={Math.round(average)} />
                  <Text style={styles.totalTxt}>{ratings.length} avaliações recebidas</Text>
                </View>
              </View>

              {/* Distribution */}
              {ratings.length > 0 && (
                <View style={styles.distCard}>
                  {dist.map(d => (
                    <View key={d.stars} style={styles.distRow}>
                      <Text style={styles.distLabel}>{d.stars}</Text>
                      <Star size={12} color={Colors.warning} fill={Colors.warning} />
                      <View style={styles.distTrack}>
                        <View style={[styles.distFill, { width: `${Math.round(d.pct * 100)}%` as any }]} />
                      </View>
                      <Text style={styles.distCount}>{d.count}</Text>
                    </View>
                  ))}
                </View>
              )}

              {ratings.length === 0 && (
                <View style={styles.emptyBox}>
                  <Star size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyTxt}>Nenhuma avaliação ainda</Text>
                  <Text style={styles.emptySubTxt}>As avaliações dos passageiros aparecem aqui</Text>
                </View>
              )}

              {ratings.length > 0 && (
                <Text style={styles.listHeader}>Recentes</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  list: { paddingHorizontal: 16 },

  summaryCard: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, padding: 24,
    flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  avgNumber: { fontSize: 48, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  totalTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  distCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary, width: 12 },
  distTrack: { flex: 1, height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  distFill: { height: 8, backgroundColor: Colors.warning, borderRadius: 4 },
  distCount: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, width: 20, textAlign: 'right' },

  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTxt: { ...Typography.h5, color: Colors.textMuted },
  emptySubTxt: { ...Typography.bodyMedium, color: Colors.textMuted, textAlign: 'center' },

  listHeader: {
    fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textMuted,
    letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  routeTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, marginBottom: 6 },
  commentBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 10, marginTop: 4,
  },
  commentTxt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, flex: 1, fontStyle: 'italic', lineHeight: 18 },

  errorTxt: { ...Typography.bodyMedium, color: Colors.danger, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary },
  retryTxt: { ...Typography.smallMedium, color: Colors.primary },
});

export default DriverRatingsScreen;
