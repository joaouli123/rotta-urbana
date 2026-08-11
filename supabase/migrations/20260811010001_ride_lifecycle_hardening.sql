-- Rotta Urbana — hardening do ciclo de vida das corridas
--
-- Evita solicitações eternas, persiste a recusa do motorista, impede que um
-- motorista aceite duas corridas e torna as transições/cancelamentos seguros
-- para toques duplicados, reconexões e app reaberto.
set search_path = public, extensions;

-- Motoristas que recusaram uma solicitação não devem recebê-la novamente.
create table if not exists public.ride_declines (
  ride_id    uuid not null references public.rides(id) on delete cascade,
  driver_id  uuid not null references public.drivers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ride_id, driver_id)
);

create index if not exists ride_declines_driver_idx
  on public.ride_declines (driver_id, created_at desc);

alter table public.ride_declines enable row level security;

drop policy if exists ride_declines_select_own on public.ride_declines;
create policy ride_declines_select_own on public.ride_declines
  for select to authenticated
  using (driver_id = auth.uid());

revoke insert, update, delete on public.ride_declines from authenticated;

-- Corridas em busca não podem ficar presas indefinidamente. O limite é
-- controlado no servidor e nunca pode ser reduzido por um cliente.
create or replace function public.expire_stale_rides(p_max_age_minutes integer default 5)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_age integer := greatest(5, least(coalesce(p_max_age_minutes, 5), 30));
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.rides
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'Tempo limite para encontrar motorista excedido',
         cancelled_by = null
   where status = 'searching'
     and requested_at < now() - make_interval(mins => v_age);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.decline_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_active_driver() then raise exception 'driver not verified'; end if;

  insert into public.ride_declines (ride_id, driver_id)
  select p_ride_id, auth.uid()
  where exists (
    select 1 from public.rides
    where id = p_ride_id and status = 'searching'
  )
  on conflict (ride_id, driver_id) do nothing;
end;
$$;

create or replace function public.has_declined_ride(p_ride_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.ride_declines
    where ride_id = p_ride_id and driver_id = auth.uid()
  );
$$;

-- Feed filtrado no banco: não devolve recusas persistidas nem solicitações
-- vencidas. Isso evita que polling e realtime reabram o mesmo cartão.
create or replace function public.get_searching_rides(p_limit integer default 20)
returns setof public.rides
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.expire_stale_rides(5);
  if not public.is_active_driver() then return; end if;

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

grant execute on function public.expire_stale_rides(integer) to authenticated, service_role;
grant execute on function public.decline_ride(uuid) to authenticated, service_role;
grant execute on function public.has_declined_ride(uuid) to authenticated, service_role;
grant execute on function public.get_searching_rides(integer) to authenticated, service_role;
revoke execute on function public.expire_stale_rides(integer) from public, anon;
revoke execute on function public.decline_ride(uuid) from public, anon;
revoke execute on function public.has_declined_ride(uuid) from public, anon;
revoke execute on function public.get_searching_rides(integer) from public, anon;

-- Não permite que um motorista ocupado volte a ficar disponível ou aceite uma
-- segunda corrida durante a primeira.
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
  if p_status = 'online' and exists (
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

-- Aceite atômico, com checagem de ocupação e validade da solicitação.
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare
  v_ride public.rides;
  v_type public.ride_type;
begin
  if not public.is_active_driver() then raise exception 'driver not verified'; end if;
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

-- Transições estritamente progressivas: driver_on_way → driver_arrived →
-- in_progress → completed. Repetições e saltos passam a falhar claramente.
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
  if p_status not in ('driver_arrived','in_progress','completed') then
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
       set status = 'online', total_rides = total_rides + 1
     where id = auth.uid();
  end if;
  return v_ride;
end;
$$;

-- Cancelamento idempotente e permitido pelo passageiro em qualquer etapa
-- ainda não concluída. Isso evita que um toque duplicado deixe a tela presa.
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

  if v_ride.driver_id is not null then
    update public.drivers set status = 'online' where id = v_ride.driver_id;
  end if;
  return v_ride;
end;
$$;

-- request_ride remove solicitações vencidas antes de bloquear o passageiro.
create or replace function public.request_ride(
  p_origin_lat numeric, p_origin_lng numeric, p_origin_address text,
  p_dest_lat numeric, p_dest_lng numeric, p_dest_address text,
  p_ride_type public.ride_type default 'economy',
  p_payment_method public.payment_method default 'pix',
  p_requires_female_driver boolean default false
)
returns public.rides
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_origin geography := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  v_dest geography := ST_SetSRID(ST_MakePoint(p_dest_lng, p_dest_lat), 4326)::geography;
  v_dist_km numeric;
  v_dur_min integer;
  v_price numeric;
  v_female boolean;
  v_ride public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.expire_stale_rides(5);
  if exists (
    select 1 from public.rides
    where passenger_id = auth.uid()
      and status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
  ) then
    raise exception 'you already have an active ride';
  end if;

  v_female := coalesce(p_requires_female_driver, false) and public.is_female();
  v_dist_km := round((ST_Distance(v_origin, v_dest) / 1000.0)::numeric, 2);
  v_dur_min := greatest(1, ceil((v_dist_km / 30.0) * 60)::int);
  v_price := public.fare_estimate(p_ride_type, v_dist_km, v_dur_min);

  insert into public.rides (
    passenger_id, status, ride_type, origin, origin_address,
    destination, destination_address, price, distance_km, duration_min,
    payment_method, requires_female_driver
  ) values (
    auth.uid(), 'searching', p_ride_type, v_origin, p_origin_address,
    v_dest, p_dest_address, v_price, v_dist_km, v_dur_min,
    p_payment_method, v_female
  ) returning * into v_ride;
  return v_ride;
end;
$$;

grant execute on function public.set_driver_status(public.driver_status) to authenticated, service_role;
grant execute on function public.accept_ride(uuid) to authenticated, service_role;
grant execute on function public.update_ride_status(uuid, public.ride_status) to authenticated, service_role;
grant execute on function public.cancel_ride(uuid, text) to authenticated, service_role;
grant execute on function public.request_ride(numeric, numeric, text, numeric, numeric, text, public.ride_type, public.payment_method, boolean) to authenticated, service_role;

