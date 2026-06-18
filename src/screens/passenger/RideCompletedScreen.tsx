import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  TextInput,
  Share,
  Alert,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Star, Share2, HelpCircle, ChevronRight, Home, User } from 'lucide-react-native';
import { Button, Card, Avatar } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import { rateRide, getRideCounterpart, type RideCounterpart } from '../../services/rides';
import { playSound } from '../../lib/sounds';
import type { RideRow, RideTypeDb } from '../../types/db';

const fmtMoney = (v?: number | null) =>
  v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const imgEconomico = require('../../../assets/icons/icone_economico.png');
const imgConforto  = require('../../../assets/icons/icone_conforto.png');
const imgPremium   = require('../../../assets/icons/icone_premium.png');
const imgMoto      = require('../../../assets/icons/icone_moto.png');

// ── Trip Completed Illustration ──────────────────────────────
const IllustrationRideComplete = ({ rideType = 'economy' }: { rideType?: RideTypeDb }) => {
  const carImg = rideType === 'moto' ? imgMoto : rideType === 'premium' ? imgPremium : rideType === 'comfort' ? imgConforto : imgEconomico;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width="220" height="165" viewBox="0 0 220 165">
        {/* Soft glow rings */}
        <Circle cx="110" cy="82" r="72" fill={Colors.primary + '09'} />
        <Circle cx="110" cy="82" r="56" fill={Colors.primary + '14'} />
        <Circle cx="110" cy="82" r="42" fill={Colors.primary + '22'} />
        {/* Main checkmark circle */}
        <Circle cx="110" cy="82" r="34" fill={Colors.primary} />
        <Path d="M94 82 L105 94 L128 68" stroke="#000" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Confetti */}
        <Rect x="38" y="14" width="9" height="9" rx="2" fill={Colors.primary} transform="rotate(28 42 18)" opacity={0.9} />
        <Circle cx="176" cy="13" r="6" fill="#F59E0B" opacity={0.9} />
        <Rect x="181" y="43" width="8" height="8" rx="1.5" fill="#1A1A2E" transform="rotate(-22 185 47)" opacity={0.75} />
        <Circle cx="30" cy="58" r="5.5" fill={Colors.primary} opacity={0.65} />
        <Rect x="183" y="82" width="7" height="11" rx="3.5" fill={Colors.primary} transform="rotate(38 186 87)" opacity={0.7} />
        <Circle cx="26" cy="106" r="5" fill="#F59E0B" opacity={0.7} />
        <Rect x="40" y="114" width="7" height="7" rx="1.5" fill="#F59E0B" transform="rotate(-15 43 117)" opacity={0.6} />
        {/* Stars */}
        <Path d="M18 70 L21 61 L24 70 L33 70 L27 75 L29 84 L21 79 L13 84 L15 75 L9 70 Z" fill="#F59E0B" opacity={0.8} />
        <Path d="M193 48 L196 39 L199 48 L208 48 L202 53 L204 62 L196 57 L188 62 L190 53 L184 48 Z" fill="#F59E0B" opacity={0.65} />
      </Svg>
      {/* Real vehicle art from chosen ride type */}
      <Image source={carImg} style={{ width: 160, height: 84, marginTop: -8 }} resizeMode="contain" />
    </View>
  );
};
// ─────────────────────────────────────────────────────────────

interface RideCompletedScreenProps {
  ride?: RideRow | null;
  onGoHome: () => void;
  onSupport?: () => void;
  onProfile?: () => void;
  rideType?: RideTypeDb;
}

const RideCompletedScreen: React.FC<RideCompletedScreenProps> = ({ ride, onGoHome, onSupport, onProfile = () => {}, rideType = 'economy' }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [driver, setDriver] = useState<RideCounterpart | null>(null);

  const effectiveType = (ride?.ride_type as any) ?? rideType;

  // Celebratory chime when the trip-complete screen opens (once).
  useEffect(() => { playSound('complete'); }, []);

  // Real driver info for the rating card
  useEffect(() => {
    if (!ride?.id) return;
    let active = true;
    getRideCounterpart(ride.id).then((c) => { if (active) setDriver(c); }).catch(() => {});
    return () => { active = false; };
  }, [ride?.id]);

  const driverName = driver?.name ?? 'Motorista';
  const destShort = ride?.destination_address?.split(',')[0] ?? 'Destino';

  const finish = () => { setSubmitted(true); setTimeout(onGoHome, 1800); };

  // Save the rating, then go home. "Pular" skips the RPC.
  const handleSubmit = async () => {
    if (rating > 0 && ride?.id) {
      setSaving(true);
      try {
        await rateRide(ride.id, rating, comment.trim() || undefined);
      } catch {
        // Non-blocking: even if the rating fails to save, don't trap the user.
      } finally {
        setSaving(false);
      }
    }
    finish();
  };

  const handleShare = async () => {
    try {
      const lines = [
        'Comprovante de corrida - Rotta Urbana',
        ride?.origin_address ? `Origem: ${ride.origin_address}` : null,
        ride?.destination_address ? `Destino: ${ride.destination_address}` : null,
        ride?.distance_km != null ? `Distância: ${ride.distance_km.toFixed(1)} km` : null,
        ride?.duration_min != null ? `Duração: ${ride.duration_min} min` : null,
        `Total: ${fmtMoney(ride?.price)}`,
      ].filter(Boolean).join('\n');
      await Share.share({ message: lines });
    } catch { /* user dismissed */ }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Header ────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerAvatarBtn} onPress={onProfile} activeOpacity={0.8}>
          <User size={20} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerHomeBtn} onPress={onGoHome} activeOpacity={0.8}>
          <Home size={20} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Illustration + Title */}
        <View style={styles.successSection}>
          <IllustrationRideComplete rideType={effectiveType} />
          <Text style={styles.successTitle}>Chegou ao destino!</Text>
          <Text style={styles.successSub}>Corrida concluida com sucesso</Text>
        </View>

        {/* Trip Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Resumo da corrida</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{ride?.distance_km != null ? `${ride.distance_km.toFixed(1)} km` : '—'}</Text>
              <Text style={styles.summaryLabel}>Distancia</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{ride?.duration_min != null ? `${ride.duration_min} min` : '—'}</Text>
              <Text style={styles.summaryLabel}>Duracao</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue} numberOfLines={1}>{destShort}</Text>
              <Text style={styles.summaryLabel}>Destino</Text>
            </View>
          </View>

          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Total cobrado</Text>
            <Text style={styles.priceValue}>{fmtMoney(ride?.price)}</Text>
          </View>

          <View style={styles.originDestRow}>
            <View style={styles.odPoint}>
              <View style={[styles.odDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.odText} numberOfLines={1}>{ride?.origin_address ?? 'Ponto de partida'}</Text>
            </View>
            <View style={styles.odLine} />
            <View style={styles.odPoint}>
              <View style={[styles.odDot, { backgroundColor: Colors.danger }]} />
              <Text style={styles.odText} numberOfLines={1}>{ride?.destination_address ?? 'Destino'}</Text>
            </View>
          </View>
        </Card>

        {/* Driver Rating */}
        {!submitted ? (
          <Card style={styles.ratingCard}>
            <View style={styles.driverRatingRow}>
              <Avatar name={driverName} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.ratingTitle}>Como foi a corrida com</Text>
                <Text style={styles.driverRatingName}>{driverName}?</Text>
              </View>
            </View>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <TouchableOpacity key={i} onPress={() => setRating(i)} activeOpacity={0.7}>
                  <Star
                    size={36}
                    color={Colors.warning}
                    fill={i <= rating ? Colors.warning : 'transparent'}
                    strokeWidth={1.5}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingHint}>
                {rating >= 4 ? 'Que otimo! Motorista excelente!' : rating >= 3 ? 'Obrigado pela avaliacao!' : 'Sentimos muito. Vamos melhorar!'}
              </Text>
            )}
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Deixe um comentário (opcional)"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              maxLength={200}
              textAlignVertical="top"
            />
            <View style={styles.ratingBtnRow}>
              <Button
                title="Pular"
                onPress={finish}
                variant="ghost"
                style={{ flex: 1 }}
                disabled={saving}
              />
              <Button
                title="Enviar avaliação"
                onPress={handleSubmit}
                variant="primary"
                style={{ flex: 2 }}
                loading={saving}
                disabled={saving || rating === 0}
              />
            </View>
          </Card>
        ) : (
          <Card style={styles.ratingCard}>
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <View style={styles.thankIconWrap}>
                <Star size={28} color={Colors.textInverse} fill={Colors.textInverse} />
              </View>
              <Text style={styles.thankYou}>Obrigado pela avaliacao!</Text>
              <Text style={styles.redirecting}>Voltando para o inicio...</Text>
            </View>
          </Card>
        )}

        {/* Share receipt */}
        <TouchableOpacity style={styles.shareBtn} activeOpacity={0.7} onPress={handleShare}>
          <Share2 size={16} color={Colors.textPrimary} strokeWidth={2} />
          <Text style={styles.shareText}>Compartilhar comprovante</Text>
        </TouchableOpacity>

        {/* Support link */}
        <TouchableOpacity
          style={styles.supportCard}
          onPress={onSupport}
          activeOpacity={0.8}
        >
          <View style={styles.supportIconWrap}>
            <HelpCircle size={20} color={Colors.textPrimary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Precisa de ajuda?</Text>
            <Text style={styles.supportSub}>Reporte problemas com esta corrida</Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12,
    backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerAvatarBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  headerHomeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48 },

  successSection: { alignItems: 'center', marginBottom: 24 },
  successTitle: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 6, marginTop: 8 },
  successSub: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },

  summaryCard: { marginBottom: 16, padding: 20 },
  cardTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  summaryValue: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  divider: { width: 1, height: 36, backgroundColor: Colors.border },
  priceBox: {
    backgroundColor: Colors.primary + '1A', borderRadius: Radius.md,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
  },
  priceLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  priceValue: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  originDestRow: { gap: 4 },
  odPoint: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  odDot: { width: 10, height: 10, borderRadius: 5 },
  odText: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  odLine: { width: 2, height: 14, backgroundColor: Colors.border, marginLeft: 4 },

  ratingCard: { marginBottom: 16, padding: 20 },
  driverRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  ratingTitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary },
  driverRatingName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  ratingHint: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  ratingBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  commentInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 12, minHeight: 76, marginTop: 4, marginBottom: 4,
    fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  thankIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  thankYou: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginTop: 0 },
  redirecting: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 4 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  shareText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: Colors.textPrimary },

  supportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  supportIconWrap: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center',
  },
  supportTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 2 },
  supportSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
});

export default RideCompletedScreen;