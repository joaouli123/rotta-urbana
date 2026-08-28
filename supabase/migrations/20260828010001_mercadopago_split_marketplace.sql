-- Rotta Urbana — Mercado Pago Split 1:1 for ride payments.
--
-- Seller tokens are encrypted by the Coolify backend before they reach this
-- table. They are never exposed through the mobile app or a public REST query.
set search_path = public, extensions;

alter type public.payment_method add value if not exists 'mercadopago';

create table if not exists public.mercadopago_driver_accounts (
  driver_id                 uuid primary key references public.drivers(id) on delete cascade,
  provider_user_id          text not null,
  access_token_ciphertext   text not null,
  refresh_token_ciphertext  text,
  access_token_expires_at   timestamptz,
  live_mode                 boolean not null default true,
  status                    text not null default 'connected'
    check (status in ('connected', 'disconnected', 'revoked', 'error')),
  last_error                text,
  connected_at              timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index if not exists mercadopago_driver_accounts_user_key
  on public.mercadopago_driver_accounts(provider_user_id);

alter table public.mercadopago_driver_accounts enable row level security;
revoke all on public.mercadopago_driver_accounts from anon, authenticated;

drop trigger if exists trg_mercadopago_driver_accounts_updated_at on public.mercadopago_driver_accounts;
create trigger trg_mercadopago_driver_accounts_updated_at
  before update on public.mercadopago_driver_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.mercadopago_oauth_states (
  state_hash  text primary key,
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists mercadopago_oauth_states_expiry_idx
  on public.mercadopago_oauth_states(expires_at);

alter table public.mercadopago_oauth_states enable row level security;
revoke all on public.mercadopago_oauth_states from anon, authenticated;

create table if not exists public.ride_payments (
  id                       uuid primary key default gen_random_uuid(),
  ride_id                  uuid not null unique references public.rides(id) on delete cascade,
  passenger_id             uuid not null references public.profiles(id) on delete restrict,
  driver_id                uuid not null references public.drivers(id) on delete restrict,
  gross_amount             numeric(10,2) not null check (gross_amount > 0),
  commission_pct           numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  marketplace_fee          numeric(10,2) not null default 0 check (marketplace_fee >= 0 and marketplace_fee <= gross_amount),
  driver_amount            numeric(10,2) not null check (driver_amount >= 0 and driver_amount <= gross_amount),
  currency                 text not null default 'BRL',
  provider                 text not null default 'mercadopago',
  -- Keep this column as text because PostgreSQL cannot use a newly added enum
  -- value inside the same migration transaction that adds it.
  method                   text not null default 'mercadopago'
    check (method = 'mercadopago'),
  status                   text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'refunded', 'cancelled')),
  provider_status          text,
  provider_status_detail   text,
  provider_preference_id   text unique,
  provider_payment_id      text unique,
  external_reference       text not null unique,
  checkout_url             text,
  provider_metadata         jsonb not null default '{}'::jsonb,
  paid_at                  timestamptz,
  refunded_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists ride_payments_passenger_idx on public.ride_payments(passenger_id, created_at desc);
create index if not exists ride_payments_driver_idx on public.ride_payments(driver_id, created_at desc);
create index if not exists ride_payments_status_idx on public.ride_payments(status, updated_at desc);

alter table public.ride_payments enable row level security;
drop policy if exists "ride_payments_parties_read" on public.ride_payments;
create policy "ride_payments_parties_read" on public.ride_payments
  for select using (passenger_id = auth.uid() or driver_id = auth.uid() or public.is_admin());
grant select on public.ride_payments to authenticated;

drop trigger if exists trg_ride_payments_updated_at on public.ride_payments;
create trigger trg_ride_payments_updated_at
  before update on public.ride_payments
  for each row execute function public.set_updated_at();

-- A split payment is already collected by Mercado Pago. Do not also create a
-- manual pending commission row for the same ride. Legacy/manual methods keep
-- the old accounting row so the admin can reconcile them later.
create or replace function public.record_ride_commission()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan    public.plan_type;
  v_segment text;
  v_pct     numeric;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.driver_id is null or coalesce(new.price, 0) <= 0 then return new; end if;
  if new.payment_method::text = 'mercadopago' then return new; end if;

  select plan_type, plan_segment into v_plan, v_segment
    from public.drivers where id = new.driver_id;
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

-- Earnings now show the amount actually assigned to the driver by the split.
-- Direct cash/PIX/card rides retain the legacy gross value because the app
-- cannot collect or settle those methods automatically.
create or replace function public.driver_earnings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'today', coalesce(sum(case when r.completed_at >= date_trunc('day', now()) then
      case when r.payment_method::text = 'mercadopago' then case when rp.status = 'approved' then coalesce(rp.driver_amount, 0) else 0 end else coalesce(r.price, 0) end
      else 0 end), 0),
    'week', coalesce(sum(case when r.completed_at >= now() - interval '7 days' then
      case when r.payment_method::text = 'mercadopago' then case when rp.status = 'approved' then coalesce(rp.driver_amount, 0) else 0 end else coalesce(r.price, 0) end
      else 0 end), 0),
    'month', coalesce(sum(case when r.completed_at >= now() - interval '30 days' then
      case when r.payment_method::text = 'mercadopago' then case when rp.status = 'approved' then coalesce(rp.driver_amount, 0) else 0 end else coalesce(r.price, 0) end
      else 0 end), 0),
    'total', coalesce(sum(case when r.payment_method::text = 'mercadopago' then case when rp.status = 'approved' then coalesce(rp.driver_amount, 0) else 0 end else coalesce(r.price, 0) end), 0),
    'rides', count(*)
  )
  from public.rides r
  left join public.ride_payments rp on rp.ride_id = r.id
  where r.driver_id = auth.uid() and r.status = 'completed';
$$;

grant execute on function public.driver_earnings() to authenticated, service_role;
revoke execute on function public.driver_earnings() from anon;
