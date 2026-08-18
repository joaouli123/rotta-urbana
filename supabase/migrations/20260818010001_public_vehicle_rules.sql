-- Public, read-only vehicle eligibility used before driver signup.
-- The registration flow runs before authentication, so it cannot read
-- fare_config directly through the authenticated-only RLS policy.
create or replace function public.get_registration_vehicle_rules()
returns table (
  ride_type text,
  min_year integer,
  min_fipe_value numeric,
  allowed_vehicle_types text[],
  min_seats integer,
  require_colors text[],
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.ride_type::text,
    f.min_year,
    f.min_fipe_value,
    f.allowed_vehicle_types,
    f.min_seats,
    f.require_colors,
    f.active
  from public.fare_config f
  where f.ride_type in ('moto', 'economy', 'comfort', 'premium')
  order by f.ride_type;
$$;

revoke execute on function public.get_registration_vehicle_rules() from public;
grant execute on function public.get_registration_vehicle_rules() to anon, authenticated, service_role;
