import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickFromCamera, chooseAndPickDocument, type PickedFile } from '../../lib/filePick';
import {
  User,
  Mail,
  Lock,
  Phone,
  Car,
  Bike,
  FileText,
  Camera,
  CheckCircle,
  IdCard,
  Eye,
  EyeOff,
  ChevronLeft,
  MapPin,
} from 'lucide-react-native';
import { Colors, Radius } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { addVehicle, updateDriverPix, updateMyOperatingCity } from '../../services/drivers';
import { uploadDocument, type DocType } from '../../services/documents';
import FipePicker from '../../components/FipePicker';
import type { Gender } from '../../types/db';
import {
  AUTH_DARK,
  AUTH_GREEN,
  AuthField,
  AuthHeader,
  AuthPrimaryButton,
} from '../../components/auth/auth-form';

type VehicleKind = 'sedan' | 'moto';


// ── Campo de input simples (Idêntico ao passageiro) ──────────────────────────
// ── Onda multi-camadas (Idêntico ao passageiro) ──────────────────────────────
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Feminino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Outro' },
];

interface RegisterDriverScreenProps {
  onBack: () => void;
}

const steps = ['Dados', 'Veículo', 'Documentos', 'Selfie'];

function inferPixType(key: string): string {
  const k = key.trim();
  if (k.includes('@')) return 'email';
  const digits = k.replace(/\D/g, '');
  if (k.startsWith('+')) return 'phone';
  if (digits.length === 14) return 'cnpj';
  if (digits.length === 11) return 'cpf';
  if (digits.length >= 10 && digits.length <= 13) return 'phone';
  return 'random';
}

const RegisterDriverScreen: React.FC<RegisterDriverScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [vehicleType, setVehicleType] = useState<VehicleKind>('sedan');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleSeats, setVehicleSeats] = useState('4');
  const [operatingCity, setOperatingCity] = useState('');
  const [brand, setBrand] = useState('');
  const [fipeValue, setFipeValue] = useState<number | undefined>(undefined);
  const [fipeCode, setFipeCode] = useState('');
  const [fipeYearCode, setFipeYearCode] = useState('');
  const [fipeModelYear, setFipeModelYear] = useState<number | undefined>(undefined);
  const [fipeFuel, setFipeFuel] = useState('');
  const [fipeReference, setFipeReference] = useState('');
  const [fipeZeroKm, setFipeZeroKm] = useState(false);
  const [pixKey, setPixKey] = useState('');
  // Documents picked during signup. Uploaded right after the account is created,
  // since Storage needs an authenticated session.
  const [docImages, setDocImages] = useState<Partial<Record<DocType, PickedFile>>>({});

  // Selfie → camera only. Documents → choose camera / gallery / files (PDF).
  const pickDoc = async (type: DocType) => {
    try {
      const picked = type === 'selfie' ? await pickFromCamera(true) : await chooseAndPickDocument();
      if (!picked) return;
      setDocImages((cur) => ({ ...cur, [type]: picked }));
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível selecionar o arquivo. Tente novamente.');
    }
  };

  const submit = async () => {
    if (!docImages.cnh) { Alert.alert('Atenção', 'Envie ao menos a foto da CNH para concluir.'); setStep(2); return; }
    if (!docImages.selfie) { Alert.alert('Atenção', 'Tire a selfie de verificação para concluir.'); return; }
    setLoading(true);
    const { error } = await signUp({ fullName: name, email, phone, password, role: 'driver', gender: gender ?? undefined, cpf });
    if (error) {
      setLoading(false);
      Alert.alert('Erro no cadastro', friendlyError(error));
      return;
    }
    // Account + driver row are created by the signup trigger; persist the vehicle.
    try {
      const yearNum = parseInt(vehicleYear, 10);
      await addVehicle({
        model: vehicleModel.trim() || (vehicleType === 'moto' ? 'Moto' : 'Veículo'),
        plate: vehiclePlate.trim().toUpperCase().replace(/\s+/g, ''),
        year: yearNum,
        color: vehicleColor.trim() || 'N/D',
        type: vehicleType,
        brand: brand.trim() || undefined,
        fipeCode: fipeCode || undefined,
        fipeValue,
        fipeYearCode: fipeYearCode || undefined,
        fipeModelYear,
        fipeFuel: fipeFuel || undefined,
        fipeReference: fipeReference || undefined,
        fipeZeroKm,
        seats: vehicleType === 'moto' ? 1 : Math.min(9, Math.max(1, parseInt(vehicleSeats, 10) || 4)),
      });
      await updateMyOperatingCity(operatingCity);
      if (pixKey.trim()) await updateDriverPix(pixKey, inferPixType(pixKey));
    } catch {
      // non-fatal: the driver can add/edit the vehicle/PIX later
    }
    // Upload the documents now that the session exists (best-effort; anything
    // that fails can be redone in Perfil > Documentos). Detached so it doesn't
    // block the navigation that the new session triggers.
    (async () => {
      for (const t of ['cnh', 'rg', 'vehicle_doc', 'selfie'] as DocType[]) {
        const f = docImages[t];
        if (f) { try { await uploadDocument(t, f.base64, { contentType: f.contentType, ext: f.ext }); } catch { /* retry later in Documentos */ } }
      }
    })();
    setLoading(false);
    // Session created -> navigator routes to the driver home (pending verification).
  };

  const goNext = () => {
    if (step === 0) {
      if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
        Alert.alert('Atenção', 'Preencha todos os dados pessoais.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        Alert.alert('Atenção', 'Informe um e-mail válido.');
        return;
      }
      if (cpf.replace(/\D/g, '').length !== 11) {
        Alert.alert('Atenção', 'Informe um CPF válido (11 dígitos).');
        return;
      }
      if (password.length < 8) {
        Alert.alert('Atenção', 'A senha precisa de ao menos 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Atenção', 'As senhas não conferem.');
        return;
      }
      if (!gender) {
        Alert.alert('Atenção', 'Selecione seu gênero.');
        return;
      }
    }
    if (step === 1 && !vehiclePlate.trim()) {
      Alert.alert('Atenção', 'Informe a placa do veículo.');
      return;
    }
    if (step === 1 && !operatingCity.trim()) {
      Alert.alert('Atencao', 'Informe a cidade de atuacao do motorista.');
      return;
    }
    if (step === 1) {
      const year = parseInt(vehicleYear, 10);
      const maxYear = new Date().getFullYear() + 1;
      if (!Number.isInteger(year) || year < 1980 || year > maxYear) {
        Alert.alert('Ano invalido', `Informe um ano entre 1980 e ${maxYear}. Para veiculo zero-km, selecione a opcao "0 km" na FIPE.`);
        return;
      }
    }
    if (step === 2 && !docImages.cnh) {
      Alert.alert('Atenção', 'Envie ao menos a foto da CNH para continuar.');
      return;
    }
    if (step < steps.length - 1) setStep(step + 1);
    else submit();
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
    else onBack();
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <Text style={styles.stepTitle}>Dados pessoais</Text>
            <Text style={styles.stepDesc}>Preencha seus dados para criar seu perfil de motorista.</Text>
            <AuthField label="Nome completo" value={name} onChangeText={setName}
              placeholder="Seu nome" autoCapitalize="words"
              leftIcon={<User size={18} color="#999" />} />
            <AuthField label="CPF" value={cpf} onChangeText={setCpf}
              placeholder="000.000.000-00" keyboardType="numeric"
              leftIcon={<IdCard size={18} color="#999" />} />
            <AuthField label="E-mail" value={email} onChangeText={setEmail}
              placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none"
              leftIcon={<Mail size={18} color="#999" />} />
            <AuthField label="Telefone / WhatsApp" value={phone} onChangeText={setPhone}
              placeholder="(00) 00000-0000" keyboardType="phone-pad"
              leftIcon={<Phone size={18} color="#999" />} />

            <Text style={styles.genderLabel}>Gênero</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((g) => {
                const active = gender === g.value;
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.genderChip, active && styles.genderChipActive]}
                    onPress={() => setGender(g.value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.genderChipTxt, active && styles.genderChipTxtActive]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.genderHint}>Essa informação ajuda a oferecer preferências e recursos de segurança.</Text>

            <AuthField label="Senha" value={password} onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres" secureTextEntry={!showPw}
              leftIcon={<Lock size={18} color="#999" />}
              rightElement={
                <TouchableOpacity onPress={() => setShowPw(v => !v)} activeOpacity={0.7}>
                  {showPw ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
                </TouchableOpacity>
              } />

            <AuthField label="Confirmar senha" value={confirmPassword} onChangeText={setConfirmPassword}
              placeholder="Repita sua senha" secureTextEntry={!showConfirm}
              leftIcon={<Lock size={18} color="#999" />}
              rightElement={
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} activeOpacity={0.7}>
                  {showConfirm ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
                </TouchableOpacity>
              } />
          </>
        );
      case 1:
        return (
          <>
            <Text style={styles.stepTitle}>Dados do veículo</Text>
            <Text style={styles.stepDesc}>Escolha o tipo de veículo e consulte a tabela FIPE para definir as categorias atendidas.</Text>

            {/* Tipo de veículo — Carro vs Moto */}
            <View style={styles.typeRow}>
              {([
                { key: 'sedan' as VehicleKind, label: 'Carro', Icon: Car },
                { key: 'moto' as VehicleKind,  label: 'Moto',  Icon: Bike },
              ]).map(({ key, label, Icon }) => {
                const active = vehicleType === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                    onPress={() => {
                      setVehicleType(key);
                      // reset FIPE selection so the picker reloads the right table
                      setVehicleModel(''); setVehicleYear(''); setBrand('');
                      setFipeValue(undefined); setFipeCode('');
                      setFipeYearCode(''); setFipeModelYear(undefined); setFipeFuel('');
                      setFipeReference(''); setFipeZeroKm(false);
                      setVehicleSeats(key === 'moto' ? '1' : '4');
                    }}
                    activeOpacity={0.85}
                  >
                    <Icon size={22} color={active ? '#FFFFFF' : AUTH_GREEN} strokeWidth={2} />
                    <Text style={[styles.typeCardTxt, active && styles.typeCardTxtActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <AuthField label="Cidade de atuacao" value={operatingCity} onChangeText={setOperatingCity}
              placeholder="Ex.: Sinop" autoCapitalize="words"
              leftIcon={<MapPin size={18} color="#999" />} />
            <FipePicker
              key={vehicleType}
              kind={vehicleType === 'moto' ? 'motorcycles' : 'cars'}
              onSelected={(r) => {
                setVehicleModel(`${r.brand} ${r.model}`.trim());
                setVehicleYear(String(r.year));
                setBrand(r.brand);
                setFipeValue(r.value);
                setFipeCode(r.code);
                setFipeYearCode(r.fipeYearCode);
                setFipeModelYear(r.fipeModelYear);
                setFipeFuel(r.fuel);
                setFipeReference(r.reference);
                setFipeZeroKm(r.isZeroKm);
              }}
            />
            <AuthField label="Placa" value={vehiclePlate} onChangeText={setVehiclePlate}
              placeholder="ABC-1234" autoCapitalize="characters"
              leftIcon={<FileText size={18} color="#999" />} />
            <AuthField label="Ano de fabricação" value={vehicleYear} onChangeText={setVehicleYear}
              placeholder="2020" keyboardType="numeric"
              leftIcon={vehicleType === 'moto' ? <Bike size={18} color="#999" /> : <Car size={18} color="#999" />} />
            <AuthField label={vehicleType === 'moto' ? 'Cor da moto' : 'Cor do veículo'} value={vehicleColor} onChangeText={setVehicleColor}
              placeholder="Preto, Branco, Prata..."
              leftIcon={vehicleType === 'moto' ? <Bike size={18} color="#999" /> : <Car size={18} color="#999" />} />
            {vehicleType !== 'moto' && (
              <AuthField label="Assentos para passageiros" value={vehicleSeats} onChangeText={setVehicleSeats}
                placeholder="4" keyboardType="numeric"
                leftIcon={<User size={18} color="#999" />} />
            )}
            <AuthField label="Chave Pix para receber corridas" value={pixKey} onChangeText={setPixKey}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              autoCapitalize="none"
              leftIcon={<FileText size={18} color="#999" />} />
          </>
        );
      case 2:
        return (
          <>
            <Text style={styles.stepTitle}>Documentação</Text>
            <Text style={styles.stepDesc}>Envie fotos ou arquivos em PDF. Seus dados são protegidos durante todo o processo.</Text>
            {([
              { type: 'cnh' as DocType, label: 'CNH (frente e verso)', Icon: FileText },
              { type: 'rg' as DocType, label: 'RG ou identidade', Icon: FileText },
              { type: 'vehicle_doc' as DocType, label: 'CRLV do veículo', Icon: Car },
            ]).map((doc) => {
              const picked = docImages[doc.type];
              const isImg = !!picked?.contentType.startsWith('image');
              return (
                <TouchableOpacity key={doc.type} style={styles.docCard} activeOpacity={0.8} onPress={() => pickDoc(doc.type)}>
                  {picked && isImg ? (
                    <Image source={{ uri: `data:${picked.contentType};base64,${picked.base64}` }} style={styles.docThumb} />
                  ) : (
                    <View style={styles.docIconWrap}>
                      <doc.Icon size={20} color={AUTH_GREEN} strokeWidth={2} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{doc.label}</Text>
                    <Text style={styles.docHint}>{picked ? 'Arquivo selecionado — toque para trocar' : 'Foto, galeria ou PDF'}</Text>
                  </View>
                  <View style={[styles.docAction, picked && styles.docActionDone]}>
                    {picked
                      ? <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                      : <Text style={styles.docActionText}>Enviar</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={styles.infoCard}>
              <CheckCircle size={16} color={Colors.success} strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={styles.infoText}>
                A verificação pode levar até 24 horas. Você receberá uma notificação por e-mail.
              </Text>
            </View>
          </>
        );
      case 3:
        return (
          <>
            <Text style={styles.stepTitle}>Verificação facial</Text>
            <Text style={styles.stepDesc}>
              Tire uma selfie pela câmera para confirmar sua identidade e aumentar a segurança da plataforma.
            </Text>
            <TouchableOpacity style={styles.selfieBox} activeOpacity={0.85} onPress={() => pickDoc('selfie')}>
              <View style={styles.selfieInner}>
                {docImages.selfie ? (
                  <Image source={{ uri: `data:${docImages.selfie.contentType};base64,${docImages.selfie.base64}` }} style={styles.selfiePreview} />
                ) : (
                  <View style={styles.selfieIconWrap}>
                    <Camera size={40} color={AUTH_GREEN} strokeWidth={1.5} />
                  </View>
                )}
                <Text style={styles.selfieLabel}>{docImages.selfie ? 'Selfie capturada ✓' : 'Tirar selfie agora'}</Text>
                <Text style={styles.selfieHint}>
                  {docImages.selfie ? 'Toque para refazer' : 'Certifique-se de estar em local bem iluminado'}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.infoCard}>
              <CheckCircle size={16} color={Colors.info} strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={styles.infoText}>
                A selfie é comparada com a CNH enviada. Não é permitido cadastrar contas de terceiros.
              </Text>
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={[styles.container, { backgroundColor: '#ffffff', paddingTop: insets.top }]}>
        
        {/* Simple Top Navigation with Back Button only */}
        <View style={styles.topNavigation}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={24} color="#1A1A1A" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetTitle}>Cadastro de motorista</Text>

          {/* Step Indicator */}
          <View style={styles.stepRow}>
            {steps.map((s, i) => (
              <View key={i} style={styles.stepItem}>
                {i < steps.length - 1 && (
                  <View style={[styles.stepLine, i < step && styles.stepLineActive]} />
                )}
                <View style={[styles.stepCircle, i <= step && styles.stepCircleActive]}>
                  {i < step ? (
                    <CheckCircle size={13} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <Text style={[styles.stepNum, i === step && styles.stepNumActive]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{s}</Text>
              </View>
            ))}
          </View>

          {renderStepContent()}
          <AuthPrimaryButton
            title={step < steps.length - 1 ? 'Continuar' : 'Concluir cadastro'}
            onPress={goNext}
            loading={loading}
            style={styles.primaryButton}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topNavigation: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#1A1A1A',
    marginBottom: 8,
  },

  // Step Indicator
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    marginBottom: 20,
  },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  stepLine: {
    position: 'absolute', top: 14, left: '58%', right: '-58%',
    height: 2, backgroundColor: Colors.border,
  },
  stepLineActive: { backgroundColor: AUTH_GREEN },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    zIndex: 1,
  },
  stepCircleActive: {
    backgroundColor: AUTH_DARK, borderColor: AUTH_DARK,
  },
  stepNum: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted,
  },
  stepNumActive: {
    fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted,
  },
  stepLabelActive: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },

  sheet: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 28, paddingTop: 6, paddingBottom: 40 },
  stepTitle: {
    fontSize: 26, fontFamily: 'Poppins_700Bold',
    color: '#1A1A1A', marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: '#666666', marginBottom: 24, lineHeight: 20,
  },

  // Gender selector (Feminino / Masculino / Outro)
  genderLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888', marginTop: 6, marginBottom: 10 },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  genderChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0',
    alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  genderChipActive: { backgroundColor: AUTH_DARK, borderColor: AUTH_DARK },
  genderChipTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#888' },
  genderChipTxtActive: { color: '#ffffff' },
  genderHint: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#AAAAAA',
    marginBottom: 20, lineHeight: 16,
  },

  // Vehicle type selector (Carro / Moto)
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E0E0E0',
  },
  typeCardActive: { backgroundColor: AUTH_DARK, borderColor: AUTH_DARK },
  typeCardTxt: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  typeCardTxtActive: { color: '#FFFFFF' },

  // Doc cards
  docCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 14,
    padding: 14, marginBottom: 10, gap: 12,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  docIconWrap: {
    width: 42, height: 42, borderRadius: Radius.sm,
    backgroundColor: '#F0FAE8', alignItems: 'center', justifyContent: 'center',
  },
  docThumb: { width: 42, height: 42, borderRadius: Radius.sm, backgroundColor: Colors.border },
  docActionDone: { backgroundColor: AUTH_GREEN },
  docLabel: {
    fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 2,
  },
  docHint: {
    fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted,
  },
  docAction: {
    backgroundColor: AUTH_DARK, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  docActionText: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF',
  },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FAFAFA', borderRadius: Radius.md,
    padding: 14, marginTop: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  infoText: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },

  // Selfie
  selfieBox: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 2, borderColor: AUTH_GREEN + '66',
    borderStyle: 'dashed', marginBottom: 16,
  },
  selfieInner: {
    padding: 44, alignItems: 'center', gap: 14,
    backgroundColor: '#F7FCEF',
  },
  selfieIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F0FAE8',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: AUTH_GREEN + '55',
  },
  selfiePreview: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 2, borderColor: AUTH_GREEN,
  },
  selfieLabel: {
    fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },
  selfieHint: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, textAlign: 'center',
  },
  primaryButton: { marginTop: 24, marginBottom: 40 },
});

export default RegisterDriverScreen;
