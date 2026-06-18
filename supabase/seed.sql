-- ============================================================================
-- Rotta Urbana — seed data (runs on `supabase db reset`)
-- ----------------------------------------------------------------------------
-- Demo users (admin/passenger/driver) are created via scripts/seed.mjs using
-- the Admin API, so the signup trigger fires and profiles are built correctly.
-- ============================================================================
set search_path = public, extensions;

-- Pricing per ride type (R$). Tune freely in the admin panel later.
-- 'moto' is the cheapest tier; eligibility (allowed_vehicle_types, seats, etc.)
-- is set by migration 0025 and editable in the admin panel.
insert into public.fare_config (ride_type, base_fare, per_km, per_min, min_fare) values
  ('moto',    3.00, 1.20, 0.20,  5.00),
  ('economy', 3.50, 1.80, 0.30,  7.00),
  ('comfort', 5.00, 2.40, 0.40, 10.00),
  ('premium', 8.00, 3.50, 0.60, 15.00)
on conflict (ride_type) do update set
  base_fare = excluded.base_fare,
  per_km    = excluded.per_km,
  per_min   = excluded.per_min,
  min_fare  = excluded.min_fare;
