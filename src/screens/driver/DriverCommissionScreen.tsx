import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Share, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, CheckCircle2, AlertTriangle, Clock, RefreshCw, Headphones, Wallet } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { PixQrCode } from '../../components/PixQrCode';
import { Colors, Radius, Typography } from '../../constants';
import {
  createCommissionPix, getCommissionInvoices, getCommissionPix, getCommissionStatus,
  type CommissionInvoice, type CommissionPix, type CommissionStatus,
} from '../../services/commissions';

interface Props {
  /** Blocked by an overdue commission: no way back to the map. */
  blocked: boolean;
  onBack: () => void;
  onEarnings: () => void;
  onSupport: () => void;
  /** Called once the Pix is confirmed, so the navigator unblocks at once. */
  onPaid: () => void;
}

const money = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayLabel = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateTimeLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

async function copyText(text: string): Promise<boolean> {
  try {
    // Required lazily: a dev client built before expo-clipboard lacks the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    try { await Share.share({ message: text }); } catch { /* ignore */ }
    return false;
  }
}

const DriverCommissionScreen: React.FC<Props> = ({ blocked, onBack, onEarnings, onSupport, onPaid }) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<CommissionStatus | null>(null);
  const [history, setHistory] = useState<CommissionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<CommissionPix | null>(null);
  const [creating, setCreating] = useState(false);
  const [paidNow, setPaidNow] = useState(false);
  const [copied, setCopied] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, h] = await Promise.all([getCommissionStatus(), getCommissionInvoices(60).catch(() => [] as CommissionInvoice[])]);
      setStatus(s);
      setHistory(h);
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível carregar a comissão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // While the code is on screen, ask the server (which asks Mercado Pago).
  useEffect(() => {
    if (!pix || pix.status !== 'pending') return;
    const id = pix.id;
    const iv = setInterval(async () => {
      try {
        const fresh = await getCommissionPix(id);
        setPix((cur) => (cur?.id === id ? fresh : cur));
        if (fresh.status === 'approved') {
          setPaidNow(true);
          onPaidRef.current();
          void load();
        }
      } catch { /* retried on the next tick */ }
    }, 5000);
    return () => clearInterval(iv);
  }, [pix?.id, pix?.status, load]);

  const generate = async () => {
    setCreating(true);
    try {
      const p = await createCommissionPix();
      setPix(p);
      setCopied(false);
    } catch (e: any) {
      if (e?.code === 'nothing_due') {
        await load();
        Alert.alert('Tudo pago', 'Nenhuma comissão em aberto.');
      } else {
        Alert.alert('Pix indisponível', e?.message ?? 'Tente novamente em instantes.');
      }
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!pix?.qr_code) return;
    const ok = await copyText(pix.qr_code);
    if (ok) setCopied(true);
  };

  const total = status?.open_total ?? 0;
  const pixExpired = pix?.status === 'pending' && pix.expires_at && new Date(pix.expires_at).getTime() < Date.now();
  const paidHistory = history.filter((i) => i.status !== 'open');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {!blocked ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Voltar">
            <ChevronLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.title}>Comissão diária</Text>
        <TouchableOpacity onPress={() => { setLoading(true); void load(); }} style={styles.backBtn} accessibilityLabel="Atualizar">
          <RefreshCw size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {loading && !status ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : error && !status ? (
          <View style={styles.card}>
            <Text style={styles.muted}>{error}</Text>
            <Button title="Tentar de novo" onPress={() => { setLoading(true); void load(); }} variant="outline" style={{ marginTop: 12 }} />
          </View>
        ) : (
          <>
            {paidNow && (
              <View style={[styles.banner, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '55' }]}>
                <CheckCircle2 size={20} color={Colors.successLight} />
                <Text style={[styles.bannerText, { color: Colors.successLight }]}>Pagamento confirmado! Você já pode receber corridas.</Text>
              </View>
            )}

            {status?.overdue && !paidNow && (
              <View style={[styles.banner, { backgroundColor: Colors.danger + '14', borderColor: Colors.danger + '55' }]}>
                <AlertTriangle size={20} color={Colors.dangerLight} />
                <Text style={[styles.bannerText, { color: Colors.dangerLight }]}>
                  Comissão em atraso. Pague o Pix abaixo para voltar a receber corridas.
                </Text>
              </View>
            )}

            {/* Amount due */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{total > 0 ? 'Valor a pagar' : 'Nada a pagar'}</Text>
              <Text style={styles.heroValue}>{money(total)}</Text>
              {total > 0 && status?.next_due_at && (
                <View style={styles.dueRow}>
                  <Clock size={14} color={status.overdue ? Colors.danger : Colors.warning} />
                  <Text style={[styles.heroSub, status.overdue && { color: Colors.danger }]}>
                    {status.overdue
                      ? `Venceu ${isToday(status.next_due_at) ? 'hoje às ' + timeLabel(status.next_due_at) : 'em ' + dateTimeLabel(status.next_due_at)}`
                      : `Vence ${isToday(status.next_due_at) ? 'hoje' : 'em ' + new Date(status.next_due_at).toLocaleDateString('pt-BR')} às ${timeLabel(status.next_due_at)}`}
                  </Text>
                </View>
              )}
              {(status?.today_rides ?? 0) > 0 && (
                <Text style={styles.heroHint}>
                  Hoje: {money(status!.today_amount)} em {status!.today_rides} {status!.today_rides === 1 ? 'corrida' : 'corridas'} · cobrado amanhã até as 10h
                </Text>
              )}
            </View>

            {/* Open days */}
            {(status?.open.length ?? 0) > 0 && (
              <View style={styles.card}>
                <Text style={styles.section}>Dias em aberto</Text>
                {status!.open.map((i) => (
                  <View key={i.id} style={styles.row}>
                    <Text style={styles.rowMain}>{dayLabel(i.ref_date)}</Text>
                    <Text style={styles.rowSub}>{i.rides_count} {i.rides_count === 1 ? 'corrida' : 'corridas'}</Text>
                    <Text style={styles.rowValue}>{money(i.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Pix */}
            {total > 0 && !paidNow && (
              <View style={styles.card}>
                {!pix || pixExpired || pix.status !== 'pending' ? (
                  <>
                    <Text style={styles.muted}>
                      {pixExpired || pix?.status === 'expired' || pix?.status === 'cancelled'
                        ? 'O código anterior expirou. Gere um novo.'
                        : 'Pague com Pix: a liberação é automática assim que o pagamento cai.'}
                    </Text>
                    <Button
                      title={`Pagar ${money(total)} com Pix`}
                      onPress={generate}
                      loading={creating}
                      fullWidth
                      style={{ marginTop: 12 }}
                    />
                  </>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.section}>Pix de {money(pix.amount)}</Text>
                    {pix.qr_code ? (
                      <View style={styles.qrBox}>
                        <PixQrCode value={pix.qr_code} fallbackBase64={pix.qr_code_base64} size={210} />
                      </View>
                    ) : null}
                    <Text style={styles.code} numberOfLines={3} selectable>{pix.qr_code}</Text>
                    <Button
                      title={copied ? 'Código copiado' : 'Copiar código Pix'}
                      onPress={copy}
                      variant={copied ? 'secondary' : 'primary'}
                      icon={copied ? <CheckCircle2 size={18} color={Colors.textPrimary} /> : <Copy size={18} color={Colors.textInverse} />}
                      fullWidth
                      style={{ marginTop: 12 }}
                    />
                    {pix.ticket_url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(pix.ticket_url!)} style={{ marginTop: 10 }}>
                        <Text style={styles.link}>Abrir no Mercado Pago</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.waitRow}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.muted}>
                        Aguardando o pagamento{pix.expires_at ? ` · código vale até ${timeLabel(pix.expires_at)}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Payment history */}
            <View style={styles.card}>
              <Text style={styles.section}>Histórico de pagamentos</Text>
              {paidHistory.length === 0 ? (
                <Text style={styles.muted}>Nenhum pagamento ainda.</Text>
              ) : paidHistory.map((i) => (
                <View key={i.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowMain}>Dia {dayLabel(i.ref_date)}</Text>
                    <Text style={styles.rowSub}>
                      {i.status === 'paid'
                        ? `Pago${i.paid_at ? ' em ' + dateTimeLabel(i.paid_at) : ''}`
                        : 'Isento'} · {i.rides_count} {i.rides_count === 1 ? 'corrida' : 'corridas'}
                    </Text>
                  </View>
                  <Text style={[styles.rowValue, i.status === 'waived' && { color: Colors.textMuted }]}>{money(i.amount)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.footnote}>
              As comissões das corridas de cada dia são cobradas na manhã seguinte e vencem às 10h. Sem o pagamento, o app fica bloqueado até o Pix ser confirmado.
            </Text>

            <View style={styles.links}>
              <TouchableOpacity style={styles.linkBtn} onPress={onEarnings}>
                <Wallet size={18} color={Colors.textPrimary} />
                <Text style={styles.linkText}>Financeiro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={onSupport}>
                <Headphones size={18} color={Colors.textPrimary} />
                <Text style={styles.linkText}>Suporte</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: Colors.background },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h5, color: Colors.textPrimary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.md, borderWidth: 1, marginBottom: 12 },
  bannerText: { ...Typography.smallMedium, flex: 1 },
  hero: { backgroundColor: Colors.dark, borderRadius: Radius.lg, padding: 20, marginBottom: 12 },
  heroLabel: { ...Typography.small, color: '#FFFFFFAA' },
  heroValue: { ...Typography.h1, color: Colors.white, marginTop: 2 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroSub: { ...Typography.smallMedium, color: Colors.warning },
  heroHint: { ...Typography.caption, color: '#FFFFFF99', marginTop: 10 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  section: { ...Typography.bodySemiBold, color: Colors.textPrimary, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  rowMain: { ...Typography.smallMedium, color: Colors.textPrimary },
  rowSub: { ...Typography.caption, color: Colors.textMuted, flex: 1 },
  rowValue: { ...Typography.bodySemiBold, color: Colors.textPrimary },
  muted: { ...Typography.small, color: Colors.textSecondary },
  qrBox: { padding: 8, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginVertical: 8 },
  code: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  link: { ...Typography.smallMedium, color: Colors.info },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  footnote: { ...Typography.caption, color: Colors.textMuted, marginVertical: 8, paddingHorizontal: 4 },
  links: { flexDirection: 'row', gap: 10, marginTop: 4 },
  linkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  linkText: { ...Typography.smallMedium, color: Colors.textPrimary },
});

export default DriverCommissionScreen;
