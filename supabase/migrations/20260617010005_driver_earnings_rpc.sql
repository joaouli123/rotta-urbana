-- ============================================================================
-- Rotta Urbana — 0028: server-side driver earnings aggregation (scale fix)
-- ----------------------------------------------------------------------------
-- The earnings screen previously pulled EVERY completed ride for the driver to
-- the phone and summed client-side — unbounded payload that grows for the life
-- of the account. This RPC computes today/week/month/total + ride count in SQL
-- and returns one small JSON row. Identity is auth.uid() (a driver only ever
-- sees their own earnings); SECURITY DEFINER + pinned search_path.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.driver_earnings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'today', coalesce(sum(price) filter (where completed_at >= date_trunc('day', now())), 0),
    'week',  coalesce(sum(price) filter (where completed_at >= now() - interval '7 days'), 0),
    'month', coalesce(sum(price) filter (where completed_at >= now() - interval '30 days'), 0),
    'total', coalesce(sum(price), 0),
    'rides', count(*)
  )
  from public.rides
  where driver_id = auth.uid() and status = 'completed';
$$;

grant  execute on function public.driver_earnings() to authenticated, service_role;
revoke execute on function public.driver_earnings() from anon;

comment on function public.driver_earnings is
  'Aggregated earnings (today/week/month/total + ride count) for the calling driver.';
