-- Rotta Urbana — daily commission paid by Pix.
--
-- Each night the day's pending commissions of a driver become one invoice,
-- due the next morning at 10:00 (Brasília). An invoice left open past its due
-- time blocks the driver (subscription_is_current turns false) until the Pix
-- is confirmed by the Mercado Pago webhook. Commissions from before
-- 2026-09-25 are waived: the daily charge starts on that day.
set search_path = public, extensions;

-- 1. Old commissions are waived.
update public.driver_commissions
   set status = 'waived'
 where status = 'pending'
   and created_at < timestamptz '2026-09-25 00:00:00-03';

-- 2. One invoice per driver and day.
create table if not exists public.commission_invoices (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  ref_date            date not null,
  amount              numeric(10,2) not null check (amount >= 0),
  rides_count         integer not null default 0,
  status              text not null default 'open' check (status in ('open', 'paid', 'waived')),
  due_at              timestamptz not null,
  paid_at             timestamptz,
  payment_id          uuid,
  notified_at         timestamptz,
  reminded_at         timestamptz,
  overdue_notified_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint commission_invoices_driver_day_key unique (driver_id, ref_date)
);

create index if not exists commission_invoices_open_idx
  on public.commission_invoices (driver_id, due_at) where status = 'open';

alter table public.commission_invoices enable row level security;

drop policy if exists "ci_driver_own" on public.commission_invoices;
create policy "ci_driver_own" on public.commission_invoices
  for select using (driver_id = auth.uid());

drop policy if exists "ci_admin_all" on public.commission_invoices;
create policy "ci_admin_all" on public.commission_invoices
  for all using (public.is_admin());

grant select on public.commission_invoices to authenticated;
grant all on public.commission_invoices to service_role;

alter table public.driver_commissions
  add column if not exists invoice_id uuid references public.commission_invoices(id) on delete set null;

create index if not exists driver_commissions_unbilled_idx
  on public.driver_commissions (driver_id) where status = 'pending' and invoice_id is null;

-- 3. Pix payments of invoices (one Pix may cover several open days).
create table if not exists public.commission_payments (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  amount              numeric(10,2) not null check (amount > 0),
  invoice_ids         uuid[] not null,
  status              text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  provider_payment_id text,
  pix_qr_code         text,
  pix_qr_code_base64  text,
  pix_ticket_url      text,
  expires_at          timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists commission_payments_driver_idx
  on public.commission_payments (driver_id, created_at desc);

alter table public.commission_payments enable row level security;

drop policy if exists "cp_driver_own" on public.commission_payments;
create policy "cp_driver_own" on public.commission_payments
  for select using (driver_id = auth.uid());

drop policy if exists "cp_admin_all" on public.commission_payments;
create policy "cp_admin_all" on public.commission_payments
  for all using (public.is_admin());

grant select on public.commission_payments to authenticated;
grant all on public.commission_payments to service_role;

-- 4. Nightly close: past days' pending commissions become invoices.
create or replace function public.close_commission_days()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer := 0;
  r record;
  v_invoice uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  for r in
    select c.driver_id,
           (c.created_at at time zone 'America/Sao_Paulo')::date as ref_date,
           sum(c.commission_amount) as amount,
           count(*) as rides
      from public.driver_commissions c
     where c.status = 'pending'
       and c.invoice_id is null
       and (c.created_at at time zone 'America/Sao_Paulo')::date < v_today
     group by 1, 2
  loop
    insert into public.commission_invoices (driver_id, ref_date, amount, rides_count, due_at)
    values (
      r.driver_id, r.ref_date, r.amount, r.rides,
      -- 10:00 the next morning; a day closed late still gets an hour to pay.
      greatest(((r.ref_date + 1)::timestamp + interval '10 hours') at time zone 'America/Sao_Paulo',
               now() + interval '1 hour')
    )
    on conflict (driver_id, ref_date) do update
      -- A late commission on a day already settled reopens it for the new
      -- amount only; an open day just grows.
      set amount = case when public.commission_invoices.status = 'open'
                        then public.commission_invoices.amount + excluded.amount else excluded.amount end,
          rides_count = case when public.commission_invoices.status = 'open'
                             then public.commission_invoices.rides_count + excluded.rides_count else excluded.rides_count end,
          status = 'open',
          paid_at = null,
          payment_id = null,
          due_at = greatest(public.commission_invoices.due_at, excluded.due_at),
          updated_at = now()
    returning id into v_invoice;

    update public.driver_commissions c
       set invoice_id = v_invoice
     where c.driver_id = r.driver_id
       and c.status = 'pending'
       and c.invoice_id is null
       and (c.created_at at time zone 'America/Sao_Paulo')::date = r.ref_date;

    v_count := v_count + 1;
  end loop;

  -- A day with nothing to pay (all zero) needs no Pix.
  update public.commission_invoices
     set status = 'waived', updated_at = now()
   where status = 'open' and amount <= 0;

  return v_count;
end;
$$;

revoke all on function public.close_commission_days() from public, anon, authenticated;
grant execute on function public.close_commission_days() to service_role;

-- 5. Overdue: an open invoice past its due time.
create or replace function public.commission_overdue(p_driver_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.commission_invoices i
     where i.driver_id = coalesce(p_driver_id, auth.uid())
       and i.status = 'open'
       and i.due_at < now()
  );
$$;

grant execute on function public.commission_overdue(uuid) to authenticated, service_role;

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
      and (s.plan = 'commission' or s.due_date >= current_date)
  )
  and not public.commission_overdue(coalesce(p_driver_id, auth.uid()));
$$;

comment on function public.subscription_is_current(uuid) is
  'True only when a verified, active driver has an active subscription (per-ride commission, or a paid plan due today or later) and no daily commission invoice past its due time.';

-- 6. Pix confirmed: payment, its invoices and their commissions are paid.
create or replace function public.commission_payment_approve(p_payment_id uuid, p_provider_payment_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.commission_payments;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_pay from public.commission_payments where id = p_payment_id for update;
  if not found then return false; end if;
  if v_pay.status = 'approved' then return true; end if;

  update public.commission_payments
     set status = 'approved',
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         paid_at = now(), updated_at = now()
   where id = p_payment_id;

  update public.commission_invoices
     set status = 'paid', paid_at = now(), payment_id = p_payment_id, updated_at = now()
   where id = any(v_pay.invoice_ids) and status = 'open';

  update public.driver_commissions
     set status = 'paid', paid_at = now()
   where invoice_id = any(v_pay.invoice_ids) and status = 'pending';

  return true;
end;
$$;

revoke all on function public.commission_payment_approve(uuid, text) from public, anon, authenticated;
grant execute on function public.commission_payment_approve(uuid, text) to service_role;

-- Admin: waive or mark paid by hand (cash, mistake).
create or replace function public.admin_set_commission_invoice(p_invoice_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('paid', 'waived') then raise exception 'invalid status'; end if;

  update public.commission_invoices
     set status = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end,
         updated_at = now()
   where id = p_invoice_id and status = 'open';

  update public.driver_commissions
     set status = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where invoice_id = p_invoice_id and status = 'pending';
end;
$$;

revoke all on function public.admin_set_commission_invoice(uuid, text) from public, anon;
grant execute on function public.admin_set_commission_invoice(uuid, text) to authenticated, service_role;

-- 7. What the app shows: open invoices, total, blocked, today's running amount.
create or replace function public.driver_commission_status()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'open_total', coalesce((select sum(amount) from public.commission_invoices
                             where driver_id = auth.uid() and status = 'open'), 0),
    'next_due_at', (select min(due_at) from public.commission_invoices
                     where driver_id = auth.uid() and status = 'open'),
    'overdue', public.commission_overdue(auth.uid()),
    'open', coalesce((select jsonb_agg(jsonb_build_object(
                'id', id, 'ref_date', ref_date, 'amount', amount,
                'rides_count', rides_count, 'due_at', due_at) order by ref_date)
              from public.commission_invoices
             where driver_id = auth.uid() and status = 'open'), '[]'::jsonb),
    'today_amount', coalesce((select sum(commission_amount) from public.driver_commissions
                               where driver_id = auth.uid() and status = 'pending' and invoice_id is null), 0),
    'today_rides', (select count(*) from public.driver_commissions
                     where driver_id = auth.uid() and status = 'pending' and invoice_id is null)
  );
$$;

revoke all on function public.driver_commission_status() from public, anon;
grant execute on function public.driver_commission_status() to authenticated;
