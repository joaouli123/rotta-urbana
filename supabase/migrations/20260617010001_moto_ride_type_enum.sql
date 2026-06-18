-- ============================================================================
-- Rotta Urbana — 0024: add 'moto' to the ride_type enum
-- ----------------------------------------------------------------------------
-- New ride modality: motorcycle. ALTER TYPE ... ADD VALUE must live in its OWN
-- migration: Postgres forbids using a freshly-added enum value in the same
-- transaction that adds it. The fare_config row + eligibility + function changes
-- that reference 'moto' live in the next migration (0025).
-- vehicle_type already includes 'moto' (added back in 0001), so no change there.
-- ============================================================================
set search_path = public, extensions;

alter type public.ride_type add value if not exists 'moto';
