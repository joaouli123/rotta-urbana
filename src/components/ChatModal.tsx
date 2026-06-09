import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Send } from 'lucide-react-native';
import { Colors, Radius } from '../constants';
import { getMessages, sendMessage, subscribeMessages, currentUserId, type ChatMessage } from '../services/chat';

interface Props {
  visible: boolean;
  onClose: () => void;
  rideId?: string;
  title: string;
}

export default function ChatModal({ visible, onClose, rideId, title }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { currentUserId().then(setMe); }, []);

  useEffect(() => {
    if (!visible || !rideId) return;
    let active = true;
    getMessages(rideId)
      .then((m) => { if (active) { setMessages(m); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60); } })
      .catch(() => {});
    const unsub = subscribeMessages(rideId, (msg) => {
      setMessages((cur) => (cur.some((x) => x.id === msg.id) ? cur : [...cur, msg]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    });
    return () => { active = false; unsub(); };
  }, [visible, rideId]);

  const send = async () => {
    const text = input.trim();
    if (!text || !rideId) return;
    setInput('');
    try { await sendMessage(rideId, text); } catch { /* ignore */ }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.full}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}><X size={20} color={Colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && <Text style={styles.empty}>Nenhuma mensagem ainda. Diga olá!</Text>}
          {messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleTxt, mine ? styles.mineTxt : styles.theirsTxt]}>{m.body}</Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input} value={input} onChangeText={setInput}
            placeholder="Mensagem..." placeholderTextColor={Colors.textMuted}
            onSubmitEditing={send} returnKeyType="send"
          />
          <TouchableOpacity style={[styles.sendBtn, { opacity: input.trim() ? 1 : 0.4 }]} onPress={send} disabled={!input.trim()}>
            <Send size={18} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, flex: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 30, fontFamily: 'Poppins_400Regular' },
  bubble: { maxWidth: '80%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#111', borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
  mineTxt: { color: Colors.textInverse },
  theirsTxt: { color: '#FFF' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, minHeight: 42, backgroundColor: Colors.surface, borderRadius: 21,
    paddingHorizontal: 16, fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textPrimary,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});
