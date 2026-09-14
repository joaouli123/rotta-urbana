-- Rotta Urbana — admin-configurable operational area.
-- The area is a circle so the same rule can be used by the app and by the
-- database. Sinop/MT remains the safe default until the admin changes it.
set search_path = public, extensions;

create extension if not exists unaccent with schema extensions;

alter table public.app_settings
  add column if not exists service_area_enabled boolean not null default true,
  add column if not exists service_area_scope text not null default 'radius'
    check (service_area_scope in ('radius', 'city', 'state', 'country')),
  add column if not exists service_area_city text not null default 'Sinop',
  add column if not exists service_area_state text not null default 'MT',
  add column if not exists service_area_country text not null default 'BR',
  add column if not exists service_area_center_lng numeric(10,7) not null default -55.5024,
  add column if not exists service_area_center_lat numeric(10,7) not null default -11.8642,
  add column if not exists service_area_radius_km numeric(8,2) not null default 20
    check (service_area_radius_km >= 1 and service_area_radius_km <= 200);

update public.app_settings
   set service_area_scope = case when service_area_scope in ('radius', 'city', 'state', 'country') then service_area_scope else 'radius' end,
       service_area_city = coalesce(nullif(btrim(service_area_city), ''), 'Sinop'),
       service_area_state = upper(coalesce(nullif(btrim(service_area_state), ''), 'MT')),
       service_area_country = upper(coalesce(nullif(btrim(service_area_country), ''), 'BR')),
       service_area_center_lng = coalesce(service_area_center_lng, -55.5024),
       service_area_center_lat = coalesce(service_area_center_lat, -11.8642),
       service_area_radius_km = coalesce(service_area_radius_km, 20)
 where id = 1;

comment on column public.app_settings.service_area_enabled is
  'When true, maps, address search and new rides are limited to the configured scope.';
comment on column public.app_settings.service_area_scope is
  'Operational scope: radius, city, state or country.';
comment on column public.app_settings.service_area_city is
  'Display name of the current operational city.';
comment on column public.app_settings.service_area_country is
  'ISO-3166 alpha-2 country code used by geocoding filters.';
comment on column public.app_settings.service_area_radius_km is
  'Operational radius around the configured center, in kilometers.';

create or replace function public.service_area_allows_point(p_lng numeric, p_lat numeric)
returns boolean
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  s public.app_settings%rowtype;
  point geography;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not coalesce(s.service_area_enabled, true) then
    return true;
  end if;

  if p_lng is null or p_lat is null
     or p_lng < -180 or p_lng > 180
     or p_lat < -90 or p_lat > 90
     or s.service_area_center_lng < -180 or s.service_area_center_lng > 180
     or s.service_area_center_lat < -90 or s.service_area_center_lat > 90
     or coalesce(s.service_area_radius_km, 0) <= 0 then
    return false;
  end if;

  point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  return ST_DWithin(
    point,
    ST_SetSRID(ST_MakePoint(s.service_area_center_lng, s.service_area_center_lat), 4326)::geography,
    coalesce(s.service_area_radius_km, 20) * 1000
  );
end;
$$;

create or replace function public.service_area_allows_address(p_address text)
returns boolean
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  s public.app_settings%rowtype;
  v_text text;
  v_state_name text;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not coalesce(s.service_area_enabled, true) or coalesce(s.service_area_scope, 'radius') = 'radius' then
    return true;
  end if;

  v_text := lower(extensions.unaccent(coalesce(p_address, '')));
  if length(btrim(v_text)) = 0 then return false; end if;

  if coalesce(s.service_area_scope, 'radius') = 'country' then
    if upper(coalesce(s.service_area_country, 'BR')) = 'BR' then
      return v_text like '%brasil%' or v_text ~ '(^|[^a-z])br([^a-z]|$)';
    end if;
    return v_text like '%' || lower(coalesce(s.service_area_country, '')) || '%';
  end if;

  v_state_name := case upper(coalesce(s.service_area_state, 'MT'))
    when 'AC' then 'acre' when 'AL' then 'alagoas' when 'AP' then 'amapa'
    when 'AM' then 'amazonas' when 'BA' then 'bahia' when 'CE' then 'ceara'
    when 'DF' then 'distrito federal' when 'ES' then 'espirito santo' when 'GO' then 'goias'
    when 'MA' then 'maranhao' when 'MT' then 'mato grosso' when 'MS' then 'mato grosso do sul'
    when 'MG' then 'minas gerais' when 'PA' then 'para' when 'PB' then 'paraiba'
    when 'PR' then 'parana' when 'PE' then 'pernambuco' when 'PI' then 'piaui'
    when 'RJ' then 'rio de janeiro' when 'RN' then 'rio grande do norte'
    when 'RS' then 'rio grande do sul' when 'RO' then 'rondonia' when 'RR' then 'roraima'
    when 'SC' then 'santa catarina' when 'SP' then 'sao paulo' when 'SE' then 'sergipe'
    when 'TO' then 'tocantins' else lower(coalesce(s.service_area_state, 'MT')) end;

  if not (v_text like '%' || v_state_name || '%' or v_text ~ ('(^|[^a-z])' || lower(coalesce(s.service_area_state, 'MT')) || '([^a-z]|$)')) then
    return false;
  end if;
  if coalesce(s.service_area_scope, 'radius') = 'state' then return true; end if;
  return v_text like '%' || lower(coalesce(s.service_area_city, 'Sinop')) || '%';
end;
$$;

create or replace function public.enforce_ride_service_area()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_city text;
  v_state text;
begin
  if (select coalesce(service_area_scope, 'radius') from public.app_settings where id = 1) = 'radius'
     and (not public.service_area_allows_point(ST_X(new.origin::geometry), ST_Y(new.origin::geometry))
       or not public.service_area_allows_point(ST_X(new.destination::geometry), ST_Y(new.destination::geometry)))
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

drop trigger if exists trg_rides_service_area on public.rides;
create trigger trg_rides_service_area
  before insert or update of origin, destination on public.rides
  for each row execute function public.enforce_ride_service_area();

grant execute on function public.service_area_allows_point(numeric, numeric)
  to authenticated, service_role;
revoke execute on function public.service_area_allows_point(numeric, numeric) from anon;
grant execute on function public.service_area_allows_address(text)
  to authenticated, service_role;
revoke execute on function public.service_area_allows_address(text) from anon;

comment on function public.service_area_allows_point is
  'Returns whether a coordinate is inside the admin-configured operational area.';
comment on function public.service_area_allows_address is
  'Returns whether a geocoded address matches the admin-configured city, state or country scope.';
comment on trigger trg_rides_service_area on public.rides is
  'Prevents new or relocated rides outside the configured operational area.';
