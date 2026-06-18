-- ============================================================================
-- Rotta Urbana — 0023: cash ride payment + driver subscription web portal
-- ----------------------------------------------------------------------------
-- 1. Add 'cash' (dinheiro) as a ride payment method — passenger pays the driver
--    in person; nothing flows through the platform.
-- 2. Add a configurable external URL where drivers pay the monthly subscription
--    (kept OUTSIDE the app to avoid the stores' "in-app subscription" rules).
-- ============================================================================
set search_path = public, extensions;

-- 'cash' is only added here (not used in this migration), so it is safe inside
-- the migration transaction on PG12+.
alter type public.payment_method add value if not exists 'cash';

alter table public.app_settings
  add column if not exists subscription_portal_url text;
