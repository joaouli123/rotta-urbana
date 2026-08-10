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
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { Colors, Radius, Typography } from '../../constants';

interface Props {
  onFinished: () => void;
}

export default function ResetPasswordScreen({ onFinished }: Props) {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (password.length < 8) {
      Alert.alert('Senha invalida', 'A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Senhas diferentes', 'A confirmacao precisa ser igual a nova senha.');
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      setLoading(false);
      Alert.alert('Nao foi possivel alterar', friendlyError(error));
      return;
    }
    await signOut();
    setLoading(false);
    onFinished();
    Alert.alert('Senha alterada', 'Sua senha foi redefinida. Entre novamente com a nova senha.');
  };

  const Field = ({ value, onChangeText, placeholder, visible, onToggle }: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    visible: boolean;
    onToggle: () => void;
  }) => (
    <View style={styles.inputWrap}>
      <Lock size={18} color={Colors.textMuted} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
      />
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        {visible ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.iconWrap}><ShieldCheck size={30} color={Colors.primaryDark} /></View>
        <Text style={styles.title}>Criar nova senha</Text>
        <Text style={styles.description}>
          Escolha uma senha forte. Esta tela funciona para contas de passageiro, motorista, gerente e administrador.
        </Text>
        <Text style={styles.label}>Nova senha</Text>
        <Field value={password} onChangeText={setPassword} placeholder="Minimo de 8 caracteres" visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
        <Text style={styles.label}>Confirmar nova senha</Text>
        <Field value={confirmation} onChangeText={setConfirmation} placeholder="Repita a nova senha" visible={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} />
        <TouchableOpacity style={[styles.button, loading && { opacity: 0.6 }]} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Salvar nova senha</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 74 },
  iconWrap: { width: 64, height: 64, borderRadius: Radius.full, backgroundColor: '#F0FAE8', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 12 },
  description: { ...Typography.body, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28 },
  label: { ...Typography.smallMedium, color: Colors.textSecondary, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8, marginBottom: 20 },
  input: { flex: 1, ...Typography.body, color: Colors.textPrimary, paddingVertical: 4 },
  button: { minHeight: 54, borderRadius: Radius.md, backgroundColor: Colors.dark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 12 },
  buttonText: { ...Typography.bodySemiBold, color: Colors.white },
});
