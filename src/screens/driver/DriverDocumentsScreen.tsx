import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, Image, RefreshControl,
} from 'react-native';
import {
  ChevronLeft, FileText, Car, Camera, CheckCircle, Clock,
  AlertCircle, Upload,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Card, Badge } from '../../components/ui';
import { Colors, Radius, Typography } from '../../constants';
import { getMyDocuments, uploadDocument, type DriverDocument, type DocType } from '../../services/documents';
import { getMyDriver } from '../../services/drivers';
import type { DriverRow } from '../../types/db';

// The 4 required document slots.
const DOC_SLOTS: { type: DocType; label: string; icon: any }[] = [
  { type: 'cnh',         label: 'CNH (Carteira de Habilitação)', icon: FileText },
  { type: 'rg',          label: 'RG / Documento de Identidade',  icon: FileText },
  { type: 'vehicle_doc', label: 'CRLV do Veículo',               icon: Car },
  { type: 'selfie',      label: 'Selfie de Verificação',         icon: Camera },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface DriverDocumentsScreenProps {
  onBack: () => void;
}

const DriverDocumentsScreen: React.FC<DriverDocumentsScreenProps> = ({ onBack }) => {
  const [docs, setDocs] = useState<DriverDocument[]>([]);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, dr] = await Promise.all([getMyDocuments(), getMyDriver().catch(() => null)]);
      setDocs(d);
      setDriver(dr);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const docFor = (type: DocType) => docs.find((d) => d.doc_type === type) ?? null;

  const pickAndUpload = async (docType: DocType) => {
    if (uploading) return;
    try {
      // Selfie → camera; documents → gallery.
      const useCamera = docType === 'selfie';
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', useCamera
          ? 'Permita o acesso à câmera para enviar a selfie.'
          : 'Permita o acesso à galeria para enviar o documento.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, cameraType: ImagePicker.CameraType.front })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });

      if (result.canceled || !result.assets?.[0]?.base64) return;

      setUploading(docType);
      await uploadDocument(docType, result.assets[0].base64);
      await load();
      Alert.alert('Enviado!', 'Documento enviado. Nossa equipe vai analisar em até 24h.');
    } catch (e: any) {
      Alert.alert('Erro ao enviar', e?.message ?? 'Não foi possível enviar o documento. Tente novamente.');
    } finally {
      setUploading(null);
    }
  };

  // Overall verification banner from the driver's aggregate documents_status.
  const allUploaded = DOC_SLOTS.every((s) => docFor(s.type));
  const banner = driver?.is_verified
    ? { color: Colors.success, icon: CheckCircle, title: 'Conta verificada', desc: 'Seus documentos foram aprovados. Você pode receber corridas.' }
    : driver?.documents_status === 'rejected'
      ? { color: Colors.danger, icon: AlertCircle, title: 'Documentos recusados', desc: 'Reenvie os documentos com fotos nítidas, sem cortes e bem iluminadas.' }
      : !allUploaded
        ? { color: Colors.warning, icon: AlertCircle, title: 'Documentos pendentes', desc: 'Envie todos os documentos para ativar sua conta de motorista.' }
        : { color: Colors.info, icon: Clock, title: 'Em análise', desc: 'Recebemos seus documentos. A verificação leva até 24h úteis.' };

  const BannerIcon = banner.icon;

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

      {loading && docs.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        >
          {/* Verification banner */}
          <Card style={{ ...styles.verifyCard, borderColor: banner.color + '44', backgroundColor: banner.color + '11' }}>
            <View style={styles.verifyRow}>
              <View style={[styles.verifyIconWrap, { backgroundColor: banner.color + '22' }]}>
                <BannerIcon size={22} color={banner.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyTitle, { color: banner.color }]}>{banner.title}</Text>
                <Text style={styles.verifyDesc}>{banner.desc}</Text>
              </View>
            </View>
          </Card>

          {/* Document slots */}
          {DOC_SLOTS.map((slot) => {
            const doc = docFor(slot.type);
            const status = !doc
              ? { label: 'Não enviado', variant: 'muted' as const }
              : doc.verified
                ? { label: 'Aprovado', variant: 'success' as const }
                : { label: 'Em análise', variant: 'warning' as const };
            const isUploading = uploading === slot.type;
            const SlotIcon = slot.icon;

            return (
              <Card key={slot.type} style={styles.docCard}>
                <View style={styles.docHeader}>
                  {doc?.previewUrl ? (
                    <Image source={{ uri: doc.previewUrl }} style={styles.docThumb} />
                  ) : (
                    <View style={styles.docIconWrap}><SlotIcon size={20} color={Colors.primary} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{slot.label}</Text>
                    <Text style={styles.docDate}>
                      {doc ? `Enviado em ${fmtDate(doc.uploaded_at)}` : 'Aguardando envio'}
                    </Text>
                  </View>
                  <Badge label={status.label} variant={status.variant} />
                </View>

                {/* Approved docs can't be changed; others can be (re)uploaded. */}
                {!doc?.verified && (
                  <TouchableOpacity
                    style={styles.reuploadBtn}
                    onPress={() => pickAndUpload(slot.type)}
                    disabled={isUploading}
                    activeOpacity={0.8}
                  >
                    {isUploading ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <>
                        <Upload size={15} color={Colors.primary} />
                        <Text style={styles.reuploadText}>{doc ? 'Substituir documento' : 'Enviar documento'}</Text>
                      </>
                    )}
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
                Todos os documentos são verificados manualmente pela equipe Rotta Urbana em até 24 horas úteis. Suas informações são armazenadas com segurança em ambiente privado.
              </Text>
            </View>
          </Card>
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
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...Typography.h4, color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  verifyCard: { padding: 16, borderWidth: 1 },
  verifyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  verifyIconWrap: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  verifyTitle: { ...Typography.bodyMedium, marginBottom: 4 },
  verifyDesc: { ...Typography.small, color: Colors.textSecondary, lineHeight: 20 },
  docCard: { padding: 16 },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIconWrap: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  docThumb: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.border },
  docLabel: { ...Typography.bodyMedium, color: Colors.textPrimary },
  docDate: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  reuploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingVertical: 11, borderRadius: Radius.md, minHeight: 42,
    backgroundColor: Colors.primary + '11', borderWidth: 1, borderColor: Colors.primary + '33',
  },
  reuploadText: { ...Typography.smallMedium, color: Colors.primary },
  infoCard: { padding: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoText: { ...Typography.small, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
});

export default DriverDocumentsScreen;
