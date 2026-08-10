import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { Colors, Radius, Typography } from '../../constants';

interface Props {
  initialEmail?: string;
  onBack: () => void;
}

export default function ForgotPasswordScreen({ initialEmail = '', onBack }: Props) {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      Alert.alert('E-mail invalido', 'Informe o e-mail usado na conta.');
      return;
    }
    setLoading(true);
    const { error } = await resetPasswordForEmail(normalized);
    setLoading(false);
    if (error) {
      Alert.alert('Nao foi possivel enviar', friendlyError(error));
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.8}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
          <Text style={styles.backText}>Voltar ao login</Text>
        </TouchableOpacity>

        {sent ? (
          <View style={styles.successWrap}>
            <CheckCircle size={58} color={Colors.success} />
            <Text style={styles.title}>Confira seu e-mail</Text>
            <Text style={styles.description}>
              Enviamos um link para redefinir a senha de {email.trim()}.
              Abra o link no celular para criar uma nova senha.
            </Text>
            <TouchableOpacity style={styles.button} onPress={onBack} activeOpacity={0.85}>
              <Text style={styles.buttonText}>Voltar ao login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.iconWrap}><Mail size={28} color={Colors.primaryDark} /></View>
            <Text style={styles.title}>Redefinir senha</Text>
            <Text style={styles.description}>
              Informe o e-mail da sua conta. O mesmo fluxo vale para passageiros, motoristas, gerentes e administradores.
            </Text>
            <Text style={styles.label}>E-mail</Text>
            <View style={styles.inputWrap}>
              <Mail size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
            <TouchableOpacity style={[styles.button, loading && { opacity: 0.6 }]} onPress={handleSend} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Enviar link</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 54 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 54 },
  backText: { ...Typography.bodyMedium, color: Colors.textPrimary },
  iconWrap: { width: 58, height: 58, borderRadius: Radius.full, backgroundColor: '#F0FAE8', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  successWrap: { alignItems: 'center', paddingTop: 34 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 12 },
  description: { ...Typography.body, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28 },
  label: { ...Typography.smallMedium, color: Colors.textSecondary, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8, marginBottom: 26 },
  input: { flex: 1, ...Typography.body, color: Colors.textPrimary, paddingVertical: 4 },
  button: { minHeight: 54, borderRadius: Radius.md, backgroundColor: Colors.dark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 4 },
  buttonText: { ...Typography.bodySemiBold, color: Colors.white },
});
