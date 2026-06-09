-- ============================================================================
-- Rotta Urbana — 0014: driver PIX, daily/monthly plans, editable settings, KPIs
-- ----------------------------------------------------------------------------
--  * Drivers receive passenger fares directly via their own PIX key.
--  * Driver subscription can be billed daily OR monthly; amounts are editable
--    by the admin (app_settings), not hardcoded.
--  * admin_kpis() powers the admin dashboard.
-- ============================================================================
set search_path = public, extensions;

-- ─── plan type ──────────────────────────────────────────────────────────────
do $$ begin
  create type public.plan_type as enum ('daily', 'monthly');
exception when duplicate_object then null; end $$;

-- ─── driver receives fares via PIX ─────────────────────────────────────────
alter table public.drivers
  add column if not exists pix_key      text,
  add column if not exists pix_key_type text check (pix_key_type in ('cpf','cnpj','email','phone','random'));

-- ─── subscription plan ──────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists plan public.plan_type not null default 'monthly';

-- ─── ride fare paid flag (off-platform PIX confirmation) ───────────────────
alter table public.rides
  add column if not exists fare_paid boolean not null default false;

-- ─── editable platform settings (single row) ───────────────────────────────
create table if not exists public.app_settings (
  id                          integer primary key default 1 check (id = 1),
  platform_name               text not null default 'Rotta Urbana',
  subscription_daily_amount   numeric(10,2) not null default 3.00  check (subscription_daily_amount >= 0),
  subscription_monthly_amount numeric(10,2) not null default 49.90 check (subscription_monthly_amount >= 0),
  default_plan                public.plan_type not null default 'monthly',
  platform_pix_key            text not null default '',
  platform_pix_name           text not null default 'ROTTA URBANA',
  platform_pix_city           text not null default 'SINOP',
  updated_at                  timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists settings_select on public.app_settings;
drop policy if exists settings_admin  on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated using (true);
create policy settings_admin  on public.app_settings for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── signup: use the configured default plan + amount ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role  public.user_role;
  v_name  text;
  v_phone text;
  v_plan  public.plan_type;
  v_daily numeric(10,2);
  v_month numeric(10,2);
  v_fee   numeric(10,2);
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

  insert into public.profiles (id, full_name, email, phone, role)
  values (new.id, v_name, new.email, v_phone, v_role);

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

-- ─── admin KPIs (one JSON payload) ─────────────────────────────────────────
-- Callable by service_role (admin web, auth.uid() null) or an admin user.
create or replace function public.admin_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'passengers',          (select count(*) from public.profiles where role = 'passenger'),
    'drivers_total',       (select count(*) from public.drivers),
    'drivers_online',      (select count(*) from public.drivers where status = 'online'),
    'drivers_on_ride',     (select count(*) from public.drivers where status = 'on_ride'),
    'drivers_verified',    (select count(*) from public.drivers where is_verified),
    'drivers_pending',     (select count(*) from public.drivers where documents_status = 'pending'),
    'rides_total',         (select count(*) from public.rides),
    'rides_today',         (select count(*) from public.rides where requested_at >= date_trunc('day', now())),
    'rides_week',          (select count(*) from public.rides where requested_at >= now() - interval '7 days'),
    'rides_month',         (select count(*) from public.rides where requested_at >= now() - interval '30 days'),
    'rides_in_progress',   (select count(*) from public.rides where status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')),
    'rides_completed',     (select count(*) from public.rides where status = 'completed'),
    'rides_cancelled',     (select count(*) from public.rides where status = 'cancelled'),
    'gross_fares_month',   (select coalesce(sum(price),0) from public.rides where status = 'completed' and completed_at >= now() - interval '30 days'),
    'subs_active',         (select count(*) from public.subscriptions where status = 'active'),
    'subs_expired',        (select count(*) from public.subscriptions where status <> 'active'),
    'revenue_subscriptions',(select coalesce(sum(amount),0) from public.payments where status = 'approved'),
    'support_open',        (select count(*) from public.support_tickets where status = 'open')
  ) into result;
  return result;
end;
$$;

-- ─── grants + re-lock anon (Supabase auto-grants on new objects) ───────────
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
grant execute on function public.admin_kpis() to authenticated, service_role;

revoke all on public.app_settings from anon;
revoke execute on function public.admin_kpis() from anon;

comment on table public.app_settings is 'Single-row, admin-editable platform settings (prices, plan, platform PIX).';
comment on function public.admin_kpis is 'Aggregated KPIs for the admin dashboard (service_role or admin only).';
