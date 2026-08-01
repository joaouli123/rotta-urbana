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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Eye,
  EyeOff,
  ShieldCheck,
  User,
  Mail,
  Phone,
  Lock,
  ChevronLeft,
  CheckCircle,
  FileText,
  Camera,
  MapPin,
  Home,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { pickFromCamera, chooseAndPickDocument, type PickedFile } from '../../lib/filePick';
import { uploadDocument, type DocType } from '../../services/documents';
import { supabase } from '../../lib/supabase';
import type { Gender } from '../../types/db';
import {
  AUTH_DARK,
  AUTH_GREEN,
  AuthField,
  AuthPrimaryButton,
} from '../../components/auth/auth-form';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Feminino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Outro' },
];

interface RegisterPassengerScreenProps {
  onBack: () => void;
}

const RegisterPassengerScreen: React.FC<RegisterPassengerScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const steps = ['Dados pessoais', 'Endereço', 'Documentos'];
  const [loading, setLoading] = useState(false);

  // ── Step 0: Dados Pessoais ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Step 1: Endereço ──
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [complement, setComplement] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  // ── Step 2: Documentos ──
  const [docImages, setDocImages] = useState<{
    rg: PickedFile | null;
    selfie: PickedFile | null;
  }>({ rg: null, selfie: null });

  // CEP Change handler (look up via ViaCEP)
  const handleCepChange = async (val: string) => {
    const cleaned = val.replace(/\D/g, '').substring(0, 8);
    setCep(cleaned);
    if (cleaned.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
        const data = await res.json();
        if (data.erro) {
          Alert.alert('Atenção', 'CEP não encontrado.');
        } else {
          setStreet(data.logradouro || '');
          setNeighborhood(data.bairro || '');
          setCity(data.localidade || '');
          setState(data.uf || '');
        }
      } catch {
        Alert.alert('Erro', 'Não foi possível buscar o CEP automaticamente.');
      } finally {
        setCepLoading(false);
      }
    }
  };

  const handlePickDoc = async (type: 'rg' | 'selfie') => {
    try {
      if (type === 'selfie') {
        const picked = await pickFromCamera(true);
        if (picked) setDocImages((prev) => ({ ...prev, selfie: picked }));
      } else {
        const picked = await chooseAndPickDocument();
        if (picked) setDocImages((prev) => ({ ...prev, rg: picked }));
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Erro ao selecionar arquivo.');
    }
  };

  const validateStep = () => {
    if (step === 0) {
      if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
        Alert.alert('Atenção', 'Preencha todos os campos pessoais.');
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        Alert.alert('Atenção', 'Informe um e-mail válido.');
        return false;
      }
      if (!gender) {
        Alert.alert('Atenção', 'Selecione seu gênero.');
        return false;
      }
      if (password.length < 8) {
        Alert.alert('Atenção', 'A senha precisa de ao menos 8 caracteres.');
        return false;
      }
      if (password !== confirmPassword) {
        Alert.alert('Atenção', 'As senhas não conferem.');
        return false;
      }
    } else if (step === 1) {
      if (!cep.trim() || !street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim()) {
        Alert.alert('Atenção', 'Preencha o CEP e todos os campos obrigatórios do endereço.');
        return false;
      }
    } else if (step === 2) {
      if (!docImages.rg) {
        Alert.alert('Atenção', 'Envie a foto do seu documento (RG ou CPF) para prosseguir.');
        return false;
      }
      if (!docImages.selfie) {
        Alert.alert('Atenção', 'Tire a selfie de verificação para concluir.');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      submit();
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      onBack();
    }
  };

  const submit = async () => {
    setLoading(true);
    // 1. Sign up the user with auth context
    const { error } = await signUp({
      fullName: name,
      email,
      phone,
      password,
      role: 'passenger',
      gender: gender ?? undefined,
      metadata: {
        address_cep: cep,
        address_street: street,
        address_number: number,
        address_neighborhood: neighborhood,
        address_city: city,
        address_state: state,
        address_complement: complement,
      },
    });

    if (error) {
      setLoading(false);
      Alert.alert('Erro no cadastro', friendlyError(error));
      return;
    }

    // 2. Upload documents after session is created
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        if (docImages.rg) {
          await uploadDocument('rg', docImages.rg.base64, {
            contentType: docImages.rg.contentType,
            ext: docImages.rg.ext,
          });
        }
        if (docImages.selfie) {
          await uploadDocument('selfie', docImages.selfie.base64, {
            contentType: docImages.selfie.contentType,
            ext: docImages.selfie.ext,
          });
        }

        // 3. Save document paths to user metadata
        await supabase.auth.updateUser({
          data: {
            doc_rg_path: `${uid}/rg.${docImages.rg?.ext || 'jpg'}`,
            doc_selfie_path: `${uid}/selfie.${docImages.selfie?.ext || 'jpg'}`,
          },
        });
      }
    } catch (uploadErr) {
      console.warn('Silent document upload failure:', uploadErr);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <AuthField
              label="Nome completo"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              autoCapitalize="words"
              leftIcon={<User size={18} color="#999" />}
            />
            <AuthField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              keyboardType="email-address"
              leftIcon={<Mail size={18} color="#999" />}
            />
            <AuthField
              label="Telefone / WhatsApp"
              value={phone}
              onChangeText={setPhone}
              placeholder="(00) 00000-0000"
              keyboardType="phone-pad"
              leftIcon={<Phone size={18} color="#999" />}
            />
            <AuthField
              label="Senha"
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              secureTextEntry={!showPw}
              leftIcon={<Lock size={18} color="#999" />}
              rightElement={
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} activeOpacity={0.7}>
                  {showPw ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
                </TouchableOpacity>
              }
            />
            <AuthField
              label="Confirmar senha"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repita sua senha"
              secureTextEntry={!showConfirm}
              leftIcon={<Lock size={18} color="#999" />}
              rightElement={
                <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} activeOpacity={0.7}>
                  {showConfirm ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
                </TouchableOpacity>
              }
            />

            {/* Gênero */}
            <Text style={s.genderLabel}>Gênero</Text>
            <View style={s.genderRow}>
              {GENDER_OPTIONS.map((g) => {
                const active = gender === g.value;
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[s.genderChip, active && s.genderChipActive]}
                    onPress={() => setGender(g.value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.genderChipTxt, active && s.genderChipTxtActive]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.genderHint}>Essa informação ajuda a oferecer preferências e recursos de segurança.</Text>
          </>
        );
      case 1:
        return (
          <>
            <AuthField
              label="CEP"
              value={cep}
              onChangeText={handleCepChange}
              placeholder="00000-000"
              keyboardType="numeric"
              leftIcon={<MapPin size={18} color="#999" />}
              rightElement={cepLoading ? <ActivityIndicator size="small" color={AUTH_GREEN} /> : undefined}
            />
            <AuthField
              label="Rua / Avenida"
              value={street}
              onChangeText={setStreet}
              placeholder="Nome da rua"
              leftIcon={<Home size={18} color="#999" />}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <AuthField
                  label="Número"
                  value={number}
                  onChangeText={setNumber}
                  placeholder="123"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 2 }}>
                <AuthField
                  label="Complemento (Opcional)"
                  value={complement}
                  onChangeText={setComplement}
                  placeholder="Apt 402 / Casa"
                />
              </View>
            </View>
            <AuthField
              label="Bairro"
              value={neighborhood}
              onChangeText={setNeighborhood}
              placeholder="Bairro"
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 3 }}>
                <AuthField
                  label="Cidade"
                  value={city}
                  onChangeText={setCity}
                  placeholder="Cidade"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AuthField
                  label="Estado"
                  value={state}
                  onChangeText={setState}
                  placeholder="UF"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
            </View>
          </>
        );
      case 2:
        return (
          <>
            <Text style={s.stepDesc}>Envie fotos ou arquivos de identificação e selfie de segurança. Seus dados são protegidos.</Text>
            
            {/* RG Document Card */}
            <TouchableOpacity
              style={s.docCard}
              activeOpacity={0.8}
              onPress={() => handlePickDoc('rg')}
            >
              {docImages.rg && docImages.rg.contentType.startsWith('image') ? (
                <Image
                  source={{ uri: `data:${docImages.rg.contentType};base64,${docImages.rg.base64}` }}
                  style={s.docThumb}
                />
              ) : (
                <View style={s.docIconWrap}>
                  <FileText size={20} color={AUTH_GREEN} strokeWidth={2} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.docLabel}>Documento de Identidade</Text>
                <Text style={s.docHint}>
                  {docImages.rg ? 'Selecionado — toque para trocar' : 'Foto do RG ou CPF'}
                </Text>
              </View>
              <View style={[s.docAction, docImages.rg && s.docActionDone]}>
                {docImages.rg ? (
                  <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <Text style={s.docActionText}>Enviar</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Selfie Verification Card */}
            <TouchableOpacity
              style={s.docCard}
              activeOpacity={0.8}
              onPress={() => handlePickDoc('selfie')}
            >
              {docImages.selfie ? (
                <Image
                  source={{ uri: `data:${docImages.selfie.contentType};base64,${docImages.selfie.base64}` }}
                  style={s.docThumb}
                />
              ) : (
                <View style={s.docIconWrap}>
                  <Camera size={20} color={AUTH_GREEN} strokeWidth={2} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.docLabel}>Selfie de Verificação</Text>
                <Text style={s.docHint}>
                  {docImages.selfie ? 'Selfie capturada ✓' : 'Tirar selfie agora'}
                </Text>
              </View>
              <View style={[s.docAction, docImages.selfie && s.docActionDone]}>
                {docImages.selfie ? (
                  <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <Text style={s.docActionText}>Tirar</Text>
                )}
              </View>
            </TouchableOpacity>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={{ flex: 1, backgroundColor: '#ffffff', paddingTop: insets.top }}>
        
        {/* Simple Top Navigation with Back Button only */}
        <View style={s.topNavigation}>
          <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={24} color="#1A1A1A" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Scrollable Sheet ── */}
        <ScrollView
          style={s.sheet}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>Cadastro de passageiro</Text>

          {/* Step Indicator */}
          <View style={s.stepRow}>
            {steps.map((label, i) => (
              <View key={i} style={s.stepItem}>
                {i < steps.length - 1 && (
                  <View style={[s.stepLine, i < step && s.stepLineActive]} />
                )}
                <View style={[s.stepCircle, i <= step && s.stepCircleActive]}>
                  {i < step ? (
                    <CheckCircle size={13} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <Text style={[s.stepNum, i === step && s.stepNumActive]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text style={[s.stepLabel, i === step && s.stepLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>

          {renderStepContent()}

          {/* Botão de continuação */}
          <AuthPrimaryButton
            title={step < steps.length - 1 ? 'Continuar' : 'Concluir cadastro'}
            onPress={goNext}
            loading={loading}
            style={s.primaryButton}
          />

          {step === 0 && (
            <>
              {/* Segurança */}
              <View style={s.securityRow}>
                <ShieldCheck size={14} color={AUTH_GREEN} strokeWidth={2} />
                <Text style={s.securityTxt}>Seus dados são protegidos e usados apenas para sua conta.</Text>
              </View>

              {/* Voltar para login */}
              <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={s.signInRow}>
                <Text style={s.signInTxt}>
                  Já tem uma conta?{'  '}
                  <Text style={s.signInLink}>Entrar</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
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
  sheet: { flex: 1, backgroundColor: '#ffffff' },
  sheetContent: { paddingHorizontal: 28, paddingTop: 6, paddingBottom: 48 },
  title: {
    color: '#1A1A1A', fontFamily: 'Poppins_700Bold', fontSize: 26, marginBottom: 6,
  },
  description: {
    color: '#666666', fontFamily: 'Poppins_400Regular', fontSize: 13,
    lineHeight: 20, marginBottom: 24,
  },
  genderLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888', marginBottom: 10 },
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
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#AAA',
    marginBottom: 24, lineHeight: 16,
  },
  primaryButton: { marginTop: 10, marginBottom: 20 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 20 },
  securityTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#999' },
  signInRow: { paddingVertical: 12 },
  signInTxt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#666', textAlign: 'center' },
  signInLink: { fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },

  // Step indicator
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    marginBottom: 24,
  },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  stepLine: {
    position: 'absolute', top: 14, left: '58%', right: '-58%',
    height: 2, backgroundColor: '#E0E0E0',
  },
  stepLineActive: { backgroundColor: AUTH_GREEN },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E0E0E0',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    zIndex: 1,
  },
  stepCircleActive: {
    backgroundColor: AUTH_DARK, borderColor: AUTH_DARK,
  },
  stepNum: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#999',
  },
  stepNumActive: {
    fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#999',
  },
  stepLabelActive: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A',
  },

  // Docs cards
  stepDesc: {
    fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#666',
    lineHeight: 18, marginBottom: 20,
  },
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 12,
    padding: 14, marginBottom: 16, backgroundColor: '#FAFAFA',
  },
  docThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#E0E0E0' },
  docIconWrap: {
    width: 44, height: 44, borderRadius: 8, backgroundColor: '#F0FAE8',
    alignItems: 'center', justifyContent: 'center',
  },
  docLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#1A1A1A' },
  docHint: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#888', marginTop: 2 },
  docAction: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#F0F0F0',
  },
  docActionDone: { backgroundColor: AUTH_GREEN },
  docActionText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#666' },
});

export default RegisterPassengerScreen;
