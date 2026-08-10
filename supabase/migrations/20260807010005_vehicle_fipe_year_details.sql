-- Rotta Urbana - preserve the complete FIPE year selection.
-- FIPE represents zero-km entries with the technical model year 32000.
-- The app stores the effective calendar year in vehicles.year for eligibility,
-- while these columns preserve the original FIPE value and selection details.

alter table public.vehicles
  add column if not exists fipe_year_code text,
  add column if not exists fipe_model_year integer,
  add column if not exists fipe_fuel text,
  add column if not exists fipe_reference text,
  add column if not exists fipe_zero_km boolean not null default false;

comment on column public.vehicles.fipe_year_code is 'Original FIPE year/fuel code, e.g. 2025-1 or 32000-1.';
comment on column public.vehicles.fipe_model_year is 'Raw FIPE model year; 32000 means zero-km in the FIPE base.';
comment on column public.vehicles.fipe_zero_km is 'True when the selected FIPE entry represents a zero-km vehicle.';
