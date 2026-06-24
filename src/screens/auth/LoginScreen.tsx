import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert, TextInput, Dimensions,
} from 'react-native';
import Svg, { Path, Polygon, Circle, G } from 'react-native-svg';
import { Eye, EyeOff } from 'lucide-react-native';
import { Colors } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');
const RU_GREEN = '#76C442';
const DARK = '#131313';

// ── Fundo geométrico do header ────────────────────────────────────────────────
const GeometricBg: React.FC<{ height: number }> = ({ height }) => (
  <Svg width={W} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
    {/* Grade de formas geométricas repetidas, tom sutil sobre o fundo escuro */}
    <G opacity={0.18}>
      {/* Triângulos apontando para cima */}
      {[0, 56, 112, 168, 224, 280, 336].map((x) =>
        [0, 52, 104, 156, 208].map((y) => (
          <Polygon
            key={`u${x}${y}`}
            points={`${x + 20},${y} ${x},${y + 34} ${x + 40},${y + 34}`}
            fill="#ffffff"
          />
        ))
      )}
      {/* Triângulos apontando para baixo (offset) */}
      {[28, 84, 140, 196, 252, 308].map((x) =>
        [26, 78, 130, 182].map((y) => (
          <Polygon
            key={`d${x}${y}`}
            points={`${x},${y} ${x + 40},${y} ${x + 20},${y + 34}`}
            fill="#ffffff"
          />
        ))
      )}
      {/* Círculos */}
      {[14, 70, 126, 182, 238, 294, 350].map((x) =>
        [13, 65, 117, 169, 221].map((y) => (
          <Circle key={`c${x}${y}`} cx={x} cy={y} r={5} fill="#ffffff" />
        ))
      )}
      {/* Losangos */}
      {[42, 98, 154, 210, 266, 322].map((x) =>
        [39, 91, 143, 195].map((y) => (
          <Polygon
            key={`l${x}${y}`}
            points={`${x + 10},${y} ${x + 20},${y + 10} ${x + 10},${y + 20} ${x},${y + 10}`}
            fill="#ffffff"
          />
        ))
      )}
    </G>
  </Svg>
);

// ── Onda branca com borda verde ───────────────────────────────────────────────
const WAVE_H = 54;
const WAVE_PATH = `M0,${WAVE_H} Q${W / 2},0 ${W},${WAVE_H} L${W},${WAVE_H} L0,${WAVE_H} Z`;
const BORDER_PATH = `M0,${WAVE_H} Q${W / 2},0 ${W},${WAVE_H}`;

const WaveDivider: React.FC = () => (
  <View style={{ marginTop: -1 }}>
    <Svg width={W} height={WAVE_H}>
      {/* Fill branco */}
      <Path d={WAVE_PATH} fill="#ffffff" />
      {/* Borda verde */}
      <Path d={BORDER_PATH} fill="none" stroke={RU_GREEN} strokeWidth={3} />
    </Svg>
  </View>
);

// ── Campo de input simples ────────────────────────────────────────────────────
interface SimpleInputProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secureTextEntry?: boolean;
  rightEl?: React.ReactNode;
}

const SimpleInput: React.FC<SimpleInputProps> = ({
  label, value, onChangeText, placeholder, keyboardType = 'default',
  autoCapitalize = 'none', secureTextEntry, rightEl,
}) => (
  <View style={fi.wrap}>
    <Text style={fi.label}>{label}</Text>
    <View style={fi.row}>
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
  input: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', color: '#1A1A1A', paddingVertical: 8 },
  right: { paddingLeft: 8 },
  line: { height: 1, backgroundColor: '#E0E0E0', marginTop: 2 },
});

// ── LoginScreen ───────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onRegister: () => void;
  onRegisterDriver: () => void;
}

const HEADER_H = 270;

const LoginScreen: React.FC<LoginScreenProps> = ({ onRegister, onRegisterDriver }) => {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
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

        {/* ── Header escuro ── */}
        <View style={[s.header, { paddingTop: insets.top + 20 }]}>
          <GeometricBg height={HEADER_H} />
          <Image
            source={require('../../../assets/logo.png')}
            style={s.logo}
            resizeMode="contain"
          />
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
          <Text style={s.title}>Login</Text>

          <SimpleInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
          />
          <SimpleInput
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPw}
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
            <View style={s.dot} />
            <Text style={s.registerCardTxt}>Criar conta de Passageiro</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.registerCard} onPress={onRegisterDriver} activeOpacity={0.85}>
            <View style={s.dot} />
            <Text style={s.registerCardTxt}>Quero ser Motorista</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: W * 0.6,
    height: 110,
  },
  sheet: { flex: 1, backgroundColor: '#ffffff' },
  sheetContent: { paddingHorizontal: 32, paddingTop: 8, paddingBottom: 48 },
  title: {
    fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', marginBottom: 28,
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#E8E8E8', borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RU_GREEN },
  registerCardTxt: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#1A1A1A' },
});

export default LoginScreen;
