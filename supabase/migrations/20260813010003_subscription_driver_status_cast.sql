-- Fix enum inference in the completion path introduced by the entitlement
-- guard. PostgreSQL must be told that the CASE result is driver_status.
create or replace function public.update_ride_status(
  p_ride_id uuid,
  p_status public.ride_status
)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status not in ('driver_arrived', 'in_progress', 'completed') then
    raise exception 'invalid status transition';
  end if;

  update public.rides
     set status = p_status,
         arrived_at = case when p_status = 'driver_arrived' then now() else arrived_at end,
         started_at = case when p_status = 'in_progress' then now() else started_at end,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_ride_id
     and driver_id = auth.uid()
     and (
       (p_status = 'driver_arrived' and status = 'driver_on_way')
       or (p_status = 'in_progress' and status = 'driver_arrived')
       or (p_status = 'completed' and status = 'in_progress')
     )
   returning * into v_ride;
  if not found then raise exception 'ride not found or invalid status transition'; end if;

  if p_status = 'completed' then
    update public.drivers
       set status = (case when public.subscription_is_current(auth.uid()) then 'online' else 'offline' end)::public.driver_status,
           total_rides = total_rides + 1,
           updated_at = now()
     where id = auth.uid();
  end if;
  return v_ride;
end;
$$;
