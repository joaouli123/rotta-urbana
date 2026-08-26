-- Rotta Urbana — passenger identity, driver plan catalog and night fare.
-- This migration is intentionally additive and keeps the existing plan_type
-- cadence enum compatible with older app builds.
set search_path = public, extensions;

-- ─── passenger identity ───────────────────────────────────────────────────
-- CPF is already collected by the app and stored by the profile trigger. Use a
-- trigger rather than a unique index because legacy data may already contain
-- duplicates; this keeps deployment safe and blocks all new duplicates.
create or replace function public.prevent_duplicate_profile_cpf()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.cpf is not null and length(new.cpf) = 11 and exists (
    select 1 from public.profiles p
     where p.cpf = new.cpf and p.id <> new.id
  ) then
    raise exception 'cpf ja cadastrado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_unique_cpf on public.profiles;
create trigger trg_profiles_unique_cpf
  before insert or update of cpf on public.profiles
  for each row execute function public.prevent_duplicate_profile_cpf();

comment on column public.profiles.doc_selfie_path is
  'Passenger or driver selfie path in private driver-docs storage; passengers do not send RG.';

-- ─── admin-configurable driver plans ──────────────────────────────────────
alter table public.drivers
  add column if not exists plan_segment text;
alter table public.subscriptions
  add column if not exists plan_segment text;

do $$
begin
  alter table public.drivers
    add constraint drivers_plan_segment_check
    check (plan_segment is null or plan_segment in ('moto','economy','comfort','premium'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.subscriptions
    add constraint subscriptions_plan_segment_check
    check (plan_segment is null or plan_segment in ('moto','economy','comfort','premium'));
exception when duplicate_object then null;
end $$;

alter table public.app_settings
  add column if not exists moto_commission_pct numeric(5,2) not null default 15.00
    check (moto_commission_pct >= 0 and moto_commission_pct <= 100),
  add column if not exists moto_daily_price numeric(10,2) not null default 10.00
    check (moto_daily_price >= 0),
  add column if not exists moto_weekly_price numeric(10,2) not null default 40.00
    check (moto_weekly_price >= 0),
  add column if not exists moto_monthly_price numeric(10,2) not null default 150.00
    check (moto_monthly_price >= 0),
  add column if not exists car_economy_monthly_price numeric(10,2) not null default 350.00
    check (car_economy_monthly_price >= 0),
  add column if not exists car_comfort_monthly_price numeric(10,2) not null default 380.00
    check (car_comfort_monthly_price >= 0),
  add column if not exists car_premium_monthly_price numeric(10,2) not null default 450.00
    check (car_premium_monthly_price >= 0),
  add column if not exists night_fare_enabled boolean not null default true,
  add column if not exists night_start time not null default '19:00',
  add column if not exists night_end time not null default '06:00',
  add column if not exists night_multiplier numeric(5,2) not null default 1.15
    check (night_multiplier >= 1 and night_multiplier <= 5);

-- ─── authoritative fare calculation ──────────────────────────────────────
-- The database applies the same multiplier to estimates and request_ride,
-- using São Paulo local time so the client cannot bypass night pricing.
create or replace function public.fare_estimate(
  p_ride_type public.ride_type,
  p_distance_km numeric,
  p_duration_min integer
) returns numeric
language sql stable security definer set search_path = public, extensions
as $$
  select greatest(
    f.min_fare,
    round((f.base_fare
      + (f.per_km * coalesce(p_distance_km, 0))
      + (f.per_min * coalesce(p_duration_min, 0)))
      * case
          when coalesce(s.night_fare_enabled, true)
           and (
             (coalesce(s.night_start, '19:00'::time) > coalesce(s.night_end, '06:00'::time)
              and ((now() at time zone 'America/Sao_Paulo')::time >= coalesce(s.night_start, '19:00'::time)
                or (now() at time zone 'America/Sao_Paulo')::time < coalesce(s.night_end, '06:00'::time)))
             or
             (coalesce(s.night_start, '19:00'::time) <= coalesce(s.night_end, '06:00'::time)
              and (now() at time zone 'America/Sao_Paulo')::time >= coalesce(s.night_start, '19:00'::time)
              and (now() at time zone 'America/Sao_Paulo')::time < coalesce(s.night_end, '06:00'::time))
           )
          then coalesce(s.night_multiplier, 1.15)
          else 1
        end, 2)
  )
  from public.fare_config f
  left join public.app_settings s on s.id = 1
  where f.ride_type = p_ride_type and f.active;
$$;

-- ─── plan selection ───────────────────────────────────────────────────────
create or replace function public.driver_select_plan(p_plan text, p_segment text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan public.plan_type;
  v_segment text;
  v_amount numeric;
  v_days int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_plan := p_plan::public.plan_type;
  v_segment := lower(nullif(btrim(p_segment), ''));
  if v_segment is null or v_segment not in ('moto','economy','comfort','premium') then
    raise exception 'categoria de plano invalida';
  end if;

  select case
    when v_segment = 'moto' and v_plan = 'daily' then moto_daily_price
    when v_segment = 'moto' and v_plan = 'weekly' then moto_weekly_price
    when v_segment = 'moto' and v_plan = 'monthly' then moto_monthly_price
    when v_segment = 'economy' and v_plan = 'monthly' then car_economy_monthly_price
    when v_segment = 'comfort' and v_plan = 'monthly' then car_comfort_monthly_price
    when v_segment = 'premium' and v_plan = 'monthly' then car_premium_monthly_price
    when v_plan = 'daily' then subscription_daily_amount
    when v_plan = 'weekly' then plan_weekly_price
    else subscription_monthly_amount
  end,
  case when v_plan = 'daily' then 1 when v_plan = 'weekly' then 7 else 30 end
  into v_amount, v_days
  from public.app_settings where id = 1;

  update public.drivers
     set plan_type = v_plan, plan_segment = v_segment, updated_at = now()
   where id = auth.uid();
  if not found then raise exception 'Motorista nao encontrado'; end if;

  if v_plan = 'commission' then
    update public.subscriptions
       set plan = v_plan, plan_segment = v_segment, status = 'active', amount = 0,
           due_date = current_date + 30, updated_at = now()
     where driver_id = auth.uid();
  else
    v_amount := coalesce(v_amount, 0);
    if v_amount <= 0 then raise exception 'Preco do plano nao configurado'; end if;
    update public.subscriptions
       set plan = v_plan, plan_segment = v_segment, amount = v_amount,
           status = 'expired', due_date = current_date + v_days, updated_at = now()
     where driver_id = auth.uid();
  end if;
end;
$$;

create or replace function public.driver_select_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_segment text;
begin
  select coalesce(plan_segment, case when exists (
    select 1 from public.vehicles where driver_id = auth.uid() and is_primary and type = 'moto'
  ) then 'moto' else 'economy' end)
    into v_segment
    from public.drivers where id = auth.uid();
  perform public.driver_select_plan(p_plan, coalesce(v_segment, 'economy'));
end;
$$;

create or replace function public.record_ride_commission()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan public.plan_type;
  v_segment text;
  v_pct numeric;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.driver_id is null or coalesce(new.price, 0) <= 0 then return new; end if;
  select plan_type, plan_segment into v_plan, v_segment from public.drivers where id = new.driver_id;
  if v_plan is distinct from 'commission' then return new; end if;
  select case when v_segment = 'moto' then moto_commission_pct else commission_pct end
    into v_pct from public.app_settings where id = 1;
  v_pct := coalesce(v_pct, 15.00);
  insert into public.driver_commissions
    (driver_id, ride_id, ride_price, commission_pct, commission_amount)
  values (new.driver_id, new.id, new.price, v_pct, round(new.price * v_pct / 100, 2))
  on conflict (ride_id) do nothing;
  return new;
end;
$$;

grant execute on function public.driver_select_plan(text, text) to authenticated, service_role;
grant execute on function public.driver_select_plan(text) to authenticated, service_role;
revoke execute on function public.driver_select_plan(text, text) from anon;
revoke execute on function public.driver_select_plan(text) from anon;
