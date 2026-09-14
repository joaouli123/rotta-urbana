-- Rotta Urbana — destination changes requested by the passenger during a ride.
-- The driver can only change the destination of their own active ride. The
-- database recalculates the fare using the same server-side rule as request_ride
-- and the existing service-area trigger rejects destinations outside scope.
set search_path = public, extensions;

create or replace function public.update_ride_destination(
  p_ride_id uuid,
  p_dest_lat numeric,
  p_dest_lng numeric,
  p_dest_address text
)
returns public.rides
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ride public.rides;
  v_dest geography;
  v_dist_km numeric;
  v_dur_min integer;
  v_price numeric;
  v_scope text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_dest_lat is null or p_dest_lng is null
     or p_dest_lat < -90 or p_dest_lat > 90
     or p_dest_lng < -180 or p_dest_lng > 180 then
    raise exception 'invalid destination coordinates';
  end if;
  if nullif(btrim(p_dest_address), '') is null then
    raise exception 'destination address is required';
  end if;

  select * into v_ride
    from public.rides
   where id = p_ride_id
     and driver_id = auth.uid()
   for update;
  if not found then
    raise exception 'ride not found or not assigned to driver';
  end if;
  if v_ride.status not in ('driver_on_way', 'driver_arrived', 'in_progress') then
    raise exception 'destination can only be changed during an active ride';
  end if;

  select coalesce(service_area_scope, 'radius') into v_scope
    from public.app_settings
   where id = 1;
  if coalesce(v_scope, 'radius') = 'radius' then
    if not public.service_area_allows_point(p_dest_lng, p_dest_lat) then
      raise exception 'destination outside service area';
    end if;
  elsif not public.service_area_allows_address(p_dest_address) then
    raise exception 'destination outside service area';
  end if;

  v_dest := ST_SetSRID(ST_MakePoint(p_dest_lng, p_dest_lat), 4326)::geography;
  v_dist_km := round((ST_Distance(v_ride.origin, v_dest) / 1000.0)::numeric, 2);
  v_dur_min := greatest(1, ceil((v_dist_km / 30.0) * 60)::int);
  v_price := public.fare_estimate(v_ride.ride_type, v_dist_km, v_dur_min);

  update public.rides
     set destination = v_dest,
         destination_address = left(btrim(p_dest_address), 500),
         distance_km = v_dist_km,
         duration_min = v_dur_min,
         price = v_price
   where id = p_ride_id
   returning * into v_ride;

  return v_ride;
end;
$$;

grant execute on function public.update_ride_destination(uuid, numeric, numeric, text)
  to authenticated, service_role;
revoke execute on function public.update_ride_destination(uuid, numeric, numeric, text)
  from public, anon;

comment on function public.update_ride_destination is
  'Allows the assigned driver to change an active ride destination inside the configured service area and recalculates its fare.';
