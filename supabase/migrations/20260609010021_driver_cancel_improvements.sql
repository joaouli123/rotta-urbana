-- ============================================================================
-- Rotta Urbana — 0021: driver cancel improvements
-- ----------------------------------------------------------------------------
-- 1. Allow drivers to cancel an in_progress ride (e.g., emergency, hazard).
-- 2. Add admin_cancelled_rides() RPC so the admin panel can review all
--    driver/passenger cancellations with reasons.
-- ============================================================================
set search_path = public, extensions;

-- ─── 1. Re-allow cancel_ride for in_progress rides ──────────────────────────
-- Previously only allowed up to 'driver_arrived'. Drivers need to be able to
-- cancel emergencies or hazardous situations even after a trip has started.
create or replace function public.cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides; v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_role := public.current_user_role();

  update public.rides
     set status       = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         cancelled_by  = v_role
   where id = p_ride_id
     and (passenger_id = auth.uid() or driver_id = auth.uid())
     and status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
   returning * into v_ride;

  if not found then raise exception 'ride not cancellable'; end if;

  -- Release the driver back to online status if one was assigned.
  if v_ride.driver_id is not null then
    update public.drivers set status = 'online' where id = v_ride.driver_id;
  end if;

  return v_ride;
end;
$$;

-- ─── 2. Admin: list cancelled rides with passenger/driver names ──────────────
create or replace function public.admin_cancelled_rides(p_limit int default 50)
returns table (
  ride_id           uuid,
  passenger_name    text,
  driver_name       text,
  origin_address    text,
  destination_address text,
  cancel_reason     text,
  cancelled_by      public.user_role,
  cancelled_at      timestamptz,
  requested_at      timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    r.id,
    pp.full_name,
    dp.full_name,
    r.origin_address,
    r.destination_address,
    r.cancel_reason,
    r.cancelled_by,
    r.cancelled_at,
    r.requested_at
  from public.rides r
  join  public.profiles pp on pp.id = r.passenger_id
  left  join public.profiles dp on dp.id = r.driver_id
  where r.status = 'cancelled'
    and public.is_admin()
  order by r.cancelled_at desc nulls last
  limit greatest(1, least(p_limit, 200));
$$;

-- Grant: admin users are in the `authenticated` role; the function itself
-- checks is_admin() so non-admins get an empty result set.
grant execute on function public.admin_cancelled_rides to authenticated, service_role;
