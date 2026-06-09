-- ============================================================================
-- Rotta Urbana — 0013: lock the anon role out of the public schema
-- ----------------------------------------------------------------------------
-- Supabase's Data API auto-grants EXECUTE/SELECT to `anon` on new public
-- objects via an event trigger. That grant is EXPLICIT on the anon role, so the
-- earlier `REVOKE ... FROM PUBLIC` did NOT remove it — leaving anon able to call
-- SECURITY DEFINER functions (e.g. nearby_drivers leaking locations, or even
-- confirm_payment). Every flow in this app is authenticated, so we revoke anon
-- from public entirely. RLS already protects rows; this closes the function gap.
-- ============================================================================
set search_path = public, extensions;

revoke execute on all functions in schema public from anon;
revoke all     on all tables    in schema public from anon;
revoke all     on all sequences in schema public from anon;

-- Belt and suspenders for the server-only payment confirmer.
revoke execute on function public.confirm_payment(uuid, text) from anon, authenticated;

-- Make sure the intended roles still have what they need.
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.confirm_payment(uuid, text) to service_role;
