// Shared document/photo picking for driver documents and the selfie.
// - Selfie  → camera only (front camera).
// - Documents → user chooses: take a photo, pick from gallery, or pick a file
//   (PDF/image) from the device's files.
// Returns base64 + the content type/extension so non-image files (PDF) upload
// with the correct type instead of being forced to .jpg.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedFile {
  base64: string;
  contentType: string;
  ext: string;
}

function validate(b64?: string | null): string {
  if (!b64 || b64.length < 100) throw new Error('Arquivo inválido ou incompleto. Tente novamente.');
  return b64;
}

/** Take a photo with the camera. `front` for selfies. */
export async function pickFromCamera(front = false): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Permita o acesso à câmera para tirar a foto.');
  const r = await ImagePicker.launchCameraAsync({
    quality: 0.5,
    base64: true,
    ...(front ? { cameraType: ImagePicker.CameraType.front } : {}),
  });
  if (r.canceled) return null;
  return { base64: validate(r.assets?.[0]?.base64), contentType: 'image/jpeg', ext: 'jpg' };
}

/** Pick an existing image from the photo gallery. */
export async function pickFromGallery(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Permita o acesso à galeria para enviar a imagem.');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
  if (r.canceled) return null;
  return { base64: validate(r.assets?.[0]?.base64), contentType: 'image/jpeg', ext: 'jpg' };
}

/** Pick any file (PDF or image) from the device's files. */
export async function pickFromFiles(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled) return null;
  const asset = r.assets?.[0];
  if (!asset?.uri) return null;
  const base64 = validate(await new File(asset.uri).base64());
  const mime = asset.mimeType || 'application/octet-stream';
  const ext = mime.includes('pdf') ? 'pdf'
    : (asset.name?.split('.').pop()?.toLowerCase() || 'jpg');
  return { base64, contentType: mime, ext };
}

/**
 * Ask the user how to send a document (camera / gallery / files) and return the
 * picked file. Resolves null if the user cancels.
 */
export function chooseAndPickDocument(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    Alert.alert(
      'Enviar documento',
      'Como você quer enviar?',
      [
        { text: 'Tirar foto', onPress: () => pickFromCamera(false).then(resolve).catch(reject) },
        { text: 'Galeria', onPress: () => pickFromGallery().then(resolve).catch(reject) },
        { text: 'Arquivos (PDF)', onPress: () => pickFromFiles().then(resolve).catch(reject) },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
