import React, { useState } from 'react';
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
  FileText,
  Car,
  Camera,
  CheckCircle,
  Clock,
  AlertCircle,
  Upload,
} from 'lucide-react-native';
import { Card, Badge, Button } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';

const DOCUMENTS = [
  { id: '1', label: 'CNH (Carteira de Habilitação)', icon: FileText, status: 'approved', updated: '10/01/2025' },
  { id: '2', label: 'RG / Documento de Identidade', icon: FileText, status: 'approved', updated: '10/01/2025' },
  { id: '3', label: 'CRLV do Veículo', icon: Car, status: 'pending', updated: '20/05/2026' },
  { id: '4', label: 'Selfie de Verificação', icon: Camera, status: 'approved', updated: '10/01/2025' },
  { id: '5', label: 'Antecedentes Criminais', icon: FileText, status: 'rejected', updated: '18/05/2026' },
];

const statusConfig = {
  approved: { label: 'Aprovado', variant: 'success' as const, icon: CheckCircle, color: Colors.success },
  pending: { label: 'Em análise', variant: 'warning' as const, icon: Clock, color: Colors.warning },
  rejected: { label: 'Recusado', variant: 'danger' as const, icon: AlertCircle, color: Colors.danger },
};

interface DriverDocumentsScreenProps {
  onBack: () => void;
}

const DriverDocumentsScreen: React.FC<DriverDocumentsScreenProps> = ({ onBack }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Meus Documentos</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Verification Status */}
        <Card style={styles.verifyCard}>
          <View style={styles.verifyRow}>
            <View style={styles.verifyIconWrap}>
              <AlertCircle size={22} color={Colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyTitle}>Verificação pendente</Text>
              <Text style={styles.verifyDesc}>1 documento precisa ser atualizado para manter a conta ativa.</Text>
            </View>
          </View>
        </Card>

        {/* Documents List */}
        {DOCUMENTS.map((doc) => {
          const status = statusConfig[doc.status as keyof typeof statusConfig];
          const StatusIcon = status.icon;
          return (
            <Card key={doc.id} style={styles.docCard}>
              <View style={styles.docHeader}>
                <View style={styles.docIconWrap}>
                  <doc.icon size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docDate}>Atualizado em {doc.updated}</Text>
                </View>
                <Badge label={status.label} variant={status.variant} />
              </View>

              {doc.status === 'rejected' && (
                <View style={styles.rejectedInfo}>
                  <AlertCircle size={14} color={Colors.danger} />
                  <Text style={styles.rejectedText}>
                    Documento recusado. Envie uma versão mais nítida, sem cortes e com boa iluminação.
                  </Text>
                </View>
              )}

              {(doc.status === 'rejected' || doc.status === 'pending') && (
                <TouchableOpacity style={styles.reuploadBtn}>
                  <Upload size={15} color={Colors.primary} />
                  <Text style={styles.reuploadText}>
                    {doc.status === 'rejected' ? 'Reenviar documento' : 'Substituir documento'}
                  </Text>
                </TouchableOpacity>
              )}
            </Card>
          );
        })}

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <CheckCircle size={18} color={Colors.info} />
            <Text style={styles.infoText}>
              Todos os documentos são verificados manualmente pela equipe Rotta Urbana em até 24 horas úteis. Suas informações são criptografadas e protegidas.
            </Text>
          </View>
        </Card>

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
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  verifyCard: {
    padding: 16, borderColor: Colors.warning + '44', borderWidth: 1,
    backgroundColor: Colors.warning + '11',
  },
  verifyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  verifyIconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.warning + '22', alignItems: 'center', justifyContent: 'center',
  },
  verifyTitle: { ...Typography.bodyMedium, color: Colors.warning, marginBottom: 4 },
  verifyDesc: { ...Typography.small, color: Colors.textSecondary, lineHeight: 20 },
  docCard: { padding: 16 },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  docLabel: { ...Typography.bodyMedium, color: Colors.textPrimary },
  docDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  rejectedInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.danger + '11', borderRadius: Radius.sm,
    padding: 10, marginTop: 12, borderWidth: 1, borderColor: Colors.danger + '33',
  },
  rejectedText: { ...Typography.caption, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  reuploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: Colors.primary + '11', borderWidth: 1, borderColor: Colors.primary + '33',
  },
  reuploadText: { ...Typography.smallMedium, color: Colors.primary },
  infoCard: { padding: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoText: { ...Typography.small, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
});

export default DriverDocumentsScreen;
