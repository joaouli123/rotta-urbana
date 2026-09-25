-- Next ride while finishing one (like Uber's queued trips).
--
-- A driver whose ride is in progress, and who has no next ride yet, sees and
-- can accept a new request whose pickup is within QUEUE_RADIUS_M of where the
-- current ride ends. The new ride is 'driver_on_way' at once with
-- queued_after pointing at the current ride; the driver stays 'on_ride' until
-- both are done, and cannot mark the arrival before finishing the first one.
set search_path = public, extensions;

alter table public.rides
  add column if not exists queued_after uuid references public.rides(id) on delete set null;
comment on column public.rides.queued_after is
  'Ride the driver was finishing when accepting this one (queued trip); null for a normal accept.';
create index if not exists rides_queued_after_idx on public.rides (queued_after) where queued_after is not null;

-- The ride a driver may queue a new one behind: their only active ride, in
-- progress. No row means the driver cannot take a queued ride now.
create or replace function public.driver_queue_anchor(p_driver uuid)
returns setof public.rides
language sql stable security definer set search_path = public
as $$
  select r.*
    from public.rides r
   where r.driver_id = p_driver
     and r.status = 'in_progress'
     and not exists (
       select 1 from public.rides q
        where q.driver_id = p_driver and q.id <> r.id
          and q.status in ('driver_found', 'driver_on_way', 'driver_arrived', 'in_progress')
     )
   limit 1;
$$;
revoke execute on function public.driver_queue_anchor(uuid) from public, anon, authenticated;

-- ─── Feed ──────────────────────────────────────────────────────────────────
create or replace function public.get_searching_rides(p_limit integer default 20)
returns setof public.rides
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_status public.driver_status;
  v_anchor public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.expire_stale_rides(5);
  if not public.is_active_driver() then return; end if;
  select status into v_status from public.drivers where id = auth.uid();
  if v_status = 'on_ride' then
    select * into v_anchor from public.driver_queue_anchor(auth.uid());
    if not found then return; end if;
  elsif v_status is distinct from 'online' then
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
       -- Queued: only pickups close to where the current ride ends.
       and (v_anchor.id is null or ST_DWithin(r.origin, v_anchor.destination, 3000))
     order by r.requested_at asc
     limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

-- ─── Accept ────────────────────────────────────────────────────────────────
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ride public.rides;
  v_type public.ride_type;
  v_status public.driver_status;
  v_anchor public.rides;
begin
  if not public.is_active_driver() then
    raise exception 'subscription inactive or expired';
  end if;
  -- Row lock: two accepts by the same driver run one after the other, so the
  -- active-ride checks below cannot both pass.
  select status into v_status from public.drivers where id = auth.uid() for update;
  if v_status = 'on_ride' then
    select * into v_anchor from public.driver_queue_anchor(auth.uid());
    if not found then raise exception 'driver already has an active ride'; end if;
  elsif v_status is distinct from 'online' then
    raise exception 'driver is not online';
  end if;
  perform public.expire_stale_rides(5);

  if v_anchor.id is null and exists (
    select 1 from public.rides
     where driver_id = auth.uid()
       and status in ('driver_found', 'driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    raise exception 'driver already has an active ride';
  end if;

  select ride_type into v_type
    from public.rides
   where id = p_ride_id and status = 'searching' and driver_id is null
     and (v_anchor.id is null or ST_DWithin(origin, v_anchor.destination, 3000));
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
     set driver_id = auth.uid(), status = 'driver_on_way', accepted_at = now(),
         queued_after = v_anchor.id
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

-- ─── Status changes ────────────────────────────────────────────────────────
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

  -- A queued ride starts only after the ride before it ends.
  if p_status = 'driver_arrived' and exists (
    select 1 from public.rides r join public.rides a on a.id = r.queued_after
     where r.id = p_ride_id and r.driver_id = auth.uid() and a.status = 'in_progress'
  ) then
    raise exception 'finish the current ride first';
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
       set status = (case
             -- A queued ride keeps the driver busy.
             when exists (
               select 1 from public.rides q
                where q.driver_id = auth.uid()
                  and q.status in ('driver_found', 'driver_on_way', 'driver_arrived', 'in_progress')
             ) then 'on_ride'
             when public.subscription_is_current(auth.uid()) then 'online'
             else 'offline' end)::public.driver_status,
           total_rides = total_rides + 1,
           updated_at = now()
     where id = auth.uid();
  end if;
  return v_ride;
end;
$$;

create or replace function public.cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare
  v_ride public.rides;
  v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_role := public.current_user_role();

  select * into v_ride
  from public.rides
  where id = p_ride_id
    and (passenger_id = auth.uid() or driver_id = auth.uid());
  if not found then raise exception 'ride not found or not yours'; end if;
  if v_ride.status = 'cancelled' then return v_ride; end if;
  if v_ride.status = 'completed' then raise exception 'ride not cancellable'; end if;

  update public.rides
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = nullif(btrim(p_reason), ''),
         cancelled_by = v_role
   where id = p_ride_id
     and status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
   returning * into v_ride;

  if not found then raise exception 'ride not cancellable'; end if;

  -- Back online only when the driver has no other ride (the queued one, or
  -- the one before it).
  if v_ride.driver_id is not null and not exists (
    select 1 from public.rides q
     where q.driver_id = v_ride.driver_id
       and q.status in ('driver_found', 'driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    update public.drivers set status = 'online' where id = v_ride.driver_id;
  end if;
  return v_ride;
end;
$$;

-- ─── Passenger view of a queued ride ───────────────────────────────────────
-- While the driver finishes the ride before, where it ends, so the passenger
-- sees the driver's path: current drop-off, then the pickup. The point only,
-- never the other passenger's address or name.
create or replace function public.ride_queue_info(p_ride_id uuid)
returns table (via_lat double precision, via_lng double precision)
language sql stable security definer set search_path = public, extensions
as $$
  select ST_Y(a.destination::geometry), ST_X(a.destination::geometry)
    from public.rides r
    join public.rides a on a.id = r.queued_after
   where r.id = p_ride_id
     and (r.passenger_id = auth.uid() or r.driver_id = auth.uid() or public.is_admin())
     and r.status = 'driver_on_way'
     and a.status = 'in_progress';
$$;
revoke execute on function public.ride_queue_info(uuid) from public, anon;
grant execute on function public.ride_queue_info(uuid) to authenticated, service_role;

-- ─── Push for new rides: also drivers finishing a ride nearby ──────────────
create or replace function public.notify_new_ride()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare v_tokens text[];
begin
  if new.status <> 'searching' then return new; end if;

  select array_agg(distinct p.push_token) into v_tokens
  from public.drivers d
  join public.profiles p on p.id = d.id
  join lateral (
    select year, fipe_value, type, seats, color
    from public.vehicles where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  where (
      d.status = 'online'
      or (d.status = 'on_ride' and exists (
        select 1 from public.driver_queue_anchor(d.id) a
         where ST_DWithin(a.destination, new.origin, 3000)
      ))
    )
    and d.is_verified
    and p.push_token is not null
    and public.subscription_is_current(d.id)
    and public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, new.ride_type)
    and (not new.requires_female_driver or p.gender = 'female');

  if v_tokens is null or array_length(v_tokens, 1) is null then return new; end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', to_jsonb(v_tokens),
      'title', 'Nova corrida!',
      'body', 'Um passageiro esta te chamando. Toque para ver os detalhes.',
      'sound', 'default',
      'priority', 'high',
      'channelId', 'rides-v2',
      'data', jsonb_build_object('rideId', new.id, 'type', 'new_ride')
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
