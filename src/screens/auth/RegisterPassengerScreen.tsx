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
} from 'react-native';
import { User, Mail, Lock, Phone, ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { Button, Input } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface RegisterPassengerScreenProps {
  onBack: () => void;
}

const RegisterPassengerScreen: React.FC<RegisterPassengerScreenProps> = ({ onBack }) => {
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
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
    setLoading(true);
    const { error } = await signUp({ fullName: name, email, phone, password, role: 'passenger' });
    setLoading(false);
    // Success -> session is created and the navigator routes to the home.
    if (error) Alert.alert('Erro no cadastro', friendlyError(error));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={22} color={Colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Nova conta</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <User size={22} color={Colors.textInverse} strokeWidth={2} />
            </View>
            <Text style={styles.title}>Crie sua{'\n'}conta gratis</Text>
            <Text style={styles.subtitle}>
              Comece a pedir corridas em Sinop em menos de 2 minutos
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Nome completo"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              autoCapitalize="words"
              leftIcon={<User size={18} color={Colors.textMuted} />}
            />
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={18} color={Colors.textMuted} />}
            />
            <Input
              label="Telefone / WhatsApp"
              value={phone}
              onChangeText={setPhone}
              placeholder="(65) 9 9999-9999"
              keyboardType="phone-pad"
              leftIcon={<Phone size={18} color={Colors.textMuted} />}
            />
            <Input
              label="Senha"
              value={password}
              onChangeText={setPassword}
              isPassword
              placeholder="Minimo 8 caracteres"
              leftIcon={<Lock size={18} color={Colors.textMuted} />}
            />
            <Input
              label="Confirmar Senha"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              placeholder="Repita sua senha"
              leftIcon={<Lock size={18} color={Colors.textMuted} />}
            />
          </View>

          <Button
            title="Criar conta"
            onPress={handleRegister}
            loading={loading}
            style={{ marginTop: 12, marginBottom: 20 }}
          />

          {/* Security badge */}
          <View style={styles.securityRow}>
            <ShieldCheck size={15} color={Colors.success} strokeWidth={2} />
            <Text style={styles.securityText}>
              Seus dados sao protegidos com criptografia SSL
            </Text>
          </View>

          <Text style={styles.terms}>
            Ao criar conta, voce concorda com os{' '}
            <Text style={styles.termsLink}>Termos de Uso</Text>
            {' '}e{' '}
            <Text style={styles.termsLink}>Politica de Privacidade</Text>
            {' '}da Rotta Urbana.
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },

  content: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 48 },

  hero: { marginBottom: 32 },
  heroBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontSize: 32, fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary, lineHeight: 40, marginBottom: 10,
  },
  subtitle: {
    fontSize: 15, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, lineHeight: 23,
  },

  form: { gap: 0, marginBottom: 4 },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, marginBottom: 16,
  },
  securityText: {
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

export default RegisterPassengerScreen;