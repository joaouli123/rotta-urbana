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
  Camera,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { pickFromCamera, type PickedFile } from '../../lib/filePick';
import { uploadPassengerSelfie } from '../../services/documents';
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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

function formatCpf(value: string): string {
  return onlyDigits(value)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

interface RegisterPassengerScreenProps {
  onBack: () => void;
}

const RegisterPassengerScreen: React.FC<RegisterPassengerScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const steps = ['Dados pessoais', 'Verificação'];
  const [loading, setLoading] = useState(false);

  // ── Step 0: Dados Pessoais ──
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Step 1: Selfie ──
  const [selfie, setSelfie] = useState<PickedFile | null>(null);

  const handlePickSelfie = async () => {
    try {
      const picked = await pickFromCamera(true);
      if (picked) setSelfie(picked);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível capturar a selfie.');
    }
  };

  const validateStep = () => {
    if (step === 0) {
      if (!name.trim() || !cpf.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
        Alert.alert('Atenção', 'Preencha todos os campos pessoais.');
        return false;
      }
      if (!isValidCpf(cpf)) {
        Alert.alert('Atenção', 'Informe um CPF válido.');
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
      if (!selfie) {
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
      cpf: onlyDigits(cpf),
    });

    if (error) {
      setLoading(false);
      Alert.alert('Erro no cadastro', friendlyError(error));
      return;
    }

    // 2. Upload only the selfie after the session is created. Passenger
    // registration never asks for or persists an RG/document photo.
    try {
      if (selfie) await uploadPassengerSelfie(selfie.base64, {
        contentType: selfie.contentType,
        ext: selfie.ext,
      });
      Alert.alert('Cadastro concluído', 'Sua conta foi criada. A selfie será usada na validação do cadastro.');
    } catch (uploadErr) {
      console.warn('Passenger selfie upload failure:', uploadErr);
      Alert.alert('Cadastro criado', 'A conta foi criada, mas a selfie não foi enviada. Tente novamente pelo suporte.');
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
              label="CPF"
              value={formatCpf(cpf)}
              onChangeText={(value) => setCpf(onlyDigits(value))}
              placeholder="000.000.000-00"
              keyboardType="numeric"
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
            <Text style={s.stepDesc}>Informe o CPF e tire uma selfie para validar sua conta. Não é necessário enviar foto de RG ou CPF.</Text>
            <TouchableOpacity
              style={s.docCard}
              activeOpacity={0.8}
              onPress={handlePickSelfie}
            >
              {selfie ? (
                <Image
                  source={{ uri: `data:${selfie.contentType};base64,${selfie.base64}` }}
                  style={s.docThumb}
                />
              ) : (
                <View style={s.docIconWrap}>
                  <Camera size={20} color={AUTH_GREEN} strokeWidth={2} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.docLabel}>Selfie de verificação</Text>
                <Text style={s.docHint}>
                  {selfie ? 'Selfie capturada ✓' : 'Tirar selfie agora'}
                </Text>
              </View>
              <View style={[s.docAction, selfie && s.docActionDone]}>
                {selfie ? (
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
