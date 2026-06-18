-- ============================================================================
-- Rotta Urbana — 0025: moto pricing + eligibility, and exclude motos from cars
-- ----------------------------------------------------------------------------
-- Adds the 'moto' row to fare_config (km/R$ config, admin-editable later) with
-- its eligibility rules, and tightens 'economy' so a motorcycle no longer
-- silently qualifies as an economy car (economy previously accepted ANY type).
-- All pricing functions (fare_estimate / request_ride / vehicle_qualifies /
-- nearby_drivers / accept_ride / driver_categories) are already polymorphic over
-- ride_type, so they pick this up with no code change.
-- ============================================================================
set search_path = public, extensions;

-- ─── moto pricing + eligibility (admin-editable in the panel) ───────────────
-- Brazil-2026 defaults: moto is the cheapest tier. Motos seat 1 passenger.
insert into public.fare_config (
  ride_type, base_fare, per_km, per_min, min_fare,
  display_name, min_year, min_fipe_value, allowed_vehicle_types, min_seats, require_colors, active
) values (
  'moto', 3.00, 1.20, 0.20, 5.00,
  'Moto', 2012, 0, '{moto}', 1, '{}', true
)
on conflict (ride_type) do update set
  base_fare             = excluded.base_fare,
  per_km                = excluded.per_km,
  per_min               = excluded.per_min,
  min_fare              = excluded.min_fare,
  display_name          = excluded.display_name,
  min_year              = excluded.min_year,
  min_fipe_value        = excluded.min_fipe_value,
  allowed_vehicle_types = excluded.allowed_vehicle_types,
  min_seats             = excluded.min_seats,
  require_colors        = excluded.require_colors,
  active                = excluded.active;

-- ─── keep cars and motos in separate lanes (production-safe) ────────────────
-- 'economy' used allowed_vehicle_types='{}' (any), which let a moto qualify as
-- an economy car. We must restrict economy to 4-wheeled vehicles.
--
-- IMPORTANT: the economy/comfort/premium *rows* are only created in seed.sql,
-- which runs on `supabase db reset` (local) but NOT on a production `db push`.
-- So a bare UPDATE would match 0 rows in production and the separation (plus all
-- car pricing) would silently never apply. We therefore UPSERT the base car
-- rows here so a migration-only deploy has full pricing + correct eligibility.
-- On an already-seeded DB, ON CONFLICT only re-asserts allowed_vehicle_types
-- (the security-relevant field) and leaves any admin-tuned pricing untouched.
insert into public.fare_config (
  ride_type, base_fare, per_km, per_min, min_fare,
  display_name, min_year, min_fipe_value, allowed_vehicle_types, min_seats, require_colors, active
) values
  ('economy', 3.50, 1.80, 0.30,  7.00, 'Economy', 2010,      0, '{sedan,hatch,suv}', 4, '{}',             true),
  ('comfort', 5.00, 2.40, 0.40, 10.00, 'Comfort', 2016,  60000, '{sedan,suv}',       4, '{}',             true),
  ('premium', 8.00, 3.50, 0.60, 15.00, 'Black',   2019, 110000, '{sedan,suv}',       4, '{preto,branco}', true)
on conflict (ride_type) do update set
  allowed_vehicle_types = excluded.allowed_vehicle_types;

comment on table public.fare_config is
  'Pricing + admin-editable eligibility per ride type (economy/comfort/premium/moto).';
