-- ============================================================================
-- Rotta Urbana — 0009: RPC functions (app business logic, callable via PostgREST)
-- ----------------------------------------------------------------------------
-- All are SECURITY DEFINER with a pinned search_path. Because definers bypass
-- RLS, every function re-checks auth.uid()/role itself. User-controlled ids are
-- never trusted: ownership is always derived from auth.uid().
-- ============================================================================
set search_path = public, extensions;

-- ─── fare estimate ─────────────────────────────────────────────────────────
create or replace function public.fare_estimate(
  p_ride_type   public.ride_type,
  p_distance_km numeric,
  p_duration_min integer
) returns numeric
language sql stable security definer set search_path = public, extensions
as $$
  select greatest(
    f.min_fare,
    round(f.base_fare + (f.per_km * coalesce(p_distance_km,0)) + (f.per_min * coalesce(p_duration_min,0)), 2)
  )
  from public.fare_config f
  where f.ride_type = p_ride_type;
$$;

-- ─── nearby drivers (geospatial KNN; safe discovery for passengers) ────────
create or replace function public.nearby_drivers(
  p_lat numeric, p_lng numeric,
  p_radius_m integer default 5000,
  p_limit integer default 10
) returns table (
  driver_id uuid, full_name text, rating numeric,
  vehicle_model text, vehicle_plate text, vehicle_type public.vehicle_type,
  lat double precision, lng double precision, distance_m double precision,
  heading numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  with origin as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  )
  select d.id, p.full_name, p.rating,
         v.model, v.plate::text, v.type,
         ST_Y(d.current_location::geometry), ST_X(d.current_location::geometry),
         ST_Distance(d.current_location, o.g), d.heading
  from public.drivers d
  join public.profiles p on p.id = d.id
  cross join origin o
  left join lateral (
    select model, plate, type from public.vehicles
    where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  where d.status = 'online'
    and d.is_verified
    and d.current_location is not null
    and ST_DWithin(d.current_location, o.g, p_radius_m)
  order by d.current_location <-> o.g
  limit greatest(1, least(p_limit, 50));
$$;

-- ─── update own driver location ────────────────────────────────────────────
create or replace function public.update_driver_location(
  p_lat numeric, p_lng numeric, p_heading numeric default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.drivers
     set current_location    = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
         location_updated_at = now(),
         heading             = p_heading
   where id = auth.uid();
  if not found then raise exception 'not a driver'; end if;
end;
$$;

-- ─── set own driver online/offline ─────────────────────────────────────────
create or replace function public.set_driver_status(p_status public.driver_status)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare v_driver public.drivers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status = 'online' and not public.is_active_driver() then
    raise exception 'driver not verified';
  end if;
  update public.drivers set status = p_status
   where id = auth.uid()
   returning * into v_driver;
  if not found then raise exception 'not a driver'; end if;
  return v_driver;
end;
$$;

-- ─── request a ride (passenger) ────────────────────────────────────────────
create or replace function public.request_ride(
  p_origin_lat numeric, p_origin_lng numeric, p_origin_address text,
  p_dest_lat numeric,   p_dest_lng numeric,   p_dest_address text,
  p_ride_type public.ride_type default 'economy',
  p_payment_method public.payment_method default 'pix'
) returns public.rides
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_origin   geography := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  v_dest     geography := ST_SetSRID(ST_MakePoint(p_dest_lng,   p_dest_lat),   4326)::geography;
  v_dist_km  numeric;
  v_dur_min  integer;
  v_price    numeric;
  v_ride     public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- reject if passenger already has an active ride
  if exists (
    select 1 from public.rides
    where passenger_id = auth.uid()
      and status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
  ) then
    raise exception 'you already have an active ride';
  end if;

  v_dist_km := round((ST_Distance(v_origin, v_dest) / 1000.0)::numeric, 2);
  v_dur_min := greatest(1, ceil((v_dist_km / 30.0) * 60)::int);   -- ~30 km/h avg
  v_price   := public.fare_estimate(p_ride_type, v_dist_km, v_dur_min);

  insert into public.rides (
    passenger_id, status, ride_type, origin, origin_address,
    destination, destination_address, price, distance_km, duration_min, payment_method
  ) values (
    auth.uid(), 'searching', p_ride_type, v_origin, p_origin_address,
    v_dest, p_dest_address, v_price, v_dist_km, v_dur_min, p_payment_method
  ) returning * into v_ride;

  return v_ride;
end;
$$;

-- ─── accept a ride (driver) — atomic claim ─────────────────────────────────
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides;
begin
  if not public.is_active_driver() then raise exception 'driver not verified'; end if;

  update public.rides
     set driver_id = auth.uid(), status = 'driver_on_way', accepted_at = now()
   where id = p_ride_id and status = 'searching' and driver_id is null
   returning * into v_ride;

  if not found then raise exception 'ride no longer available'; end if;

  update public.drivers set status = 'on_ride' where id = auth.uid();
  return v_ride;
end;
$$;

-- ─── advance ride status (driver) ──────────────────────────────────────────
create or replace function public.update_ride_status(p_ride_id uuid, p_status public.ride_status)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status not in ('driver_arrived','in_progress','completed') then
    raise exception 'invalid status transition';
  end if;

  update public.rides
     set status      = p_status,
         arrived_at   = case when p_status = 'driver_arrived' then now() else arrived_at end,
         started_at   = case when p_status = 'in_progress'   then now() else started_at end,
         completed_at = case when p_status = 'completed'     then now() else completed_at end
   where id = p_ride_id and driver_id = auth.uid()
     and status in ('driver_on_way','driver_arrived','in_progress')
   returning * into v_ride;

  if not found then raise exception 'ride not found or not yours'; end if;

  if p_status = 'completed' then
    update public.drivers
       set status = 'online', total_rides = total_rides + 1
     where id = auth.uid();
  end if;
  return v_ride;
end;
$$;

-- ─── cancel a ride (passenger or assigned driver) ──────────────────────────
create or replace function public.cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides; v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_role := public.current_user_role();

  update public.rides
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = p_reason, cancelled_by = v_role
   where id = p_ride_id
     and (passenger_id = auth.uid() or driver_id = auth.uid())
     and status in ('searching','driver_found','driver_on_way','driver_arrived')
   returning * into v_ride;

  if not found then raise exception 'ride not cancellable'; end if;

  if v_ride.driver_id is not null then
    update public.drivers set status = 'online' where id = v_ride.driver_id;
  end if;
  return v_ride;
end;
$$;

-- ─── rate a ride (either party) ────────────────────────────────────────────
create or replace function public.rate_ride(p_ride_id uuid, p_stars integer, p_comment text default null)
returns public.ride_ratings
language plpgsql security definer set search_path = public
as $$
declare v_rating public.ride_ratings; v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'stars must be 1..5'; end if;

  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id and r.status = 'completed'
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  ) then
    raise exception 'ride not found, not completed, or not yours';
  end if;

  v_role := public.current_user_role();
  insert into public.ride_ratings (ride_id, rater_id, rater_role, stars, comment)
  values (p_ride_id, auth.uid(), v_role, p_stars, p_comment)
  returning * into v_rating;
  return v_rating;
end;
$$;

-- Functions are callable by logged-in users (each enforces its own auth).
grant execute on all functions in schema public to authenticated, service_role;

comment on function public.nearby_drivers is 'Geospatial KNN search of online verified drivers near a point (privacy-limited columns).';
comment on function public.request_ride   is 'Creates a ride for the caller; prices it from PostGIS distance + fare_config.';
comment on function public.accept_ride     is 'Atomic driver claim of a searching ride (race-safe).';
