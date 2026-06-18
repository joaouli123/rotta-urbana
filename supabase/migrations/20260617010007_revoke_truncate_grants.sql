-- ============================================================================
-- Rotta Urbana — 0030: defense-in-depth — strip TRUNCATE/TRIGGER/REFERENCES
-- ----------------------------------------------------------------------------
-- Supabase's defaults grant the full table privilege set (incl. TRUNCATE,
-- TRIGGER, REFERENCES) to anon/authenticated on every public table. RLS does
-- NOT gate TRUNCATE, so a raw-SQL connection as `authenticated` could wipe a
-- table. It is not reachable through PostgREST today (clients never get a SQL
-- session for that role), but these privileges are never needed by the app, so
-- we revoke them. DML (select/insert/update/delete) is left intact and remains
-- governed by RLS — service_role keeps everything.
-- ============================================================================
set search_path = public, extensions;

revoke truncate, trigger, references on all tables in schema public from authenticated;
revoke truncate, trigger, references on all tables in schema public from anon;

-- Stop future tables (created by this role) from re-granting them.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated, anon;
