-- ============================================================================
-- Rotta Urbana — 0019: ride counterpart contact (for call / WhatsApp)
-- ----------------------------------------------------------------------------
-- Returns the OTHER party of a ride relative to the caller (driver sees the
-- passenger, passenger sees the driver) with name/phone/vehicle. Restricted to
-- the ride's participants. Powers the in-ride call + chat buttons.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.ride_counterpart(p_ride_id uuid)
returns table (
  name text, phone text, rating numeric,
  vehicle_model text, vehicle_plate text
)
language sql stable security definer set search_path = public
as $$
  with r as (
    select * from public.rides
    where id = p_ride_id and (passenger_id = auth.uid() or driver_id = auth.uid())
  )
  select p.full_name, p.phone, p.rating, v.model, v.plate::text
  from r
  join public.profiles p
    on p.id = case when r.passenger_id = auth.uid() then r.driver_id else r.passenger_id end
  left join lateral (
    select model, plate from public.vehicles
    where driver_id = p.id and is_primary order by created_at limit 1
  ) v on true;
$$;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_kpis()                 from public, anon, authenticated;
grant  execute on function public.confirm_payment(uuid, text) to service_role;
grant  execute on function public.admin_kpis()                 to service_role;
