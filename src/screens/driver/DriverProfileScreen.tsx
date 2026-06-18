import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Star, Navigation, DollarSign, Clock, Shield,
  FileText, CreditCard, HelpCircle, LogOut, ChevronRight,
  CheckCircle, AlertCircle, User, Trash2,
} from 'lucide-react-native';
import { Avatar, Rating } from '../../components/ui';
import { Colors, Radius, Typography, Legal } from '../../constants';
import { supabase } from '../../lib/supabase';
import { deleteAccount } from '../../services/profile';
import { friendlyError } from '../../lib/errors';
import type { ProfileRow, DriverRow, SubscriptionRow } from '../../types/db';

interface DriverProfileScreenProps {
  onBack: () => void;
  onEarnings: () => void;
  onRides: () => void;
  onRatings: () => void;
  onDocuments: () => void;
  onSubscription: () => void;
  onSupport: () => void;
  onLogout: () => void;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const DriverProfileScreen: React.FC<DriverProfileScreenProps> = ({
  onBack, onEarnings, onRides, onRatings, onDocuments, onSubscription, onSupport, onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [pRes, dRes, sRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('drivers').select('*').eq('id', user.id).single(),
        supabase.from('subscriptions').select('*').eq('driver_id', user.id).maybeSingle(),
      ]);
      if (pRes.data) setProfile(pRes.data as ProfileRow);
      if (dRes.data) setDriver(dRes.data as DriverRow);
      if (sRes.data) setSub(sRes.data as SubscriptionRow);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmLogout = () => {
    Alert.alert('Sair da conta', 'Deseja realmente sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onLogout },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Excluir minha conta',
      'Esta ação é permanente. Seu cadastro, veículo, documentos e corridas serão apagados e não poderão ser recuperados. Deseja continuar?',
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

  // Subscription status
  const subActive = sub?.status === 'active';
  const subDue = sub?.due_date ? new Date(sub.due_date) : null;
  const subOverdue = subDue ? subDue < new Date() && !subActive : false;

  const menuItems = [
    { icon: <DollarSign size={18} color={Colors.textPrimary} />, label: 'Meus ganhos', sub: 'Relatório financeiro completo', onPress: onEarnings },
    { icon: <Navigation size={18} color={Colors.textPrimary} />, label: 'Minhas corridas', sub: 'Histórico de viagens', onPress: onRides },
    { icon: <Star size={18} color={Colors.textPrimary} />, label: 'Avaliações', sub: `Nota atual: ${profile?.rating?.toFixed(1) ?? '—'}`, onPress: onRatings },
    { icon: <CreditCard size={18} color={Colors.textPrimary} />, label: 'Mensalidade', sub: subOverdue ? 'Vencida — regularize!' : subActive ? 'Em dia' : 'Ver detalhes', onPress: onSubscription, alert: subOverdue },
    { icon: <FileText size={18} color={Colors.textPrimary} />, label: 'Documentos', sub: driver?.documents_status === 'approved' ? 'Aprovado' : driver?.documents_status === 'pending' ? 'Em análise' : 'Ver situação', onPress: onDocuments },
    { icon: <HelpCircle size={18} color={Colors.textPrimary} />, label: 'Suporte', sub: 'Fale conosco', onPress: onSupport },
    { icon: <FileText size={18} color={Colors.textPrimary} />, label: 'Termos de uso', sub: 'Contrato e regras', onPress: () => Linking.openURL(Legal.termsUrl) },
    { icon: <Shield size={18} color={Colors.textPrimary} />, label: 'Política de privacidade', sub: 'Como tratamos seus dados', onPress: () => Linking.openURL(Legal.privacyUrl) },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

          {/* Profile header — dark hero for readability */}
          <LinearGradient colors={[Colors.darkElevated, Colors.dark]} style={styles.headerGrad}>
            <View style={styles.avatarWrap}>
              <Avatar name={profile?.full_name ?? 'Motorista'} size={88} />
              {driver?.is_verified && (
                <View style={styles.verifiedBadge}>
                  <CheckCircle size={16} color={Colors.success} />
                </View>
              )}
            </View>
            <Text style={styles.driverName}>{profile?.full_name ?? 'Motorista'}</Text>
            <View style={styles.starsRow}>
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={14}
                  color={s <= Math.round(profile?.rating ?? 5) ? Colors.primary : 'rgba(255,255,255,0.25)'}
                  fill={s <= Math.round(profile?.rating ?? 5) ? Colors.primary : 'transparent'}
                />
              ))}
              <Text style={styles.ratingTxt}>
                {profile?.rating?.toFixed(1) ?? '5.0'} ({profile?.total_ratings ?? 0} avaliações)
              </Text>
            </View>
            <Text style={styles.memberSince}>Motorista desde {fmtDate(profile?.created_at)}</Text>
          </LinearGradient>

          {/* Quick stats */}
          <View style={styles.statsRow}>
            {[
              { label: 'Corridas', value: String(driver?.total_rides ?? 0) },
              { label: 'Avaliação', value: profile?.rating?.toFixed(1) ?? '5.0' },
              { label: 'Status', value: driver?.is_verified ? 'Verificado' : 'Pendente' },
            ].map(s => (
              <View key={s.label} style={styles.statCard}>
                <Text style={styles.statVal}>{s.value}</Text>
                <Text style={styles.statLbl}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Contact info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informações</Text>
            {[
              { label: 'E-mail', value: profile?.email ?? '—' },
              { label: 'Telefone', value: profile?.phone ?? '—' },
              { label: 'Documentos', value: driver?.documents_status === 'approved' ? 'Aprovado' : driver?.documents_status === 'pending' ? 'Em análise' : 'Pendente' },
            ].map(row => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Subscription alert */}
          {subOverdue && (
            <TouchableOpacity style={styles.subAlert} onPress={onSubscription} activeOpacity={0.8}>
              <AlertCircle size={18} color={Colors.danger} />
              <Text style={styles.subAlertTxt}>Mensalidade vencida — toque para regularizar</Text>
              <ChevronRight size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}

          {/* Menu */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acesso rápido</Text>
            {menuItems.map((item) => (
              <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <View style={[styles.menuIcon, item.alert && { backgroundColor: Colors.danger + '15' }]}>
                  {item.icon}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, item.alert && { color: Colors.danger }]}>{item.label}</Text>
                  <Text style={[styles.menuSub, item.alert && { color: Colors.danger }]}>{item.sub}</Text>
                </View>
                <ChevronRight size={16} color={item.alert ? Colors.danger : Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.8}>
            <LogOut size={18} color={Colors.danger} />
            <Text style={styles.logoutTxt}>Sair da conta</Text>
          </TouchableOpacity>

          {/* Delete account — required by App Store / Google Play */}
          <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteAccount} activeOpacity={0.7}>
            <Trash2 size={16} color={Colors.textMuted} />
            <Text style={styles.deleteTxt}>Excluir minha conta</Text>
          </TouchableOpacity>

        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: Colors.background,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingTop: 0 },

  headerGrad: {
    borderRadius: Radius.xl, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20,
    marginBottom: 16,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  verifiedBadge: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: Colors.surface,
    borderRadius: 10, padding: 1,
  },
  driverName: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#fff', marginBottom: 6 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  ratingTxt: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.7)', marginLeft: 4 },
  memberSince: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.5)' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statVal: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.textPrimary, marginBottom: 2 },
  statLbl: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoLabel: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },
  infoValue: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, maxWidth: '65%' },

  subAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.danger + '12', borderRadius: Radius.md, padding: 14,
    borderWidth: 1, borderColor: Colors.danger + '35', marginBottom: 16,
  },
  subAlertTxt: { flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: Colors.danger },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  menuIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: Colors.textPrimary, marginBottom: 1 },
  menuSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: Colors.textMuted },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 8, paddingVertical: 16, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.danger + '40',
    backgroundColor: Colors.danger + '08',
  },
  logoutTxt: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: Colors.danger },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 4,
  },
  deleteTxt: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: Colors.textMuted, textDecorationLine: 'underline' },
});

export default DriverProfileScreen;
