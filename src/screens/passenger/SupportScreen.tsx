import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import {
  ArrowLeft, CreditCard, Car, Package, MapPin,
  Wallet, Shield, Smartphone, HelpCircle,
  ChevronRight, ChevronDown, Paperclip, Send, X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Radius } from '../../constants';

// ── Help Topics ───────────────────────────────────────────────
const TOPICS = [
  { id: 'cobranca',   icon: CreditCard,  label: 'Cobranca incorreta',           desc: 'Valor cobrado diferente do esperado' },
  { id: 'nochegou',   icon: Car,         label: 'Motorista nao chegou',          desc: 'Motorista cancelou ou nao apareceu' },
  { id: 'perdido',    icon: Package,     label: 'Objeto perdido',                desc: 'Esqueci algo no veiculo' },
  { id: 'diferente',  icon: MapPin,      label: 'Viagem diferente',              desc: 'Rota ou destino incorreto' },
  { id: 'pagamento',  icon: Wallet,      label: 'Problema com pagamento',        desc: 'Erro no pagamento ou cartao' },
  { id: 'seguranca',  icon: Shield,      label: 'Questao de seguranca',          desc: 'Incidente durante a corrida' },
  { id: 'app',        icon: Smartphone,  label: 'Problema com o app',            desc: 'Bug ou falha tecnica' },
  { id: 'outro',      icon: HelpCircle,  label: 'Outro',                         desc: 'Qualquer outra situacao' },
] as const;

// ── Mock rides ────────────────────────────────────────────────
const MOCK_RIDES = [
  { id: 'r1', date: 'Hoje, 14:32',    dest: 'Shopping Sinop',    price: 'R$ 14,00' },
  { id: 'r2', date: 'Ontem, 09:10',   dest: 'Terminal Urbano',   price: 'R$ 8,50'  },
  { id: 'r3', date: '10/06, 18:45',   dest: 'Hospital Geral',    price: 'R$ 22,00' },
  { id: 'r4', date: '09/06, 11:20',   dest: 'Centro de Sinop',   price: 'R$ 11,00' },
  { id: 'r5', date: '08/06, 16:05',   dest: 'Aeroporto Sinop',   price: 'R$ 35,00' },
];

interface Props {
  onBack: () => void;
  onSubmit: () => void;
}

const SupportScreen: React.FC<Props> = ({ onBack, onSubmit }) => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRide, setSelectedRide]   = useState<string | null>(null);
  const [comment, setComment]             = useState('');
  const [photo, setPhoto]                 = useState<string | null>(null);
  const [showRides, setShowRides]         = useState(false);
  const [submitted, setSubmitted]         = useState(false);

  const topic = TOPICS.find(t => t.id === selectedTopic);
  const ride  = MOCK_RIDES.find(r => r.id === selectedRide);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissao necessaria', 'Permita acesso a galeria para anexar fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPhoto(result.assets[0].uri);
    }
  };

  const canSubmit = selectedTopic !== null && comment.trim().length >= 10;

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(onSubmit, 2000);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Central de Ajuda</Text>
        <View style={{ width: 44 }} />
      </View>

      {submitted ? (
        // ── Success state ─────────────────────────────────────
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Send size={28} color={Colors.textInverse} strokeWidth={2} />
          </View>
          <Text style={styles.successTitle}>Solicitacao enviada!</Text>
          <Text style={styles.successSub}>
            Nossa equipe vai analisar o seu caso{'\n'}e retornar em breve.
          </Text>
          <Text style={styles.successNote}>Protocolo: #{Math.floor(Math.random() * 900000 + 100000)}</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Topic ─────────────────────────────────── */}
          <Text style={styles.stepLabel}>1. QUAL O PROBLEMA?</Text>
          <View style={styles.topicsGrid}>
            {TOPICS.map(({ id, icon: Icon, label, desc }) => (
              <TouchableOpacity
                key={id}
                style={[styles.topicCard, selectedTopic === id && styles.topicCardActive]}
                onPress={() => setSelectedTopic(id)}
                activeOpacity={0.75}
              >
                <View style={[styles.topicIcon, selectedTopic === id && styles.topicIconActive]}>
                  <Icon size={20} color={selectedTopic === id ? Colors.textInverse : Colors.textPrimary} strokeWidth={2} />
                </View>
                <Text style={[styles.topicLabel, selectedTopic === id && styles.topicLabelActive]} numberOfLines={2}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedTopic && (
            <>
              {/* ── Step 2: Select Ride ──────────────────────── */}
              <Text style={styles.stepLabel}>2. CORRIDA RELACIONADA</Text>
              <TouchableOpacity
                style={styles.rideSelector}
                onPress={() => setShowRides(!showRides)}
                activeOpacity={0.8}
              >
                <Text style={[styles.rideSelectorText, !ride && { color: Colors.textMuted }]}>
                  {ride ? `${ride.date} — ${ride.dest}` : 'Selecionar corrida (opcional)'}
                </Text>
                <ChevronDown size={18} color={Colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
              {showRides && (
                <View style={styles.rideDropdown}>
                  {MOCK_RIDES.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.rideItem, selectedRide === r.id && styles.rideItemActive]}
                      onPress={() => { setSelectedRide(r.id); setShowRides(false); }}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rideDate}>{r.date}</Text>
                        <Text style={styles.rideDest}>{r.dest}</Text>
                      </View>
                      <Text style={styles.ridePrice}>{r.price}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* ── Step 3: Comment ─────────────────────────── */}
              <Text style={styles.stepLabel}>3. DESCREVA O PROBLEMA</Text>
              <View style={styles.commentBox}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Descreva o que aconteceu com o maximo de detalhes possivel..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={5}
                  value={comment}
                  onChangeText={setComment}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{comment.length} / 500</Text>
              </View>

              {/* ── Step 4: Attachment ──────────────────────── */}
              <Text style={styles.stepLabel}>4. ANEXAR FOTO / VIDEO</Text>
              {photo ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photo }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.removePhoto}
                    onPress={() => setPhoto(null)}
                    activeOpacity={0.7}
                  >
                    <X size={14} color="#FFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                  <Text style={styles.photoLabel}>Arquivo anexado</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.attachBtn} onPress={pickImage} activeOpacity={0.75}>
                  <Paperclip size={20} color={Colors.textPrimary} strokeWidth={2} />
                  <Text style={styles.attachText}>Adicionar foto ou video</Text>
                </TouchableOpacity>
              )}

              {/* ── Submit ──────────────────────────────────── */}
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={canSubmit ? handleSubmit : undefined}
                activeOpacity={canSubmit ? 0.85 : 1}
              >
                <Send size={18} color={canSubmit ? Colors.textInverse : Colors.textMuted} strokeWidth={2} />
                <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                  Enviar solicitacao
                </Text>
              </TouchableOpacity>
              <Text style={styles.disclaimer}>
                Nossa equipe analisa manualmente cada caso e retorna em ate 24h.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },

  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },

  stepLabel: {
    fontSize: 10, fontFamily: 'Poppins_600SemiBold',
    color: Colors.textMuted, letterSpacing: 1.2,
    marginBottom: 10, marginTop: 20,
  },

  // Topics grid
  topicsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topicCard: {
    width: '47%', padding: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.borderLight,
    alignItems: 'flex-start', gap: 10,
  },
  topicCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  topicIcon: {
    width: 38, height: 38, borderRadius: Radius.sm,
    backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center',
  },
  topicIconActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  topicLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, lineHeight: 18 },
  topicLabelActive: { color: Colors.textInverse },

  // Ride selector
  rideSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  rideSelectorText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: Colors.textPrimary, flex: 1 },
  rideDropdown: {
    marginTop: 4, backgroundColor: Colors.card,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  rideItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  rideItemActive: { backgroundColor: Colors.primary + '22' },
  rideDate: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  rideDest: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  ridePrice: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },

  // Comment
  commentBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  commentInput: {
    fontSize: 14, fontFamily: 'Poppins_400Regular',
    color: Colors.textPrimary, lineHeight: 22, minHeight: 110,
  },
  charCount: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, textAlign: 'right', marginTop: 6 },

  // Attachment
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center',
  },
  attachText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: Colors.textPrimary },
  photoPreview: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.border },
  removePhoto: {
    position: 'absolute', top: -6, left: 60,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  photoLabel: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textPrimary },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 16, marginTop: 24,
  },
  submitBtnDisabled: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  submitText: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: Colors.textInverse },
  submitTextDisabled: { color: Colors.textMuted },
  disclaimer: {
    fontSize: 11, fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 16,
  },

  // Success state
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
  successSub: { fontSize: 15, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  successNote: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textMuted },
});

export default SupportScreen;