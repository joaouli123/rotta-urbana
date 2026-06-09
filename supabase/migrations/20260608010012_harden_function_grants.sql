-- ============================================================================
-- Rotta Urbana — 0012: harden function execution privileges
-- ----------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function by default — that
-- would let the anon role call e.g. nearby_drivers() and scrape driver
-- locations. We revoke PUBLIC and re-grant only to the roles that should call.
-- ============================================================================
set search_path = public, extensions;

revoke execute on all functions in schema public from public;

grant execute on all functions in schema public to authenticated, service_role;

-- Keep server-only helpers off the authenticated role.
revoke execute on function public.confirm_payment(uuid, text) from authenticated;
