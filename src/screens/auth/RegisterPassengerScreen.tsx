import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity, StatusBar, Alert, TextInput, Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ChevronLeft, Eye, EyeOff, ShieldCheck, User, Mail, Phone, Lock } from 'lucide-react-native';
import { Colors } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Gender } from '../../types/db';

const { width: W } = Dimensions.get('window');
const RU_GREEN = '#76C442';
const DARK = '#131313';

// ── Onda branca com borda verde ───────────────────────────────────────────────
const WAVE_H = 56;
const _HW    = W / 2;
const _FILL   = 'M0,' + WAVE_H + ' Q' + _HW + ',0 ' + W + ',' + WAVE_H + ' L' + W + ',' + WAVE_H + ' L0,' + WAVE_H + ' Z';
const _BORDER = 'M0,' + WAVE_H + ' Q' + _HW + ',0 ' + W + ',' + WAVE_H;

const WaveDivider: React.FC = () => (
  <View style={{ marginTop: -1 }}>
    <Svg width={W} height={WAVE_H}>
      <Path d={_FILL}   fill="#ffffff" />
      <Path d={_BORDER} fill="none" stroke={RU_GREEN} strokeWidth={3.5} />
    </Svg>
  </View>
);



// ── Campo de input simples ────────────────────────────────────────────────────
interface SimpleInputProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secureTextEntry?: boolean;
  leftIcon?: React.ReactNode;
  rightEl?: React.ReactNode;
}

const SimpleInput: React.FC<SimpleInputProps> = ({
  label, value, onChangeText, placeholder, keyboardType = 'default',
  autoCapitalize = 'none', secureTextEntry, leftIcon, rightEl,
}) => (
  <View style={fi.wrap}>
    <Text style={fi.label}>{label}</Text>
    <View style={fi.row}>
      {leftIcon && <View style={fi.leftIcon}>{leftIcon}</View>}
      <TextInput
        style={fi.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B0B0B0"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
      />
      {rightEl && <View style={fi.right}>{rightEl}</View>}
    </View>
    <View style={fi.line} />
  </View>
);

const fi = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  leftIcon: { marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#1A1A1A', paddingVertical: 8 },
  right: { paddingLeft: 8 },
  line: { height: 1, backgroundColor: '#E0E0E0', marginTop: 2 },
});

// ── Gênero chips ──────────────────────────────────────────────────────────────
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Feminino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Outro' },
];

// ── RegisterPassengerScreen ───────────────────────────────────────────────────
interface RegisterPassengerScreenProps {
  onBack: () => void;
}

const HEADER_H = 120;

const RegisterPassengerScreen: React.FC<RegisterPassengerScreenProps> = ({ onBack }) => {
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos.'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Atenção', 'Informe um e-mail válido.'); return;
    }
    if (!gender) {
      Alert.alert('Atenção', 'Selecione seu sexo.'); return;
    }
    if (password.length < 8) {
      Alert.alert('Atenção', 'A senha precisa de ao menos 8 caracteres.'); return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Atenção', 'As senhas não conferem.'); return;
    }
    setLoading(true);
    const { error } = await signUp({ fullName: name, email, phone, password, role: 'passenger', gender: gender ?? undefined });
    setLoading(false);
    if (error) Alert.alert('Erro no cadastro', friendlyError(error));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />
      <View style={{ flex: 1, backgroundColor: DARK }}>

        {/* ── Header escuro ── */}
        <View style={[s.header, { paddingTop: insets.top + 4 }]}>
          {/* Barra de topo */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.8}>
              <ChevronLeft size={22} color="#ffffff" strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={s.topTitle}>Sign Up</Text>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* ── Onda ── */}
        <WaveDivider />

        {/* ── Conteúdo branco ── */}
        <ScrollView
          style={s.sheet}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SimpleInput
            label="Nome completo"
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            autoCapitalize="words"
            leftIcon={<User size={18} color="#999" />}
          />
          <SimpleInput
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            leftIcon={<Mail size={18} color="#999" />}
          />
          <SimpleInput
            label="Telefone / WhatsApp"
            value={phone}
            onChangeText={setPhone}
            placeholder="(65) 9 9999-9999"
            keyboardType="phone-pad"
            leftIcon={<Phone size={18} color="#999" />}
          />
          <SimpleInput
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            secureTextEntry={!showPw}
            leftIcon={<Lock size={18} color="#999" />}
            rightEl={
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} activeOpacity={0.7}>
                {showPw ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
              </TouchableOpacity>
            }
          />
          <SimpleInput
            label="Confirmar senha"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita sua senha"
            secureTextEntry={!showConfirm}
            leftIcon={<Lock size={18} color="#999" />}
            rightEl={
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} activeOpacity={0.7}>
                {showConfirm ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
              </TouchableOpacity>
            }
          />

          {/* Gênero */}
          <Text style={s.genderLabel}>Sexo</Text>
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
          <Text style={s.genderHint}>Usamos para priorizar motoristas mulheres quando solicitado.</Text>

          {/* Botão */}
          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.btnTxt}>{loading ? 'Criando...' : 'Sign Up'}</Text>
          </TouchableOpacity>

          {/* Segurança */}
          <View style={s.securityRow}>
            <ShieldCheck size={14} color={RU_GREEN} strokeWidth={2} />
            <Text style={s.securityTxt}>Seus dados são protegidos com criptografia SSL</Text>
          </View>

          {/* Voltar para login */}
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={s.signInRow}>
            <Text style={s.signInTxt}>
              Já tem uma conta?{'  '}
              <Text style={s.signInLink}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>

      </View>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  header: {
    height: HEADER_H,
    backgroundColor: DARK,
    justifyContent: 'flex-end',
  },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: '#ffffff' },
  sheet: { flex: 1, backgroundColor: '#ffffff' },
  sheetContent: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 48 },
  genderLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888', marginBottom: 10 },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  genderChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0',
    alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  genderChipActive: { backgroundColor: DARK, borderColor: DARK },
  genderChipTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#888' },
  genderChipTxtActive: { color: '#ffffff' },
  genderHint: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#AAA',
    marginBottom: 24, lineHeight: 16,
  },
  btn: {
    backgroundColor: '#1A1A1A', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 20,
  },
  btnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#ffffff' },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 20 },
  securityTxt: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#AAA' },
  signInRow: { alignItems: 'center' },
  signInTxt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#888' },
  signInLink: { fontFamily: 'Poppins_700Bold', color: '#1A1A1A' },
});

export default RegisterPassengerScreen;
