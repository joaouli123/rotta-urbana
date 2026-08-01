import React, { useState } from 'react';
import {
  View, Text, Image, ImageBackground, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert, TextInput, useWindowDimensions,
} from 'react-native';
import { Eye, EyeOff, User, Car, Mail, Lock, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RU_GREEN = '#76C442';
const DARK = '#131313';




// ── Campo de input simples ────────────────────────────────────────────────────
interface SimpleInputProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric';
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
  wrap: { marginBottom: 20 },
  label: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  leftIcon: { marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#1A1A1A', paddingVertical: 8 },
  right: { paddingLeft: 8 },
  line: { height: 1, backgroundColor: '#E0E0E0', marginTop: 2 },
});

// ── LoginScreen ───────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onRegister: () => void;
  onRegisterDriver: () => void;
}

const HERO_HEIGHT_RATIO = 0.58;

const LoginScreen: React.FC<LoginScreenProps> = ({ onRegister, onRegisterDriver }) => {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Atenção', 'Preencha e-mail e senha.'); return; }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) Alert.alert('Erro ao entrar', friendlyError(error));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />
      <View style={{ flex: 1, backgroundColor: DARK }}>

        {/* ── Header com imagem de fundo do usuário ── */}
        <ImageBackground
          source={require('../../../assets/auth-city-curve-v3.png')}
          resizeMode="cover"
          imageStyle={s.heroImage}
          style={[
          s.header,
          { height: width * HERO_HEIGHT_RATIO },
        ]}
        >
          <Image
            source={require('../../../assets/logo.png')}
            style={[s.logo, { top: insets.top + 8, width: width * 0.5 }]}
            resizeMode="contain"
          />
        </ImageBackground>

        {/* ── Conteúdo branco ── */}
        <ScrollView
          style={s.sheet}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>Login</Text>

          <SimpleInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            leftIcon={<Mail size={18} color="#999" />}
          />
          <SimpleInput
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPw}
            leftIcon={<Lock size={18} color="#999" />}
            rightEl={
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} activeOpacity={0.7}>
                {showPw
                  ? <EyeOff size={18} color="#999" />
                  : <Eye size={18} color="#999" />}
              </TouchableOpacity>
            }
          />

          <TouchableOpacity style={s.forgotBtn} activeOpacity={0.7}>
            <Text style={s.forgotTxt}>Esqueci minha senha</Text>
          </TouchableOpacity>

          {/* Botão Login */}
          <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <Text style={s.btnTxt}>{loading ? 'Entrando...' : 'Login'}</Text>
          </TouchableOpacity>

          {/* Divisor */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>ou</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Registro */}
          <Text style={s.registerLabel}>Primeira vez aqui?</Text>

          <TouchableOpacity style={s.registerCard} onPress={onRegister} activeOpacity={0.85}>
            <View style={s.cardLeft}>
              <View style={s.cardIcon}><User size={17} color={RU_GREEN} strokeWidth={2} /></View>
              <Text style={s.registerCardTxt}>Criar conta de Passageiro</Text>
            </View>
            <ChevronRight size={16} color="#C8C8C8" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity style={s.registerCard} onPress={onRegisterDriver} activeOpacity={0.85}>
            <View style={s.cardLeft}>
              <View style={s.cardIcon}><Car size={17} color={RU_GREEN} strokeWidth={2} /></View>
              <Text style={s.registerCardTxt}>Quero ser Motorista</Text>
            </View>
            <ChevronRight size={16} color="#C8C8C8" strokeWidth={2} />
          </TouchableOpacity>
        </ScrollView>

      </View>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  logo: {
    position: 'absolute',
    height: 80,
  },
  sheet: { flex: 1, backgroundColor: '#ffffff' },
  sheetContent: { paddingHorizontal: 28, paddingTop: 14, paddingBottom: 48 },
  title: {
    fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 14,
  },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 24, marginTop: -8 },
  forgotTxt: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888' },
  btn: {
    backgroundColor: '#1A1A1A', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 28,
  },
  btnTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#ffffff' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E8E8E8' },
  dividerTxt: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#AAA' },
  registerLabel: {
    fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#888',
    textAlign: 'center', marginBottom: 12,
  },
  registerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F0FAE8', alignItems: 'center', justifyContent: 'center',
  },
  registerCardTxt: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#1A1A1A' },
});

export default LoginScreen;
