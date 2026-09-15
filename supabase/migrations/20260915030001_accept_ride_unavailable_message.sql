-- A driver who taps a ride another driver already took (or that expired or
-- was cancelled) got "seu veiculo nao atende a categoria desta corrida": the
-- vehicle check ran with no ride type to compare. Check availability first.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_type public.ride_type;
begin
  if not public.is_active_driver() then
    raise exception 'subscription inactive or expired';
  end if;
  if not exists (
    select 1 from public.drivers
     where id = auth.uid() and status = 'online'
  ) then
    raise exception 'driver is not online';
  end if;
  perform public.expire_stale_rides(5);

  if exists (
    select 1 from public.rides
     where driver_id = auth.uid()
       and status in ('driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    raise exception 'driver already has an active ride';
  end if;

  select ride_type into v_type
    from public.rides
   where id = p_ride_id and status = 'searching' and driver_id is null;
  if not found then
    raise exception 'ride no longer available';
  end if;

  if not exists (
    select 1 from public.vehicles v
     where v.driver_id = auth.uid() and v.is_primary
       and public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, v_type)
  ) then
    raise exception 'seu veiculo nao atende a categoria desta corrida';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'driver_on_way', accepted_at = now()
   where id = p_ride_id
     and status = 'searching'
     and driver_id is null
     and requested_at >= now() - interval '5 minutes'
     and (not requires_female_driver or public.is_female())
     and not exists (
       select 1 from public.ride_declines rd
        where rd.ride_id = public.rides.id and rd.driver_id = auth.uid()
     )
   returning * into v_ride;
  if not found then raise exception 'ride no longer available'; end if;
  update public.drivers set status = 'on_ride', updated_at = now() where id = auth.uid();
  return v_ride;
end;
$$;
