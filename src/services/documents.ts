import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

export type DocType = 'cnh' | 'rg' | 'vehicle_doc' | 'selfie';

export interface DriverDocument {
  id: string;
  doc_type: DocType;
  file_path: string;
  verified: boolean;
  uploaded_at: string;
  reviewed_at: string | null;
  previewUrl?: string | null;
}

const BUCKET = 'driver-docs';

/** All documents the logged-in driver has uploaded, with short-lived preview URLs. */
export async function getMyDocuments(): Promise<DriverDocument[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');

  const { data, error } = await supabase
    .from('driver_documents')
    .select('id, doc_type, file_path, verified, uploaded_at, reviewed_at')
    .eq('driver_id', u.user.id);
  if (error) throw error;

  const docs = (data as DriverDocument[]) ?? [];

  // Sign each file for in-app preview (private bucket).
  await Promise.all(docs.map(async (d) => {
    if (!d.file_path) return;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 3600);
    d.previewUrl = signed?.signedUrl ?? null;
  }));

  return docs;
}

/**
 * Upload (or replace) a driver document.
 * @param docType which document slot
 * @param base64  the file content as a base64 string
 * @param opts    content type + extension (defaults to JPEG for camera/gallery;
 *                pass e.g. { contentType: 'application/pdf', ext: 'pdf' } for files)
 */
export async function uploadDocument(
  docType: DocType,
  base64: string,
  opts?: { contentType?: string; ext?: string },
): Promise<void> {
  // Guard against empty/undersized base64 (incomplete read on slow mobile nets)
  // that would otherwise upload a corrupt, unreadable file.
  if (!base64 || base64.length < 100) throw new Error('Arquivo inválido ou incompleto. Tente novamente.');
  const contentType = opts?.contentType || 'image/jpeg';
  const ext = (opts?.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const uid = u.user.id;

  // Storage RLS requires the first folder segment to equal the user's id.
  const path = `${uid}/${docType}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType, upsert: true });
  if (upErr) throw upErr;

  // Upsert the DB row (re-uploading resets it to pending review).
  const { error: dbErr } = await supabase
    .from('driver_documents')
    .upsert(
      { driver_id: uid, doc_type: docType, file_path: path, verified: false, reviewed_at: null },
      { onConflict: 'driver_id,doc_type' },
    );
  if (dbErr) throw dbErr;
}
