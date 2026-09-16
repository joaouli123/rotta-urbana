-- Rotta Urbana — audit trail for destination changes during a ride.
--
-- Until now update_ride_destination overwrote destination/price in place, so a
-- later dispute ("I never asked for that", "the fare changed") had no evidence.
-- Every change now writes a row inside the SAME transaction as the update, so a
-- route change without a record is impossible.
set search_path = public, extensions;

create table if not exists public.ride_destination_changes (
  id                       uuid primary key default gen_random_uuid(),
  ride_id                  uuid not null references public.rides(id) on delete cascade,
  changed_by               uuid references public.profiles(id) on delete set null,
  changed_by_role          text not null check (changed_by_role in ('passenger', 'driver')),
  ride_status              public.ride_status not null,
  previous_destination     geography(Point, 4326),
  previous_address         text,
  previous_price           numeric(10,2),
  previous_distance_km     numeric(10,2),
  previous_duration_min    integer,
  new_destination          geography(Point, 4326) not null,
  new_address              text not null,
  new_price                numeric(10,2),
  new_distance_km          numeric(10,2),
  new_duration_min         integer,
  created_at               timestamptz not null default now()
);

create index if not exists ride_destination_changes_ride_idx
  on public.ride_destination_changes (ride_id, created_at desc);

alter table public.ride_destination_changes enable row level security;

-- Read-only for the two people on the ride; admins see everything. Nobody
-- writes directly: only update_ride_destination (security definer) inserts.
drop policy if exists ride_destination_changes_select on public.ride_destination_changes;
create policy ride_destination_changes_select on public.ride_destination_changes
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.rides r
       where r.id = ride_destination_changes.ride_id
         and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

revoke all on public.ride_destination_changes from public, anon;
grant select on public.ride_destination_changes to authenticated;
grant select, insert on public.ride_destination_changes to service_role;

comment on table public.ride_destination_changes is
  'Immutable log of every destination change on an active ride, written by update_ride_destination.';

-- Same function as before (authorization, service-area check and fare
-- recalculation are unchanged) plus the audit insert before the update.
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
  v_role text;
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
     and (driver_id = auth.uid() or passenger_id = auth.uid())
   for update;
  if not found then
    raise exception 'ride not found or not assigned to this user';
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

  -- The caller passed the authorization check above, so they are exactly one
  -- of the two parties on this ride.
  v_role := case when v_ride.driver_id = auth.uid() then 'driver' else 'passenger' end;

  insert into public.ride_destination_changes (
    ride_id, changed_by, changed_by_role, ride_status,
    previous_destination, previous_address, previous_price,
    previous_distance_km, previous_duration_min,
    new_destination, new_address, new_price, new_distance_km, new_duration_min
  ) values (
    p_ride_id, auth.uid(), v_role, v_ride.status,
    v_ride.destination, v_ride.destination_address, v_ride.price,
    v_ride.distance_km, v_ride.duration_min,
    v_dest, left(btrim(p_dest_address), 500), v_price, v_dist_km, v_dur_min
  );

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
  'Allows the assigned driver OR the assigned passenger to change an active ride destination inside the configured service area, recalculates its fare and logs the change in ride_destination_changes.';
