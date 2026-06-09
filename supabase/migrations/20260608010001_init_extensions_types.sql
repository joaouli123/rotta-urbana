-- ============================================================================
-- Rotta Urbana — 0001: Extensions, enum types and shared helper functions
-- ----------------------------------------------------------------------------
-- Security/engineering notes:
--  * Extensions live in the dedicated `extensions` schema (Supabase best
--    practice) — never in `public`.
--  * PostGIS powers all geospatial queries (nearest driver, distance, routes).
--  * citext gives case-insensitive uniqueness for emails / plates.
--  * Money is always numeric (never float). Time is always timestamptz.
--  * Every enum is a real Postgres type so bad values are impossible at the DB.
-- ============================================================================

create extension if not exists postgis      with schema extensions;
create extension if not exists citext        with schema extensions;
create extension if not exists pgcrypto      with schema extensions;  -- gen_random_uuid, crypto
create extension if not exists "uuid-ossp"   with schema extensions;

-- ─── Enum types ────────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role          as enum ('passenger', 'driver', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.driver_status      as enum ('online', 'offline', 'on_ride');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_type       as enum ('sedan', 'hatch', 'suv', 'moto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type      as enum ('cnh', 'rg', 'vehicle_doc', 'selfie');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status    as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('active', 'expired', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method     as enum ('pix', 'card', 'boleto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status     as enum ('pending', 'approved', 'rejected', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ride_status        as enum (
    'searching', 'driver_found', 'driver_on_way', 'driver_arrived',
    'in_progress', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ride_type          as enum ('economy', 'comfort', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status      as enum ('open', 'in_progress', 'closed');
exception when duplicate_object then null; end $$;

-- ─── Shared trigger: keep updated_at fresh ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'BEFORE UPDATE trigger that stamps updated_at = now().';

-- NOTE: RLS helper functions (is_admin, current_user_role, is_active_driver)
-- and the auth.users signup trigger live in 0007, after their tables exist.
