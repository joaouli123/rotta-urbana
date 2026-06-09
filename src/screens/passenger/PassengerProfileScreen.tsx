import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  ChevronLeft,
  User,
  Mail,
  Phone,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Star,
  Navigation,
  CreditCard,
} from 'lucide-react-native';
import { Avatar, Rating, Card, ListItem } from '../../components/ui';
import { Colors, Radius } from '../../constants';

interface PassengerProfileScreenProps {
  onBack: () => void;
  onLogout: () => void;
  onSupport?: () => void;
}

const PassengerProfileScreen: React.FC<PassengerProfileScreenProps> = ({ onBack, onLogout, onSupport }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrapper}>
            <Avatar name="Lucas Silva" size={80} />
            <TouchableOpacity style={styles.editAvatarBtn}>
              <User size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>Lucas Silva</Text>
          <Rating value={4.9} />
          <Text style={styles.userSince}>Membro desde jan. 2025</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>24</Text>
              <Text style={styles.statLabel}>Corridas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>R$ 312</Text>
              <Text style={styles.statLabel}>Gasto</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>4.9</Text>
              <Text style={styles.statLabel}>Nota</Text>
            </View>
          </View>
        </View>

        {/* Personal Info */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Informações pessoais</Text>
          <ListItem icon={<Mail size={18} color={Colors.primary} />} title="lucas@email.com" subtitle="E-mail" onPress={() => {}} />
          <ListItem icon={<Phone size={18} color={Colors.primary} />} title="(65) 9 9999-9999" subtitle="Telefone" onPress={() => {}} />
        </Card>

        {/* Settings */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Configurações</Text>
          <ListItem icon={<Bell size={18} color={Colors.textPrimary} />} title="Notificacoes" onPress={() => {}} />
          <ListItem icon={<CreditCard size={18} color={Colors.textPrimary} />} title="Pagamentos" onPress={() => {}} />
          <ListItem icon={<Shield size={18} color={Colors.textPrimary} />} title="Seguranca" onPress={() => {}} />
        </Card>

        {/* Support */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Suporte</Text>
          <ListItem icon={<HelpCircle size={18} color={Colors.textPrimary} />} title="Ajuda e suporte" onPress={onSupport} />
          <ListItem icon={<Navigation size={18} color={Colors.textPrimary} />} title="Termos de uso" onPress={() => {}} />
        </Card>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <LogOut size={18} color={Colors.danger} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
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
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  profileHeader: { alignItems: 'center', paddingVertical: 28 },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  editAvatarBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.background,
  },
  userName: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 6 },
  userSince: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 4, marginBottom: 20 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    paddingVertical: 16, paddingHorizontal: 24, width: '100%',
    borderWidth: 1, borderColor: Colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted, marginTop: 4 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  section: { marginBottom: 12, padding: 16 },
  sectionTitle: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 8 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, marginTop: 8, marginBottom: 16,
    backgroundColor: Colors.danger + '11', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.danger + '33',
  },
  logoutText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: Colors.danger },
});

export default PassengerProfileScreen;
