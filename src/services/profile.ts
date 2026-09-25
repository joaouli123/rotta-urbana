import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import type { PickedFile } from '../lib/filePick';
import type { ProfileRow } from '../types/db';

export async function updateProfile(patch: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'avatar_url'>>): Promise<ProfileRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { data, error } = await supabase
    .from('profiles').update(patch).eq('id', u.user.id).select().single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * Uploads a profile photo to the public avatars bucket and saves its URL on
 * the profile. The ?v= makes the ride screens load the new photo instead of a
 * cached one at the same path.
 */
export async function uploadMyAvatar(file: PickedFile): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const path = `${u.user.id}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars')
    .upload(path, decode(file.base64), { contentType: file.contentType, upsert: true });
  if (error) throw error;
  const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  await updateProfile({ avatar_url: url });
  return url;
}

/**
 * Permanently deletes the logged-in user's account (Apple/Google requirement).
 * Calls the `delete-account` edge function (service-role), which removes the
 * auth user; FK cascades drop all related rows. Signs out locally afterwards.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  // Local-only sign-out: the server session is already gone with the user, so a
  // global logout would just round-trip a dead token (and could error on a flaky
  // network). Clear local storage and let it not throw.
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already signed out */ }
}

export async function openSupportTicket(subject: string, message: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { data, error } = await supabase
    .from('support_tickets').insert({ user_id: u.user.id, subject, message })
    .select('id').single();
  if (error) throw error;
  return (data?.id as string) ?? '';
}

export interface MySupportTicket {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  response: string | null;
  created_at: string;
  updated_at: string;
}

export async function getMySupportTickets(limit = 10): Promise<MySupportTicket[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id,subject,message,status,response,created_at,updated_at')
    .eq('user_id', u.user.id)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (error) throw error;
  return (data ?? []) as MySupportTicket[];
}
