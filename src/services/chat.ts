import { supabase } from '../lib/supabase';

export interface ChatMessage {
  id: string;
  ride_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export async function getMessages(rideId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('ride_messages').select('*').eq('ride_id', rideId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

export async function sendMessage(rideId: string, body: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('not authenticated');
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase
    .from('ride_messages').insert({ ride_id: rideId, sender_id: u.user.id, body: text });
  if (error) throw error;
}

/** Realtime: new chat messages for a ride. */
export function subscribeMessages(rideId: string, onInsert: (m: ChatMessage) => void, key = '') {
  const channel = supabase
    .channel(`msgs:${rideId}${key ? ':' + key : ''}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` },
      (payload) => onInsert(payload.new as ChatMessage))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}
