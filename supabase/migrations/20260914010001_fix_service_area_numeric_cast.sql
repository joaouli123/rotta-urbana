-- Fix: enforce_ride_service_area() called service_area_allows_point() with
-- double precision arguments (ST_X/ST_Y return double precision), but the
-- function is declared with numeric parameters. Postgres only allows
-- double precision -> numeric via an assignment cast, not an implicit one,
-- so overload resolution failed with:
--   function public.service_area_allows_point(double precision, double precision) does not exist
-- This blocked every ride request. Casting explicitly at the call sites fixes it.
set search_path = public, extensions;

create or replace function public.enforce_ride_service_area()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_city text;
  v_state text;
begin
  if (select coalesce(service_area_scope, 'radius') from public.app_settings where id = 1) = 'radius'
     and (not public.service_area_allows_point(ST_X(new.origin::geometry)::numeric, ST_Y(new.origin::geometry)::numeric)
       or not public.service_area_allows_point(ST_X(new.destination::geometry)::numeric, ST_Y(new.destination::geometry)::numeric))
     or (select coalesce(service_area_scope, 'radius') from public.app_settings where id = 1) <> 'radius'
     and (not public.service_area_allows_address(new.origin_address)
       or not public.service_area_allows_address(new.destination_address)) then
    select service_area_city, service_area_state
      into v_city, v_state
      from public.app_settings
     where id = 1;
    raise exception 'ride outside service area: %/%', coalesce(v_city, 'Sinop'), coalesce(v_state, 'MT');
  end if;
  return new;
end;
$$;
