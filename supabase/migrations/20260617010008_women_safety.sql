-- ============================================================================
-- Rotta Urbana — 0031: women's safety — gender + female-driver preference
-- ----------------------------------------------------------------------------
-- Goal: when a FEMALE passenger requests a ride, prefer FEMALE drivers. The ride
-- is created "female-only": RLS hides it from male drivers and accept_ride
-- rejects them. If no woman accepts, the passenger can relax the preference
-- (relax_female_preference) to open it to any driver.
--
-- Model fit: this app is pull-based — the passenger creates a 'searching' ride
-- and verified drivers see it (RLS) and accept it (accept_ride). So we enforce
-- the preference at (1) visibility (rides_select policy) and (2) accept time.
-- ============================================================================
set search_path = public, extensions;

-- ─── gender enum + columns ─────────────────────────────────────────────────
do $$ begin
  create type public.gender as enum ('female', 'male', 'other');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists gender public.gender;

alter table public.rides
  add column if not exists requires_female_driver boolean not null default false;

-- searching female-only rides are filtered by driver gender a lot → index it
create index if not exists rides_female_only_idx
  on public.rides (status) where requires_female_driver;

-- ─── helper: is the current user female? (definer: reads own profile row) ────
create or replace function public.is_female()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select gender = 'female' from public.profiles where id = auth.uid()), false); $$;

grant  execute on function public.is_female() to authenticated, service_role;
revoke execute on function public.is_female() from anon;

-- ─── signup trigger: persist gender from metadata ──────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role   public.user_role;
  v_name   text;
  v_phone  text;
  v_gender public.gender;
  v_plan   public.plan_type;
  v_daily  numeric(10,2);
  v_month  numeric(10,2);
  v_fee    numeric(10,2);
begin
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'passenger');
  exception when others then v_role := 'passenger'; end;
  if v_role = 'admin' then v_role := 'passenger'; end if;

  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );
  if length(v_name) < 2 then v_name := 'Usuario'; end if;

  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and v_phone !~ '^[0-9+()\-\s]{8,20}$' then v_phone := null; end if;

  begin
    v_gender := nullif(btrim(new.raw_user_meta_data->>'gender'), '')::public.gender;
  exception when others then v_gender := null; end;

  insert into public.profiles (id, full_name, email, phone, role, gender)
  values (new.id, v_name, new.email, v_phone, v_role, v_gender);

  if v_role = 'driver' then
    select default_plan, subscription_daily_amount, subscription_monthly_amount
      into v_plan, v_daily, v_month
    from public.app_settings where id = 1;

    v_plan := coalesce(v_plan, 'monthly');
    v_fee  := case when v_plan = 'daily' then coalesce(v_daily, 3.00) else coalesce(v_month, 49.90) end;

    insert into public.drivers (id) values (new.id);
    insert into public.subscriptions (driver_id, status, amount, due_date, plan)
    values (new.id, 'expired', v_fee, current_date, v_plan);
  end if;

  return new;
end;
$$;

-- ─── request_ride: add female-driver preference (gated to female passengers) ─
drop function if exists public.request_ride(numeric, numeric, text, numeric, numeric, text, public.ride_type, public.payment_method);
create or replace function public.request_ride(
  p_origin_lat numeric, p_origin_lng numeric, p_origin_address text,
  p_dest_lat numeric,   p_dest_lng numeric,   p_dest_address text,
  p_ride_type public.ride_type default 'economy',
  p_payment_method public.payment_method default 'pix',
  p_requires_female_driver boolean default false
) returns public.rides
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_origin   geography := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  v_dest     geography := ST_SetSRID(ST_MakePoint(p_dest_lng,   p_dest_lat),   4326)::geography;
  v_dist_km  numeric;
  v_dur_min  integer;
  v_price    numeric;
  v_female   boolean;
  v_ride     public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (
    select 1 from public.rides
    where passenger_id = auth.uid()
      and status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
  ) then
    raise exception 'you already have an active ride';
  end if;

  -- Only a female passenger can mark a ride female-only.
  v_female := coalesce(p_requires_female_driver, false) and public.is_female();

  v_dist_km := round((ST_Distance(v_origin, v_dest) / 1000.0)::numeric, 2);
  v_dur_min := greatest(1, ceil((v_dist_km / 30.0) * 60)::int);
  v_price   := public.fare_estimate(p_ride_type, v_dist_km, v_dur_min);

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

grant  execute on function public.request_ride(numeric, numeric, text, numeric, numeric, text, public.ride_type, public.payment_method, boolean) to authenticated, service_role;
revoke execute on function public.request_ride(numeric, numeric, text, numeric, numeric, text, public.ride_type, public.payment_method, boolean) from anon;

-- ─── relax preference: passenger opens their searching ride to any driver ────
create or replace function public.relax_female_preference(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.rides
     set requires_female_driver = false
   where id = p_ride_id
     and passenger_id = auth.uid()
     and status = 'searching'
   returning * into v_ride;
  if not found then raise exception 'ride not found or not yours'; end if;
  return v_ride;
end;
$$;

grant  execute on function public.relax_female_preference(uuid) to authenticated, service_role;
revoke execute on function public.relax_female_preference(uuid) from anon;

-- ─── accept_ride: enforce category AND female-only at accept time ────────────
create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides; v_type public.ride_type;
begin
  if not public.is_active_driver() then raise exception 'driver not verified'; end if;

  select ride_type into v_type from public.rides where id = p_ride_id;

  if not exists (
    select 1 from public.vehicles v
    where v.driver_id = auth.uid() and v.is_primary
      and public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, v_type)
  ) then
    raise exception 'seu veiculo nao atende a categoria desta corrida';
  end if;

  -- Atomic claim: the female-only gate is part of the UPDATE so a concurrent
  -- relax_female_preference can never cause a stale (snapshot-based) rejection.
  update public.rides
     set driver_id = auth.uid(), status = 'driver_on_way', accepted_at = now()
   where id = p_ride_id and status = 'searching' and driver_id is null
     and (not requires_female_driver or public.is_female())
   returning * into v_ride;

  if not found then
    -- Distinguish a female-only block from a generic "gone" for a clear message.
    if not public.is_female() and exists (
      select 1 from public.rides
      where id = p_ride_id and status = 'searching' and driver_id is null and requires_female_driver
    ) then
      raise exception 'esta corrida e exclusiva para motoristas mulheres';
    end if;
    raise exception 'ride no longer available';
  end if;

  update public.drivers set status = 'on_ride' where id = auth.uid();
  return v_ride;
end;
$$;

-- ─── RLS: female-only searching rides are visible only to female drivers ─────
drop policy if exists rides_select on public.rides;
create policy rides_select on public.rides for select to authenticated
using (
  passenger_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
  -- verified drivers see open requests; female-only ones only for female drivers:
  or (status = 'searching' and public.is_active_driver()
      and (not requires_female_driver or public.is_female()))
);

-- ─── lock anon out of the new functions ─────────────────────────────────────
-- Postgres auto-grants EXECUTE to PUBLIC on new functions (anon inherits it via
-- PUBLIC), so a role-specific `revoke from anon` above is not enough — strip
-- PUBLIC too, matching the 0012/0013 hardening invariant.
revoke execute on function public.is_female() from public;
revoke execute on function public.relax_female_preference(uuid) from public;
revoke execute on function public.request_ride(
  numeric, numeric, text, numeric, numeric, text, public.ride_type, public.payment_method, boolean
) from public;

comment on column public.rides.requires_female_driver is
  'True when a female passenger requested a female driver; gates visibility + accept.';
comment on column public.profiles.gender is 'Self-reported gender; powers the female-driver preference.';
