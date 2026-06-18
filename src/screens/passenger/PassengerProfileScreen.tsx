import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Linking,
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
  FileText,
  Trash2,
} from 'lucide-react-native';
import { Avatar, Rating, Card, ListItem } from '../../components/ui';
import { Colors, Radius, Legal } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { getRideHistory } from '../../services/rides';
import { deleteAccount } from '../../services/profile';
import { friendlyError } from '../../lib/errors';
import { useState, useEffect } from 'react';

interface PassengerProfileScreenProps {
  onBack: () => void;
  onLogout: () => void;
  onSupport?: () => void;
  onHistory?: () => void;
}

const fmtMoney = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function memberSince(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

const PassengerProfileScreen: React.FC<PassengerProfileScreenProps> = ({ onBack, onLogout, onSupport, onHistory }) => {
  const { profile } = useAuth();
  const [stats, setStats] = useState<{ count: number; spent: number }>({ count: 0, spent: 0 });

  useEffect(() => {
    getRideHistory(50).then((rides) => {
      const completed = rides.filter((r) => r.status === 'completed');
      setStats({
        count: completed.length,
        spent: completed.reduce((s, r) => s + (Number(r.price) || 0), 0),
      });
    }).catch(() => {});
  }, []);

  const userName = profile?.full_name ?? 'Passageiro';
  const userRating = profile?.rating ?? 5;

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Excluir minha conta',
      'Esta ação é permanente. Seus dados, corridas e avaliações serão apagados e não poderão ser recuperados. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              onLogout();
            } catch (e) {
              Alert.alert('Erro', friendlyError(e instanceof Error ? e.message : undefined));
            }
          },
        },
      ],
    );
  };

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
            <Avatar name={userName} size={80} />
            <TouchableOpacity style={styles.editAvatarBtn}>
              <User size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Rating value={userRating} />
          {profile?.created_at ? <Text style={styles.userSince}>Membro desde {memberSince(profile.created_at)}</Text> : <View style={{ height: 12 }} />}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{stats.count}</Text>
              <Text style={styles.statLabel}>Corridas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{fmtMoney(stats.spent)}</Text>
              <Text style={styles.statLabel}>Gasto</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{userRating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Nota</Text>
            </View>
          </View>
        </View>

        {/* Personal Info */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Informações pessoais</Text>
          <ListItem icon={<Mail size={18} color={Colors.primary} />} title={profile?.email ?? '—'} subtitle="E-mail" onPress={() => {}} />
          <ListItem icon={<Phone size={18} color={Colors.primary} />} title={profile?.phone ?? '—'} subtitle="Telefone" onPress={() => {}} />
        </Card>

        {/* Settings */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Configurações</Text>
          <ListItem icon={<Navigation size={18} color={Colors.primary} />} title="Histórico de corridas" subtitle="Ver todas as viagens" onPress={onHistory} />
          <ListItem icon={<Bell size={18} color={Colors.textPrimary} />} title="Notificações" onPress={() => {}} />
          <ListItem icon={<CreditCard size={18} color={Colors.textPrimary} />} title="Pagamentos" onPress={() => {}} />
          <ListItem icon={<Shield size={18} color={Colors.textPrimary} />} title="Segurança" onPress={() => {}} />
        </Card>

        {/* Support */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Suporte e privacidade</Text>
          <ListItem icon={<HelpCircle size={18} color={Colors.textPrimary} />} title="Ajuda e suporte" onPress={onSupport} />
          <ListItem icon={<FileText size={18} color={Colors.textPrimary} />} title="Termos de uso" onPress={() => Linking.openURL(Legal.termsUrl)} />
          <ListItem icon={<Shield size={18} color={Colors.textPrimary} />} title="Política de privacidade" onPress={() => Linking.openURL(Legal.privacyUrl)} />
        </Card>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <LogOut size={18} color={Colors.danger} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>

        {/* Delete account — required by App Store / Google Play */}
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteAccount}>
          <Trash2 size={16} color={Colors.textMuted} />
          <Text style={styles.deleteText}>Excluir minha conta</Text>
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
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginBottom: 24,
  },
  deleteText: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textMuted, textDecorationLine: 'underline' },
});

export default PassengerProfileScreen;
