import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '../constants';
import { getRideDestinationChanges, type RideDestinationChange } from '../services/rides';

/**
 * Destination changes made during a ride, shown to both the passenger and the
 * driver so neither can be surprised by a new route or a new fare.
 */
export default function RouteChangeLog({ rideId, refreshKey }: { rideId: string | null; refreshKey?: number }) {
  const [changes, setChanges] = useState<RideDestinationChange[]>([]);

  const load = useCallback(async () => {
    if (!rideId) { setChanges([]); return; }
    try {
      setChanges(await getRideDestinationChanges(rideId));
    } catch { /* the log is informative: a failure must not break the ride */ }
  }, [rideId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!changes.length) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Alterações de rota</Text>
      {changes.map((change) => (
        <View key={change.id} style={styles.row}>
          <Text style={styles.when}>
            {change.changedByRole === 'driver' ? 'Motorista' : 'Passageiro'} • {formatTime(change.createdAt)}
          </Text>
          <Text style={styles.line}>
            {change.previousAddress ? `De ${change.previousAddress}\n` : ''}Para {change.newAddress}
          </Text>
          {change.newPrice != null && (
            <Text style={styles.price}>
              {change.previousPrice != null ? `${money(change.previousPrice)} → ` : ''}{money(change.newPrice)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const styles = StyleSheet.create({
  box: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 12, marginTop: 12, gap: 10,
  },
  title: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textSecondary },
  row: { gap: 2 },
  when: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  line: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary, lineHeight: 18 },
  price: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
});
