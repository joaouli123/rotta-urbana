import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Car, User, ArrowRight } from 'lucide-react-native';
import { Button, Input, Divider } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LoginScreenProps {
  onRegister: () => void;
  onRegisterDriver: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onRegister, onRegisterDriver }) => {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeRole, setActiveRole] = useState<'passenger' | 'driver'>('passenger');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    // On success the session changes and the navigator routes automatically.
    if (error) Alert.alert('Erro ao entrar', friendlyError(error));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.logoBox}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoLetter}>R</Text>
            </LinearGradient>
          </View>
          <Text style={styles.brand}>Rotta Urbana</Text>
          <Text style={styles.tagline}>Bem-vindo de volta</Text>
        </View>

        {/* Role Toggle */}
        <View style={styles.roleToggle}>
          <TouchableOpacity
            style={[styles.roleBtn, activeRole === 'passenger' && styles.roleBtnActive]}
            onPress={() => setActiveRole('passenger')}
            activeOpacity={0.8}
          >
            <User size={15} color={activeRole === 'passenger' ? Colors.primary : Colors.textMuted} strokeWidth={2} />
            <Text style={[styles.roleBtnText, activeRole === 'passenger' && styles.roleBtnTextActive]}>
              Passageiro
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, activeRole === 'driver' && styles.roleBtnActive]}
            onPress={() => setActiveRole('driver')}
            activeOpacity={0.8}
          >
            <Car size={15} color={activeRole === 'driver' ? Colors.primary : Colors.textMuted} strokeWidth={2} />
            <Text style={[styles.roleBtnText, activeRole === 'driver' && styles.roleBtnTextActive]}>
              Motorista
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="seu@email.com"
            leftIcon={<Mail size={18} color={Colors.textMuted} />}
          />
          <Input
            label="Senha"
            value={password}
            onChangeText={setPassword}
            isPassword
            placeholder="••••••••"
            leftIcon={<Lock size={18} color={Colors.textMuted} />}
          />
          <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
            <Text style={styles.forgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>
          <Button title="Entrar" onPress={handleLogin} loading={loading} style={{ marginTop: 4 }} />
        </View>

        <Divider label="ou" style={{ marginVertical: 28 }} />

        {/* Register Cards */}
        <View style={styles.registerSection}>
          <Text style={styles.registerLabel}>Primeira vez aqui?</Text>
          <TouchableOpacity style={styles.registerCard} onPress={onRegister} activeOpacity={0.85}>
            <View style={styles.registerIconWrap}>
              <User size={20} color={Colors.textPrimary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.registerCardTitle}>Criar conta de Passageiro</Text>
              <Text style={styles.registerCardSub}>Peca corridas em Sinop agora</Text>
            </View>
            <ArrowRight size={18} color={Colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.registerCard} onPress={onRegisterDriver} activeOpacity={0.85}>
            <View style={[styles.registerIconWrap, { backgroundColor: Colors.primary }]}>
              <Car size={20} color={Colors.textInverse} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.registerCardTitle}>Quero ser Motorista</Text>
              <Text style={styles.registerCardSub}>Ganhe dinheiro dirigindo</Text>
            </View>
            <ArrowRight size={18} color={Colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          Ao entrar, voce concorda com os{' '}
          <Text style={styles.termsLink}>Termos de Uso</Text>
          {' '}e{' '}
          <Text style={styles.termsLink}>Politica de Privacidade</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28, paddingTop: 64, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 36 },
  logoWrap: {
    marginBottom: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  logoBox: {
    width: 68, height: 68, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 34, fontFamily: 'Poppins_800ExtraBold',
    color: Colors.textInverse, includeFontPadding: false, lineHeight: 40,
  },
  brand: {
    fontSize: 24, fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary, letterSpacing: 0.5, marginBottom: 6,
  },
  tagline: {
    fontSize: 15, fontFamily: 'Poppins_400Regular', color: Colors.textSecondary,
  },
  roleToggle: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 4, marginBottom: 28,
  },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 11,
    borderRadius: Radius.sm, gap: 7,
  },
  roleBtnActive: {
    backgroundColor: Colors.textPrimary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  roleBtnText: {
    fontSize: 14, fontFamily: 'Poppins_500Medium', color: Colors.textMuted,
  },
  roleBtnTextActive: {
    fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.primary,
  },
  form: { gap: 0 },
  forgotBtn: {
    alignSelf: 'flex-end', marginTop: -4, marginBottom: 20, paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textSecondary,
  },
  registerSection: { gap: 10, marginBottom: 28 },
  registerLabel: {
    fontSize: 13, fontFamily: 'Poppins_500Medium',
    color: Colors.textMuted, textAlign: 'center', marginBottom: 4,
  },
  registerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, gap: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  registerIconWrap: {
    width: 44, height: 44, borderRadius: Radius.sm,
    backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center',
  },
  registerCardTitle: {
    fontSize: 14, fontFamily: 'Poppins_600SemiBold',
    color: Colors.textPrimary, marginBottom: 2,
  },
  registerCardSub: {
    fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted,
  },
  terms: {
    fontSize: 12, fontFamily: 'Poppins_400Regular',
    color: Colors.textMuted, textAlign: 'center', lineHeight: 18,
  },
  termsLink: {
    fontSize: 12, fontFamily: 'Poppins_500Medium',
    color: Colors.textSecondary, textDecorationLine: 'underline',
  },
});

export default LoginScreen;