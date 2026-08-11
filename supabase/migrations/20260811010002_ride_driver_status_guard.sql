-- Regras finais de disponibilidade do motorista no servidor.
set search_path = public, extensions;

create or replace function public.set_driver_status(p_status public.driver_status)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare
  v_driver public.drivers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status = 'online' and not public.is_active_driver() then
    raise exception 'driver not verified';
  end if;
  if p_status in ('online', 'offline') and exists (
    select 1 from public.rides
    where driver_id = auth.uid()
      and status in ('driver_on_way','driver_arrived','in_progress')
  ) then
    raise exception 'driver has an active ride';
  end if;

  update public.drivers set status = p_status
   where id = auth.uid()
   returning * into v_driver;
  if not found then raise exception 'not a driver'; end if;
  return v_driver;
end;
$$;

create or replace function public.get_searching_rides(p_limit integer default 20)
returns setof public.rides
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.expire_stale_rides(5);
  if not exists (
    select 1 from public.drivers
    where id = auth.uid() and status = 'online' and is_verified
  ) then
    return;
  end if;

  return query
    select r.*
    from public.rides r
    where r.status = 'searching'
      and r.requested_at >= now() - interval '5 minutes'
      and (not r.requires_female_driver or public.is_female())
      and not exists (
        select 1 from public.ride_declines rd
        where rd.ride_id = r.id and rd.driver_id = auth.uid()
      )
    order by r.requested_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare
  v_ride public.rides;
  v_type public.ride_type;
begin
  if not exists (
    select 1 from public.drivers
    where id = auth.uid() and status = 'online' and is_verified
  ) then
    raise exception 'driver is not online or not verified';
  end if;
  perform public.expire_stale_rides(5);

  if exists (
    select 1 from public.rides
    where driver_id = auth.uid()
      and status in ('driver_on_way','driver_arrived','in_progress')
  ) then
    raise exception 'driver already has an active ride';
  end if;

  select ride_type into v_type
  from public.rides
  where id = p_ride_id and status = 'searching';

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
  update public.drivers set status = 'on_ride' where id = auth.uid();
  return v_ride;
end;
$$;

