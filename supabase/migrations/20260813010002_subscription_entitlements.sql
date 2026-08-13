-- Rotta Urbana — subscription entitlement and administrative lifecycle.
-- The database is the final enforcement point: a stale mobile client or a
-- direct RPC call must not let an unpaid driver receive new rides.
set search_path = public, extensions;

create or replace function public.subscription_is_current(p_driver_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.drivers d
    join public.profiles p on p.id = d.id
    join public.subscriptions s on s.driver_id = d.id
    where d.id = coalesce(p_driver_id, auth.uid())
      and p.role = 'driver'
      and coalesce(p.is_active, true)
      and d.is_verified = true
      and s.status = 'active'
      and s.due_date >= current_date
  );
$$;

create or replace function public.is_active_driver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.subscription_is_current(auth.uid());
$$;

comment on function public.subscription_is_current(uuid) is
  'True only when a verified, active driver has an active subscription whose due_date is today or later.';

-- Reconciliation is safe to run repeatedly from the admin panel, a webhook,
-- or a scheduled job. It also removes expired drivers from the online pool.
create or replace function public.expire_overdue_subscriptions()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.subscriptions
     set status = 'expired', updated_at = now()
   where status = 'active'
     and due_date < current_date;
  get diagnostics v_count = row_count;

  update public.drivers d
     set status = 'offline', updated_at = now()
   where d.status = 'online'
     and not public.subscription_is_current(d.id)
     and not exists (
       select 1 from public.rides r
       where r.driver_id = d.id
         and r.status in ('driver_on_way', 'driver_arrived', 'in_progress')
     );

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.subscription_is_current(uuid) to authenticated, service_role;
grant execute on function public.expire_overdue_subscriptions() to authenticated, service_role;
revoke execute on function public.expire_overdue_subscriptions() from anon;

-- A manual admin confirmation and a Mercado Pago approval use the same
-- plan-aware extension rule. The previous function always added 30 days.
create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_provider_payment_id text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.payments;
  v_plan public.plan_type;
  v_days integer;
  v_due date;
  v_was_approved boolean;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select pay.*
    into v_payment
    from public.payments pay
   where pay.id = p_payment_id
   for update;
  if not found then raise exception 'payment not found'; end if;
  v_was_approved := v_payment.status = 'approved';
  select s.plan, s.due_date into v_plan, v_due
    from public.subscriptions s where s.id = v_payment.subscription_id;

  v_days := case v_plan
    when 'daily' then 1
    when 'weekly' then 7
    when 'monthly' then 30
    else 0
  end;

  update public.payments
     set status = 'approved',
         paid_at = coalesce(paid_at, now()),
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         provider_status = 'approved'
   where id = p_payment_id
   returning * into v_payment;

  -- Webhooks and admin refreshes are retried. Never extend the same payment
  -- twice when Mercado Pago sends the same notification again.
  if v_was_approved then return; end if;

  if v_payment.subscription_id is not null and v_days > 0 then
    update public.subscriptions
       set status = 'active',
           due_date = greatest(current_date, coalesce(v_due, current_date)) + v_days,
           paid_at = coalesce(v_payment.paid_at, now()),
           updated_at = now()
     where id = v_payment.subscription_id;
  end if;

  return;
end;
$$;

revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text) to service_role;

create or replace function public.set_driver_status(p_status public.driver_status)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare
  v_driver public.drivers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status = 'online' and not public.is_active_driver() then
    raise exception 'subscription inactive or expired';
  end if;
  if p_status in ('online', 'offline') and exists (
    select 1 from public.rides
    where driver_id = auth.uid()
      and status in ('driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    raise exception 'driver has an active ride';
  end if;

  update public.drivers set status = p_status, updated_at = now()
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
  if not public.is_active_driver() or not exists (
    select 1 from public.drivers
    where id = auth.uid() and status = 'online'
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
  update public.drivers set status = 'on_ride', updated_at = now() where id = auth.uid();
  return v_ride;
end;
$$;

create or replace function public.update_driver_location(
  p_lat numeric, p_lng numeric, p_heading numeric default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- An expired driver may keep sending location only long enough to finish
  -- the ride already accepted before the expiry.
  if not public.subscription_is_current(auth.uid()) and not exists (
    select 1 from public.rides
     where driver_id = auth.uid()
       and status in ('driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    raise exception 'subscription inactive or expired';
  end if;
  update public.drivers
     set current_location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
         location_updated_at = now(), heading = p_heading, updated_at = now()
   where id = auth.uid();
  if not found then raise exception 'not a driver'; end if;
end;
$$;

drop function if exists public.nearby_drivers(numeric, numeric, integer, integer, public.ride_type);
create or replace function public.nearby_drivers(
  p_lat numeric, p_lng numeric,
  p_radius_m integer default 5000,
  p_limit integer default 10,
  p_ride_type public.ride_type default null
) returns table (
  driver_id uuid, full_name text, rating numeric,
  vehicle_model text, vehicle_plate text, vehicle_type public.vehicle_type,
  lat double precision, lng double precision, distance_m double precision, heading numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  with origin as (select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g)
  select d.id, p.full_name, p.rating, v.model, v.plate::text, v.type,
         ST_Y(d.current_location::geometry), ST_X(d.current_location::geometry),
         ST_Distance(d.current_location, o.g), d.heading
    from public.drivers d
    join public.profiles p on p.id = d.id
    cross join origin o
    left join lateral (
      select model, plate, type, year, fipe_value, seats, color
        from public.vehicles
       where driver_id = d.id and is_primary
       order by created_at limit 1
    ) v on true
   where d.status = 'online'
     and public.subscription_is_current(d.id)
     and d.current_location is not null
     and ST_DWithin(d.current_location, o.g, p_radius_m)
     and (p_ride_type is null or public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, p_ride_type))
   order by d.current_location <-> o.g
   limit greatest(1, least(p_limit, 50));
$$;

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

-- Current dashboard metrics, including pending and effectively expired
-- subscriptions (active rows whose due_date has passed).
create or replace function public.admin_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'passengers', (select count(*) from public.profiles where role = 'passenger'),
    'drivers_total', (select count(*) from public.drivers),
    'drivers_online', (select count(*) from public.drivers where status = 'online'),
    'drivers_on_ride', (select count(*) from public.drivers where status = 'on_ride'),
    'drivers_verified', (select count(*) from public.drivers where is_verified),
    'drivers_pending', (select count(*) from public.drivers where documents_status = 'pending'),
    'rides_total', (select count(*) from public.rides),
    'rides_today', (select count(*) from public.rides where requested_at >= date_trunc('day', now())),
    'rides_week', (select count(*) from public.rides where requested_at >= now() - interval '7 days'),
    'rides_month', (select count(*) from public.rides where requested_at >= now() - interval '30 days'),
    'rides_in_progress', (select count(*) from public.rides where status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')),
    'rides_completed', (select count(*) from public.rides where status = 'completed'),
    'rides_cancelled', (select count(*) from public.rides where status = 'cancelled'),
    'gross_fares_month', (select coalesce(sum(price), 0) from public.rides where status = 'completed' and completed_at >= now() - interval '30 days'),
    'subs_active', (select count(*) from public.subscriptions where status = 'active' and due_date >= current_date),
    'subs_pending', (select count(*) from public.subscriptions where status = 'pending'),
    'subs_suspended', (select count(*) from public.subscriptions where status = 'suspended'),
    'subs_expired', (select count(*) from public.subscriptions where status in ('expired','suspended') or due_date < current_date),
    'payments_pending', (select count(*) from public.payments where status = 'pending'),
    'payments_approved', (select count(*) from public.payments where status = 'approved'),
    'payments_rejected', (select count(*) from public.payments where status in ('rejected','cancelled','refunded')),
    'revenue_subscriptions', (select coalesce(sum(amount), 0) from public.payments where status = 'approved'),
    'support_open', (select count(*) from public.support_tickets where status = 'open'),
    'rides_by_type', (select coalesce(jsonb_object_agg(ride_type, c), '{}'::jsonb) from (select ride_type::text, count(*) c from public.rides where status = 'completed' and completed_at >= now() - interval '30 days' group by ride_type) t),
    'gross_fares_by_type', (select coalesce(jsonb_object_agg(ride_type, s), '{}'::jsonb) from (select ride_type::text, coalesce(sum(price),0) s from public.rides where status = 'completed' and completed_at >= now() - interval '30 days' group by ride_type) t)
  ) into result;
  return result;
end;
$$;

grant execute on function public.admin_kpis() to service_role;
revoke execute on function public.admin_kpis() from anon;

comment on function public.admin_kpis is
  'Aggregated operational and subscription lifecycle KPIs for the admin dashboard.';
