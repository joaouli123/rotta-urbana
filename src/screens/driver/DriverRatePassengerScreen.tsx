import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, CheckCircle, DollarSign } from 'lucide-react-native';
import { Avatar, Button } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { rateRide, getRide, getRideCounterpart, type RideCounterpart } from '../../services/rides';
import type { PaymentMethodDb } from '../../types/db';

const fmtMoney = (v?: number | null) =>
  v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// How the driver collects the fare, shown under the value.
const COLLECT_LABEL: Record<PaymentMethodDb, string> = {
  cash: 'Receba em dinheiro do passageiro',
  pix: 'Receba por PIX na sua chave',
  card: 'Receba no cartão, na sua maquininha',
  mercadopago: 'Mercado Pago (repasse automático)',
  boleto: 'Pagamento indisponível',
};

interface DriverRatePassengerScreenProps {
  rideId?: string;
  /** Fare known by the navigator, shown until the saved ride is loaded. */
  price?: number | null;
  paymentMethod?: PaymentMethodDb;
  onDone: () => void;
}

const DriverRatePassengerScreen: React.FC<DriverRatePassengerScreenProps> = ({ rideId, price, paymentMethod, onDone }) => {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [passenger, setPassenger] = useState<RideCounterpart | null>(null);
  const [fare, setFare] = useState({ price: price ?? null, method: paymentMethod });

  useEffect(() => {
    if (!rideId) return;
    let active = true;
    getRideCounterpart(rideId).then((c) => { if (active) setPassenger(c); }).catch(() => {});
    // The saved row has the final fare, including any destination change.
    getRide(rideId)
      .then((r) => { if (active && r?.price != null) setFare({ price: r.price, method: r.payment_method }); })
      .catch(() => {});
    return () => { active = false; };
  }, [rideId]);

  const name = passenger?.name ?? 'Passageiro';

  const submit = async () => {
    if (rating > 0 && rideId) {
      setSaving(true);
      try {
        await rateRide(rideId, rating, comment.trim() || undefined);
      } catch {
        // Non-blocking — don't trap the driver if the rating fails.
      } finally {
        setSaving(false);
      }
    }
    onDone();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 12 }}>
          <View style={styles.completedBadge}>
            <CheckCircle size={26} color={Colors.success} />
            <Text style={styles.completedTxt}>Corrida finalizada!</Text>
          </View>

          <View style={styles.fareCard}>
            <Text style={styles.fareLabel}>Valor da corrida</Text>
            <Text style={styles.fareValue}>{fmtMoney(fare.price)}</Text>
            {fare.method && (
              <View style={styles.farePayRow}>
                <DollarSign size={13} color={Colors.success} />
                <Text style={styles.farePay}>{COLLECT_LABEL[fare.method] ?? fare.method}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Avatar name={name} size={64} />
          <Text style={styles.title}>Como foi o passageiro?</Text>
          <Text style={styles.subtitle}>{name}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity key={i} onPress={() => setRating(i)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Star
                  size={40}
                  color={Colors.warning}
                  fill={i <= rating ? Colors.warning : 'transparent'}
                  strokeWidth={1.5}
                />
              </TouchableOpacity>
            ))}
          </View>

          {rating > 0 && (
            <Text style={styles.hint}>
              {rating >= 4 ? 'Ótimo passageiro!' : rating >= 3 ? 'Obrigado pela avaliação!' : 'Sentimos muito pelo ocorrido.'}
            </Text>
          )}

          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Comentário (opcional)"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={200}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
          <Button title="Pular" variant="ghost" onPress={onDone} disabled={saving} style={{ flex: 1 }} />
          <Button
            title="Enviar avaliação"
            variant="primary"
            onPress={submit}
            loading={saving}
            disabled={saving || rating === 0}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'space-between', gap: 20 },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.success + '14', borderRadius: Radius.md, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.success + '33',
  },
  completedTxt: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.success },
  fareCard: {
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: Colors.primary + '1A', borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
  },
  fareLabel: { ...Typography.smallMedium, color: Colors.textSecondary },
  fareValue: { fontSize: 34, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  farePayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  farePay: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary },
  card: { alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginTop: 4 },
  subtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  starsRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    width: '100%', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 12, minHeight: 76, marginTop: 8,
    fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  actions: { flexDirection: 'row', gap: 10 },
});

export default DriverRatePassengerScreen;
