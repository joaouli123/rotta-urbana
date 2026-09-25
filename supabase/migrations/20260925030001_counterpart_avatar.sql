-- ============================================================================
-- Rotta Urbana: counterpart photo on the ride screens
-- ----------------------------------------------------------------------------
-- ride_counterpart also returns the other party's avatar_url, so the passenger
-- sees the driver's photo on the driver card. The return type changes, so the
-- function is dropped and created again.
-- ============================================================================
set search_path = public, extensions;

drop function if exists public.ride_counterpart(uuid);

create function public.ride_counterpart(p_ride_id uuid)
returns table (
  name text, phone text, rating numeric,
  vehicle_model text, vehicle_plate text, avatar_url text
)
language sql stable security definer set search_path = public
as $$
  with r as (
    select * from public.rides
    where id = p_ride_id and (passenger_id = auth.uid() or driver_id = auth.uid())
  )
  select p.full_name, p.phone, p.rating, v.model, v.plate::text, p.avatar_url
  from r
  join public.profiles p
    on p.id = case when r.passenger_id = auth.uid() then r.driver_id else r.passenger_id end
  left join lateral (
    select model, plate from public.vehicles
    where driver_id = p.id and is_primary order by created_at limit 1
  ) v on true;
$$;

revoke execute on function public.ride_counterpart(uuid) from public, anon;
grant  execute on function public.ride_counterpart(uuid) to authenticated, service_role;
