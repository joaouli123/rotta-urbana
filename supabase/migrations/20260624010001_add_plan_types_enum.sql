-- ============================================================================
-- Rotta Urbana — 0040a: adicionar 'commission' e 'weekly' ao enum plan_type
-- MUST run in its own transaction before code that uses the new values.
-- ============================================================================
set search_path = public, extensions;

alter type public.plan_type add value if not exists 'commission';
alter type public.plan_type add value if not exists 'weekly';
