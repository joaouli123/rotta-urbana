-- ============================================================================
-- Rotta Urbana — 0026: per-category breakdowns in admin_kpis (incl. moto)
-- ----------------------------------------------------------------------------
-- The admin dashboards want full operational visibility per ride category
-- (moto/economy/comfort/premium): how many completed rides and how much gross
-- fare each generated in the last 30 days. Added as two JSON maps so the
-- payload stays one round-trip and the front-ends just index by ride_type.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.admin_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'passengers',          (select count(*) from public.profiles where role = 'passenger'),
    'drivers_total',       (select count(*) from public.drivers),
    'drivers_online',      (select count(*) from public.drivers where status = 'online'),
    'drivers_on_ride',     (select count(*) from public.drivers where status = 'on_ride'),
    'drivers_verified',    (select count(*) from public.drivers where is_verified),
    'drivers_pending',     (select count(*) from public.drivers where documents_status = 'pending'),
    'rides_total',         (select count(*) from public.rides),
    'rides_today',         (select count(*) from public.rides where requested_at >= date_trunc('day', now())),
    'rides_week',          (select count(*) from public.rides where requested_at >= now() - interval '7 days'),
    'rides_month',         (select count(*) from public.rides where requested_at >= now() - interval '30 days'),
    'rides_in_progress',   (select count(*) from public.rides where status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')),
    'rides_completed',     (select count(*) from public.rides where status = 'completed'),
    'rides_cancelled',     (select count(*) from public.rides where status = 'cancelled'),
    'gross_fares_month',   (select coalesce(sum(price),0) from public.rides where status = 'completed' and completed_at >= now() - interval '30 days'),
    'subs_active',         (select count(*) from public.subscriptions where status = 'active'),
    'subs_expired',        (select count(*) from public.subscriptions where status <> 'active'),
    'revenue_subscriptions',(select coalesce(sum(amount),0) from public.payments where status = 'approved'),
    'support_open',        (select count(*) from public.support_tickets where status = 'open'),
    -- per-category breakdowns (last 30 days, completed rides), incl. moto
    'rides_by_type', (
      select coalesce(jsonb_object_agg(ride_type, c), '{}'::jsonb)
      from (
        select ride_type::text as ride_type, count(*) as c
        from public.rides
        where status = 'completed' and completed_at >= now() - interval '30 days'
        group by ride_type
      ) t
    ),
    'gross_fares_by_type', (
      select coalesce(jsonb_object_agg(ride_type, s), '{}'::jsonb)
      from (
        select ride_type::text as ride_type, coalesce(sum(price),0) as s
        from public.rides
        where status = 'completed' and completed_at >= now() - interval '30 days'
        group by ride_type
      ) t
    )
  ) into result;
  return result;
end;
$$;

-- preserve the existing access posture (admin app + service web; never anon)
grant execute on function public.admin_kpis() to authenticated, service_role;
revoke execute on function public.admin_kpis() from anon;

comment on function public.admin_kpis is
  'Aggregated KPIs for the admin dashboard incl. per-category breakdowns (service_role or admin only).';
