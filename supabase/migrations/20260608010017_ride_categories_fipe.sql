-- ============================================================================
-- Rotta Urbana — 0017: ride category eligibility (FIPE) + per-km is in fare_config
-- ----------------------------------------------------------------------------
-- Each of the 3 categories (economy/comfort/premium) already has pricing in
-- fare_config (base_fare, per_km, per_min, min_fare). Here we add ADMIN-EDITABLE
-- ELIGIBILITY rules per category (min year, min FIPE value, body types, seats,
-- colors) — the "how to pick Black cars" logic, like Uber tiers. Vehicles store
-- their FIPE value/code so we can match them to categories.
-- ============================================================================
set search_path = public, extensions;

-- ─── eligibility rules live alongside pricing, one row per category ─────────
alter table public.fare_config
  add column if not exists display_name          text,
  add column if not exists min_year              integer       not null default 0,
  add column if not exists min_fipe_value        numeric(12,2) not null default 0,
  add column if not exists allowed_vehicle_types text[]        not null default '{}',  -- empty = any
  add column if not exists min_seats             integer       not null default 4,
  add column if not exists require_colors        text[]        not null default '{}',  -- empty = any (lowercased)
  add column if not exists active                boolean       not null default true;

-- Sensible Brazil-2026 defaults (admin editable). premium ≈ "Black".
update public.fare_config set display_name='Economy', min_year=2010, min_fipe_value=0,      allowed_vehicle_types='{}',            min_seats=4, require_colors='{}'              where ride_type='economy';
update public.fare_config set display_name='Comfort', min_year=2016, min_fipe_value=60000,  allowed_vehicle_types='{sedan,suv}',   min_seats=4, require_colors='{}'              where ride_type='comfort';
update public.fare_config set display_name='Black',   min_year=2019, min_fipe_value=110000, allowed_vehicle_types='{sedan,suv}',   min_seats=4, require_colors='{preto,branco}'  where ride_type='premium';

-- ─── vehicles carry FIPE data + seats ──────────────────────────────────────
alter table public.vehicles
  add column if not exists brand       text,
  add column if not exists fipe_code   text,
  add column if not exists fipe_value  numeric(12,2),
  add column if not exists seats       integer not null default 4 check (seats between 1 and 9);

-- ─── eligibility predicate: does a vehicle qualify for a category? ──────────
create or replace function public.vehicle_qualifies(
  p_year int, p_fipe numeric, p_type public.vehicle_type, p_seats int, p_color text,
  p_ride_type public.ride_type
) returns boolean
language sql stable
as $$
  select case when not f.active then false else (
        coalesce(p_year, 0)  >= f.min_year
    and coalesce(p_fipe, 0)  >= f.min_fipe_value
    and coalesce(p_seats, 4) >= f.min_seats
    and (cardinality(f.allowed_vehicle_types) = 0 or p_type::text = any(f.allowed_vehicle_types))
    and (cardinality(f.require_colors) = 0 or lower(coalesce(p_color, '')) = any(f.require_colors))
  ) end
  from public.fare_config f
  where f.ride_type = p_ride_type;
$$;

-- ─── categories a driver's primary vehicle qualifies for ───────────────────
create or replace function public.driver_categories(p_driver uuid)
returns public.ride_type[]
language sql stable
as $$
  with v as (
    select year, fipe_value, type, seats, color
    from public.vehicles where driver_id = p_driver and is_primary
    order by created_at limit 1
  )
  select coalesce(array_agg(f.ride_type order by f.ride_type), '{}')
  from public.fare_config f, v
  where public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, f.ride_type);
$$;

create or replace function public.my_categories()
returns public.ride_type[]
language sql stable security definer set search_path = public
as $$ select public.driver_categories(auth.uid()); $$;

-- ─── nearby_drivers now filters by the requested category ──────────────────
drop function if exists public.nearby_drivers(numeric, numeric, integer, integer);
create or replace function public.nearby_drivers(
  p_lat numeric, p_lng numeric,
  p_radius_m integer default 5000,
  p_limit integer default 10,
  p_ride_type public.ride_type default null
) returns table (
  driver_id uuid, full_name text, rating numeric,
  vehicle_model text, vehicle_plate text, vehicle_type public.vehicle_type,
  lat double precision, lng double precision, distance_m double precision, heading numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  with origin as (select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g)
  select d.id, p.full_name, p.rating, v.model, v.plate::text, v.type,
         ST_Y(d.current_location::geometry), ST_X(d.current_location::geometry),
         ST_Distance(d.current_location, o.g), d.heading
  from public.drivers d
  join public.profiles p on p.id = d.id
  cross join origin o
  left join lateral (
    select model, plate, type, year, fipe_value, seats, color
    from public.vehicles where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  where d.status = 'online' and d.is_verified and d.current_location is not null
    and ST_DWithin(d.current_location, o.g, p_radius_m)
    and (p_ride_type is null
         or public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, p_ride_type))
  order by d.current_location <-> o.g
  limit greatest(1, least(p_limit, 50));
$$;

-- ─── accept_ride: driver's vehicle must qualify for the ride's category ─────
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides; v_type public.ride_type;
begin
  if not public.is_active_driver() then raise exception 'driver not verified'; end if;

  select ride_type into v_type from public.rides where id = p_ride_id;
  if not exists (
    select 1 from public.vehicles v
    where v.driver_id = auth.uid() and v.is_primary
      and public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, v_type)
  ) then
    raise exception 'seu veiculo nao atende a categoria desta corrida';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'driver_on_way', accepted_at = now()
   where id = p_ride_id and status = 'searching' and driver_id is null
   returning * into v_ride;
  if not found then raise exception 'ride no longer available'; end if;

  update public.drivers set status = 'on_ride' where id = auth.uid();
  return v_ride;
end;
$$;

-- ─── re-harden function grants (covers the new functions) ──────────────────
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_kpis()                 from public, anon, authenticated;
grant  execute on function public.confirm_payment(uuid, text) to service_role;
grant  execute on function public.admin_kpis()                 to service_role;

comment on function public.vehicle_qualifies is 'True if a vehicle meets a category''s admin-configured eligibility (year/FIPE/type/seats/color).';
comment on function public.driver_categories is 'Ride categories the driver''s primary vehicle qualifies for.';
