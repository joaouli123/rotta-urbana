import { supabase } from '../lib/supabase';

export interface ManagerKpis {
  city: string;
  rides_today: number;
  rides_week: number;
  rides_month: number;
  drivers_total: number;
  drivers_verified: number;
  drivers_pending: number;
  support_open: number;
  rides_in_progress: number;
}

export async function getManagerKpis(): Promise<ManagerKpis> {
  const { data, error } = await supabase.rpc('manager_kpis');
  if (error) throw error;
  return data as ManagerKpis;
}
