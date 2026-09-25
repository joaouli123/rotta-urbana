import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { CardFormData } from '../services/payments';
import type { CardPaymentFormProps } from './CardPaymentForm';

export type { CardFormReply, CardPaymentFormProps } from './CardPaymentForm';

// The web build has no WebView bridge for Mercado Pago's form. The local
// simulation of the plan screens (window.__demo) gets a stand-in form; any
// other web build offers the other ways to pay.
const simulated = () => typeof window !== 'undefined' && !!(window as unknown as { __demo?: unknown }).__demo;

export const CardPaymentForm: React.FC<CardPaymentFormProps> = ({ amount, email, onSubmit, fallback }) => {
  const [number, setNumber] = useState('5031 4332 1540 6351');
  const [mail, setMail] = useState(email || '');
  const [sending, setSending] = useState(false);

  if (!simulated()) {
    return (
      <View style={w.box}>
        <Text style={w.title}>Pagamento com cartão disponível no app</Text>
        <Text style={w.txt}>No navegador, pague com Pix ou na página do Mercado Pago.</Text>
        {fallback}
      </View>
    );
  }

  const submit = async () => {
    if (sending) return;
    setSending(true);
    const digits = number.replace(/\D/g, '');
    const form: CardFormData = {
      token: `sim-${digits.padEnd(16, '0')}`,
      payment_method_id: 'master',
      issuer_id: '24',
      payer: { email: mail, identification: { type: 'CPF', number: '12345678909' } },
    };
    try {
      const result = await onSubmit(form, 'sim-device');
      if (result.rebuild) setNumber('');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={w.box} testID="card-form-simulation">
      <Text style={w.badge}>SIMULAÇÃO — no celular aparece o formulário oficial do Mercado Pago</Text>
      <Text style={w.label}>Número do cartão</Text>
      <TextInput style={w.input} value={number} onChangeText={setNumber} inputMode="numeric" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={w.label}>Validade</Text>
          <TextInput style={w.input} defaultValue="11/30" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={w.label}>Código de segurança</Text>
          <TextInput style={w.input} defaultValue="123" />
        </View>
      </View>
      <Text style={w.label}>Nome do titular</Text>
      <TextInput style={w.input} defaultValue="APRO" />
      <Text style={w.label}>CPF do titular</Text>
      <TextInput style={w.input} defaultValue="123.456.789-09" />
      <Text style={w.label}>E-mail</Text>
      <TextInput style={w.input} value={mail} onChangeText={setMail} />
      <TouchableOpacity style={w.pay} onPress={() => { void submit(); }} disabled={sending} accessibilityRole="button">
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={w.payTxt}>Pagar R$ {amount.toFixed(2).replace('.', ',')}</Text>}
      </TouchableOpacity>
      <Text style={w.hint}>Final 0002 recusa, final 0003 fica em análise (só na simulação).</Text>
    </View>
  );
};

const w = StyleSheet.create({
  box: { flex: 1, padding: 18, gap: 6 },
  badge: {
    fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#92400E', backgroundColor: '#FEF3C7',
    borderRadius: 8, padding: 8, marginBottom: 8,
  },
  title: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#1A1A1A', textAlign: 'center' },
  txt: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#6B7280', textAlign: 'center', marginBottom: 8 },
  label: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#374151', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#1A1A1A',
  },
  pay: { backgroundColor: '#009EE3', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  payTxt: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
  hint: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#9CA3AF', textAlign: 'center', marginTop: 6 },
});
