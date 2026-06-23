-- ============================================================================
-- Rotta Urbana — 0039a: adicionar role 'manager' ao enum user_role
-- MUST run in its own transaction before any code uses the new value.
-- ============================================================================
set search_path = public, extensions;

alter type public.user_role add value if not exists 'manager';
