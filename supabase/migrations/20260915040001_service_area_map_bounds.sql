-- Rotta Urbana — one map limit for every screen.
-- The app started the map with a 20 km box and later swapped it for the state
-- rectangle from a Mapbox geocode (or kept the box when that request failed),
-- so driver and passenger maps ended up with different limits. The limit now
-- comes from the same IBGE boundary that accepts or rejects the ride.
set search_path = public, extensions;

-- Bounding box of the configured area's stored boundary. null for the radius
-- scope, a disabled area or an area whose boundary is not stored yet: the app
-- then computes the limit itself.
create or replace function public.service_area_map_bounds()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  s public.app_settings%rowtype;
  v_scope text;
  v_country text;
  v_state text;
  v_city_key text;
  v_geom geometry;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not coalesce(s.service_area_enabled, true) then
    return null;
  end if;

  v_scope := coalesce(s.service_area_scope, 'radius');
  if v_scope not in ('city', 'state', 'country') then
    return null;
  end if;
  v_country := upper(coalesce(nullif(btrim(s.service_area_country), ''), 'BR'));
  v_state := case when v_scope in ('city', 'state')
                  then upper(coalesce(nullif(btrim(s.service_area_state), ''), 'MT')) else '' end;
  v_city_key := case when v_scope = 'city'
                     then public.service_area_city_key(coalesce(nullif(btrim(s.service_area_city), ''), 'Sinop')) else '' end;

  select b.geom into v_geom
    from public.service_area_boundaries b
   where b.scope = v_scope
     and b.country_code = v_country
     and b.state_code = v_state
     and b.city_key = v_city_key;
  if v_geom is null then
    return null;
  end if;

  -- scope/country/state/city_key let the app ignore a limit that belongs to a
  -- different area than the (cached) setting it is drawing.
  return jsonb_build_object(
    'scope', v_scope,
    'country', v_country,
    'state', v_state,
    'city_key', v_city_key,
    'west', ST_XMin(v_geom),
    'south', ST_YMin(v_geom),
    'east', ST_XMax(v_geom),
    'north', ST_YMax(v_geom)
  );
end;
$$;

revoke all on function public.service_area_map_bounds() from public, anon;
grant execute on function public.service_area_map_bounds() to authenticated, service_role;
