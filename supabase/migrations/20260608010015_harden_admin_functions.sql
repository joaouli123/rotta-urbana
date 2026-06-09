-- ============================================================================
-- Rotta Urbana — 0015: re-harden function grants (covers 0014 additions)
-- ----------------------------------------------------------------------------
-- New functions get a default EXECUTE to PUBLIC (which includes anon). 0013 only
-- revoked from `anon`, not PUBLIC, so admin_kpis() leaked to anon. Fix: strip
-- PUBLIC, re-grant intended roles, and make the sensitive functions
-- service_role-only (the admin web uses the secret key = service_role).
-- ============================================================================
set search_path = public, extensions;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;

-- Server-only: never callable by app users or anon.
revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_kpis()                 from public, anon, authenticated;
grant  execute on function public.confirm_payment(uuid, text) to service_role;
grant  execute on function public.admin_kpis()                 to service_role;
