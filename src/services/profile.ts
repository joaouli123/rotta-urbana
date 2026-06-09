import { supabase } from '../lib/supabase';
import type { ProfileRow } from '../types/db';

export async function updateProfile(patch: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'avatar_url'>>): Promise<ProfileRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { data, error } = await supabase
    .from('profiles').update(patch).eq('id', u.user.id).select().single();
  if (error) throw error;
  return data as ProfileRow;
}

export async function openSupportTicket(subject: string, message: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const { error } = await supabase
    .from('support_tickets').insert({ user_id: u.user.id, subject, message });
  if (error) throw error;
}
