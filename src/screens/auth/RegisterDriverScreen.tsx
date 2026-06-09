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
import {
  User,
  Mail,
  Lock,
  Phone,
  ChevronLeft,
  Car,
  FileText,
  Camera,
  CheckCircle,
  IdCard,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Input, Card, Badge } from '../../components/ui';
import { Colors, Radius } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addVehicle, updateDriverPix } from '../../services/drivers';
import FipePicker from '../../components/FipePicker';

interface RegisterDriverScreenProps {
  onBack: () => void;
}

const steps = ['Dados', 'Veiculo', 'Docs', 'Selfie'];

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
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');

  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleSeats, setVehicleSeats] = useState('4');
  const [brand, setBrand] = useState('');
  const [fipeValue, setFipeValue] = useState<number | undefined>(undefined);
  const [fipeCode, setFipeCode] = useState('');
  const [pixKey, setPixKey] = useState('');

  const submit = async () => {
    setLoading(true);
    const { error } = await signUp({ fullName: name, email, phone, password, role: 'driver' });
    if (error) {
      setLoading(false);
      Alert.alert('Erro no cadastro', friendlyError(error));
      return;
    }
    // Account + driver row are created by the signup trigger; persist the vehicle.
    try {
      const yearNum = Math.min(2100, Math.max(1980, parseInt(vehicleYear, 10) || new Date().getFullYear()));
      await addVehicle({
        model: vehicleModel.trim() || 'Veículo',
        plate: vehiclePlate.trim().toUpperCase().replace(/\s+/g, ''),
        year: yearNum,
        color: vehicleColor.trim() || 'N/D',
        brand: brand.trim() || undefined,
        fipeCode: fipeCode || undefined,
        fipeValue,
        seats: Math.min(9, Math.max(1, parseInt(vehicleSeats, 10) || 4)),
      });
      if (pixKey.trim()) await updateDriverPix(pixKey, inferPixType(pixKey));
    } catch {
      // non-fatal: the driver can add/edit the vehicle/PIX later
    }
    setLoading(false);
    // Session created -> navigator routes to the driver home (pending verification).
  };

  const goNext = () => {
    if (step === 0) {
      if (!name.trim() || !email.trim() || !phone.trim() || !password) {
        Alert.alert('Atenção', 'Preencha todos os dados pessoais.');
        return;
      }
      if (password.length < 8) {
        Alert.alert('Atenção', 'A senha precisa de ao menos 8 caracteres.');
        return;
      }
    }
    if (step === 1 && (!vehicleModel.trim() || !vehiclePlate.trim())) {
      Alert.alert('Atenção', 'Informe modelo e placa do veículo.');
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
            <Text style={styles.stepTitle}>Dados Pessoais</Text>
            <Text style={styles.stepDesc}>Preencha seus dados para criar seu perfil de motorista</Text>
            <Input label="Nome completo" value={name} onChangeText={setName}
              placeholder="Seu nome" autoCapitalize="words"
              leftIcon={<User size={18} color={Colors.textMuted} />} />
            <Input label="CPF" value={cpf} onChangeText={setCpf}
              placeholder="000.000.000-00" keyboardType="numeric"
              leftIcon={<IdCard size={18} color={Colors.textMuted} />} />
            <Input label="E-mail" value={email} onChangeText={setEmail}
              placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none"
              leftIcon={<Mail size={18} color={Colors.textMuted} />} />
            <Input label="Telefone" value={phone} onChangeText={setPhone}
              placeholder="(65) 9 9999-9999" keyboardType="phone-pad"
              leftIcon={<Phone size={18} color={Colors.textMuted} />} />
            <Input label="Senha" value={password} onChangeText={setPassword}
              isPassword placeholder="Minimo 8 caracteres"
              leftIcon={<Lock size={18} color={Colors.textMuted} />} />
          </>
        );
      case 1:
        return (
          <>
            <Text style={styles.stepTitle}>Dados do Veiculo</Text>
            <Text style={styles.stepDesc}>Busque seu carro na tabela FIPE (preenche modelo, ano e valor — define as categorias que voce atende):</Text>
            <FipePicker onSelected={(r) => {
              setVehicleModel(`${r.brand} ${r.model}`.trim());
              setVehicleYear(String(r.year));
              setBrand(r.brand);
              setFipeValue(r.value);
              setFipeCode(r.code);
            }} />
            <Input label="Modelo do veiculo" value={vehicleModel} onChangeText={setVehicleModel}
              placeholder="Ex: Toyota Corolla 2022"
              leftIcon={<Car size={18} color={Colors.textMuted} />} />
            <Input label="Placa" value={vehiclePlate} onChangeText={setVehiclePlate}
              placeholder="ABC-1234" autoCapitalize="characters"
              leftIcon={<FileText size={18} color={Colors.textMuted} />} />
            <Input label="Ano de fabricacao" value={vehicleYear} onChangeText={setVehicleYear}
              placeholder="2020" keyboardType="numeric"
              leftIcon={<Car size={18} color={Colors.textMuted} />} />
            <Input label="Cor do veiculo" value={vehicleColor} onChangeText={setVehicleColor}
              placeholder="Preto, Branco, Prata..."
              leftIcon={<Car size={18} color={Colors.textMuted} />} />
            <Input label="Assentos (passageiros)" value={vehicleSeats} onChangeText={setVehicleSeats}
              placeholder="4" keyboardType="numeric"
              leftIcon={<User size={18} color={Colors.textMuted} />} />
            <Input label="Chave PIX (para receber as corridas)" value={pixKey} onChangeText={setPixKey}
              placeholder="CPF, e-mail, telefone ou chave aleatoria"
              autoCapitalize="none"
              leftIcon={<FileText size={18} color={Colors.textMuted} />} />
          </>
        );
      case 2:
        return (
          <>
            <Text style={styles.stepTitle}>Documentacao</Text>
            <Text style={styles.stepDesc}>Envie os documentos para verificacao. Todos os dados sao criptografados.</Text>
            {[
              { label: 'CNH (frente e verso)', Icon: FileText, hint: 'JPG, PNG ou PDF - max. 10MB' },
              { label: 'RG ou identidade', Icon: FileText, hint: 'JPG, PNG ou PDF - max. 10MB' },
              { label: 'CRLV do veiculo', Icon: Car, hint: 'JPG, PNG ou PDF - max. 10MB' },
            ].map((doc, i) => (
              <TouchableOpacity key={i} style={styles.docCard} activeOpacity={0.8}>
                <View style={styles.docIconWrap}>
                  <doc.Icon size={20} color={Colors.textPrimary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docHint}>{doc.hint}</Text>
                </View>
                <View style={styles.docAction}>
                  <Text style={styles.docActionText}>Enviar</Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={styles.infoCard}>
              <CheckCircle size={16} color={Colors.success} strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={styles.infoText}>
                Documentos verificados manualmente em ate 24h. Voce sera notificado por e-mail.
              </Text>
            </View>
          </>
        );
      case 3:
        return (
          <>
            <Text style={styles.stepTitle}>Verificacao Facial</Text>
            <Text style={styles.stepDesc}>
              Tire uma selfie para validar sua identidade. Isso garante seguranca para todos.
            </Text>
            <TouchableOpacity style={styles.selfieBox} activeOpacity={0.85}>
              <View style={styles.selfieInner}>
                <View style={styles.selfieIconWrap}>
                  <Camera size={40} color={Colors.textPrimary} strokeWidth={1.5} />
                </View>
                <Text style={styles.selfieLabel}>Tirar selfie agora</Text>
                <Text style={styles.selfieHint}>
                  Certifique-se de estar em local bem iluminado
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.infoCard}>
              <CheckCircle size={16} color={Colors.info} strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={styles.infoText}>
                A selfie e comparada com a CNH enviada. Contas de terceiros sao proibidas.
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={22} color={Colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Cadastro Motorista</Text>
          <View style={{ width: 40 }} />
        </View>

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

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStepContent()}
          <Button
            title={step < steps.length - 1 ? 'Proximo' : 'Concluir cadastro'}
            onPress={goNext}
            loading={loading}
            style={{ marginTop: 16, marginBottom: 40 }}
          />
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

  // Step Indicator
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, paddingVertical: 16,
  },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  stepLine: {
    position: 'absolute', top: 14, left: '58%', right: '-58%',
    height: 2, backgroundColor: Colors.border,
  },
  stepLineActive: { backgroundColor: Colors.primary },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    zIndex: 1,
  },
  stepCircleActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
  },
  stepNum: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted,
  },
  stepNumActive: {
    fontSize: 12, fontFamily: 'Poppins_700Bold', color: Colors.textInverse,
  },
  stepLabel: {
    fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted,
  },
  stepLabelActive: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },

  content: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 40 },
  stepTitle: {
    fontSize: 26, fontFamily: 'Poppins_700Bold',
    color: Colors.textPrimary, marginBottom: 8,
  },
  stepDesc: {
    fontSize: 14, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, marginBottom: 24, lineHeight: 22,
  },

  // Doc cards
  docCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, marginBottom: 10, gap: 12,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  docIconWrap: {
    width: 42, height: 42, borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  docLabel: {
    fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 2,
  },
  docHint: {
    fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted,
  },
  docAction: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  docActionText: {
    fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: Colors.textInverse,
  },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, marginTop: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  infoText: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },

  // Selfie
  selfieBox: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 2, borderColor: Colors.primary + '55',
    borderStyle: 'dashed', marginBottom: 16,
  },
  selfieInner: {
    padding: 44, alignItems: 'center', gap: 14,
    backgroundColor: Colors.primary + '0D',
  },
  selfieIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.primary + '44',
  },
  selfieLabel: {
    fontSize: 17, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary,
  },
  selfieHint: {
    fontSize: 13, fontFamily: 'Poppins_400Regular',
    color: Colors.textSecondary, textAlign: 'center',
  },
});

export default RegisterDriverScreen;