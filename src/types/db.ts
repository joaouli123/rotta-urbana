// Row shapes returned by Supabase (snake_case, matching the SQL schema).
export type Role = 'passenger' | 'driver' | 'admin' | 'manager';
export type DriverStatus = 'online' | 'offline' | 'on_ride';
export type RideStatusDb =
  | 'searching' | 'driver_found' | 'driver_on_way' | 'driver_arrived'
  | 'in_progress' | 'completed' | 'cancelled';
export type RideTypeDb = 'economy' | 'comfort' | 'premium' | 'moto';
export type PaymentMethodDb = 'pix' | 'card' | 'boleto' | 'cash';
export type SubscriptionStatus = 'active' | 'expired' | 'suspended';
export type Gender = 'female' | 'male' | 'other';

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  gender: Gender | null;
  avatar_url: string | null;
  rating: number;
  total_ratings: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  cpf?: string | null;
  address_cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_complement?: string | null;
  doc_rg_path?: string | null;
  doc_selfie_path?: string | null;
}

export interface DriverRow {
  id: string;
  status: DriverStatus;
  is_verified: boolean;
  documents_status: 'pending' | 'approved' | 'rejected';
  location_updated_at: string | null;
  heading: number | null;
  total_rides: number;
  operating_city?: string | null;
  operating_state?: string | null;
}

export interface RideRow {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  status: RideStatusDb;
  ride_type: RideTypeDb;
  origin_address: string;
  destination_address: string;
  price: number | null;
  distance_km: number | null;
  duration_min: number | null;
  payment_method: PaymentMethodDb;
  requires_female_driver: boolean;
  fare_paid: boolean;
  cancel_reason: string | null;
  cancelled_by: Role | null;
  requested_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface NearbyDriver {
  driver_id: string;
  full_name: string;
  rating: number;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  heading: number | null;
}

export interface SubscriptionRow {
  id: string;
  driver_id: string;
  status: SubscriptionStatus;
  plan?: 'commission' | 'daily' | 'weekly' | 'monthly';
  amount: number;
  due_date: string;
  paid_at: string | null;
  provider?: string | null;
  provider_subscription_id?: string | null;
  provider_status?: string | null;
  provider_payment_method_id?: string | null;
  next_payment_at?: string | null;
  provider_last_synced_at?: string | null;
  provider_cancelled_at?: string | null;
}

export interface AppSettings {
  platform_name: string;
  subscription_daily_amount: number;
  subscription_monthly_amount: number;
  default_plan: 'daily' | 'monthly';
  platform_pix_key: string;
  platform_pix_name: string;
  platform_pix_city: string;
  subscription_portal_url: string | null;
  // Extended plan fields (nullable — may not exist in older DB rows)
  commission_pct: number | null;
  plan_daily_price: number | null;
  plan_weekly_price: number | null;
}

export interface PaymentRow {
  id: string;
  driver_id?: string;
  subscription_id?: string | null;
  amount: number;
  method?: PaymentMethodDb;
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';
  provider?: string;
  provider_payment_id?: string | null;
  provider_status?: string | null;
  provider_subscription_id?: string | null;
  provider_authorized_payment_id?: string | null;
  external_reference?: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  expires_at: string | null;
  created_at: string;
  paid_at?: string | null;
  provider_metadata?: Record<string, unknown> | null;
}
