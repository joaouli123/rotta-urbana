-- ============================================================================
-- Rotta Urbana — 0018: live ride tracking RPCs
-- ----------------------------------------------------------------------------
-- PostGIS geography columns come back as WKB hex over PostgREST, which the app
-- can't use directly. These RPCs return plain lat/lng so the app can draw the
-- driver marker + route lines. Both are restricted to the ride's participants.
-- ============================================================================
set search_path = public, extensions;

-- Origin/destination of a ride as lat/lng (for drawing the trip route).
create or replace function public.ride_points(p_ride_id uuid)
returns table (
  origin_lat double precision, origin_lng double precision,
  dest_lat double precision,   dest_lng double precision,
  status public.ride_status
)
language sql stable security definer set search_path = public, extensions
as $$
  select ST_Y(r.origin::geometry), ST_X(r.origin::geometry),
         ST_Y(r.destination::geometry), ST_X(r.destination::geometry), r.status
  from public.rides r
  where r.id = p_ride_id
    and (r.passenger_id = auth.uid() or r.driver_id = auth.uid() or public.is_admin());
$$;

-- Live location of the driver assigned to a ride (for the moving car + line).
create or replace function public.ride_driver_location(p_ride_id uuid)
returns table (
  lat double precision, lng double precision, heading numeric, updated_at timestamptz
)
language sql stable security definer set search_path = public, extensions
as $$
  select ST_Y(d.current_location::geometry), ST_X(d.current_location::geometry),
         d.heading, d.location_updated_at
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  where r.id = p_ride_id
    and (r.passenger_id = auth.uid() or r.driver_id = auth.uid() or public.is_admin())
    and d.current_location is not null;
$$;

-- Lock down: authenticated may call; anon/public may not.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_kpis()                 from public, anon, authenticated;
grant  execute on function public.confirm_payment(uuid, text) to service_role;
grant  execute on function public.admin_kpis()                 to service_role;
