-- Rotta Urbana — Diária e Semanal viram pagamento único; só a Mensal renova.
--
-- 1. Drivers can no longer change their own plan: set_subscription_plan is
--    gone, and a direct update of their own row may change only the Pix key.
-- 2. The plan category must match the driver's vehicle (moto vs car).
-- 3. A pass (daily or weekly) is paid once through Mercado Pago (Pix or card)
--    and adds its days to what the driver still has, so renewing early never
--    loses a day. Every notification for the same checkout goes through one
--    locked function, so a late, repeated or out-of-order notification can
--    neither credit twice nor undo an approval.
-- 4. An admin change can set the due date and runs from the server too; a
--    change of plan stops the Mercado Pago subscription from charging.
-- 5. Renewal reminders are recorded so each one is sent once.
-- 6. A driver whose plan is not current no longer gets "Nova corrida!" pushes.
-- 7. The admin's manual confirmation never credits a pass; Mercado Pago does.
-- 8. Existing rows: the category follows the vehicle, and Por Corrida no
--    longer ends (older app builds still read its due date).
-- 9. An expired pass is no longer the driver's plan, so older app builds,
--    which refuse to sell "the plan you already have", can renew it.
set search_path = public, extensions;

-- ─── 1. Plan changes only through checkout, commission RPC or admin ─────────
drop function if exists public.set_subscription_plan(public.plan_type);

-- The old policy read drivers inside a drivers policy, which Postgres rejects
-- as infinite recursion, so no direct update ever went through (not even the
-- Pix key saved at sign-up). The row check stays in the policy and a trigger
-- keeps a driver's own writes to the Pix key; everything else (going online,
-- plans, verification) goes through the app's functions or an admin.
drop policy if exists drivers_update_own on public.drivers;
create policy drivers_update_own on public.drivers for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.drivers_guard_own_update()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and not public.is_admin()
     and (to_jsonb(new) - array['pix_key', 'pix_key_type', 'updated_at'])
         is distinct from (to_jsonb(old) - array['pix_key', 'pix_key_type', 'updated_at']) then
    raise exception 'Motorista só pode alterar a chave Pix' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.drivers_guard_own_update() from public, anon, authenticated;

drop trigger if exists trg_drivers_guard_own_update on public.drivers;
create trigger trg_drivers_guard_own_update
  before update on public.drivers
  for each row execute function public.drivers_guard_own_update();

-- Moves the Mercado Pago subscription and any unpaid checkout into
-- cancel_pending (the server cancels them) and forgets the unpaid checkout.
create or replace function public.subscription_metadata_retiring(p_sub public.subscriptions)
returns jsonb
language plpgsql immutable
as $$
declare
  v_meta jsonb := coalesce(p_sub.provider_metadata, '{}'::jsonb);
  v_ids text[];
  v_cancel jsonb;
  v_replaced jsonb;
begin
  v_ids := array_remove(array[
    nullif(p_sub.provider_subscription_id, ''),
    nullif(v_meta #>> '{pending_checkout,preapproval_id}', '')
  ], null);
  v_meta := v_meta - 'pending_checkout';
  if coalesce(array_length(v_ids, 1), 0) = 0 then return v_meta; end if;

  select coalesce(jsonb_agg(distinct id), '[]'::jsonb) into v_cancel
    from (
      select jsonb_array_elements_text(
        case when jsonb_typeof(v_meta -> 'cancel_pending') = 'array' then v_meta -> 'cancel_pending' else '[]'::jsonb end
      ) as id
      union
      select unnest(v_ids)
    ) ids;
  select coalesce(jsonb_agg(distinct id), '[]'::jsonb) into v_replaced
    from (
      select jsonb_array_elements_text(
        case when jsonb_typeof(v_meta -> 'replaced_preapproval_ids') = 'array' then v_meta -> 'replaced_preapproval_ids' else '[]'::jsonb end
      ) as id
      union
      select unnest(v_ids)
    ) ids;
  return jsonb_set(jsonb_set(v_meta, '{cancel_pending}', v_cancel), '{replaced_preapproval_ids}', v_replaced);
end;
$$;

revoke execute on function public.subscription_metadata_retiring(public.subscriptions) from public, anon, authenticated;
grant execute on function public.subscription_metadata_retiring(public.subscriptions) to service_role;

-- ─── 2. Plan category vs vehicle ───────────────────────────────────────────
-- A moto pays moto prices and a car pays car prices. Without a vehicle yet,
-- any valid category is accepted.
create or replace function public.driver_plan_segment_allowed(p_driver_id uuid, p_segment text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_segment is null or p_segment not in ('moto', 'economy', 'comfort', 'premium') then false
    when v.type is null then true
    when v.type = 'moto' then p_segment = 'moto'
    else p_segment <> 'moto'
  end
  from (
    select (
      select type from public.vehicles
       where driver_id = p_driver_id
       order by is_primary desc, created_at
       limit 1
    ) as type
  ) v;
$$;

revoke execute on function public.driver_plan_segment_allowed(uuid, text) from public, anon;
grant execute on function public.driver_plan_segment_allowed(uuid, text) to authenticated, service_role;

-- The category to use for a driver: the one asked for when it fits the
-- vehicle, otherwise the vehicle's (moto, or economy for a car). Older app
-- builds send economy for a moto driver whose category was never saved.
create or replace function public.driver_plan_segment_for(p_driver_id uuid, p_segment text)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.driver_plan_segment_allowed(p_driver_id, s.segment) then s.segment
    when v.type = 'moto' then 'moto'
    else 'economy'
  end
  from (select lower(nullif(btrim(p_segment), '')) as segment) s,
       (select (
          select type from public.vehicles
           where driver_id = p_driver_id
           order by is_primary desc, created_at
           limit 1
        ) as type) v;
$$;

revoke execute on function public.driver_plan_segment_for(uuid, text) from public, anon;
grant execute on function public.driver_plan_segment_for(uuid, text) to authenticated, service_role;

create or replace function public.driver_select_plan(p_plan text, p_segment text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan public.plan_type;
  v_segment text;
  v_amount numeric;
  v_sub public.subscriptions;
  v_meta jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_plan := p_plan::public.plan_type;
  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Motorista nao encontrado';
  end if;
  v_segment := public.driver_plan_segment_for(auth.uid(), p_segment);

  if v_plan <> 'commission' then
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
    end
    into v_amount
    from public.app_settings where id = 1;
    if coalesce(v_amount, 0) <= 0 then raise exception 'Preco do plano nao configurado'; end if;
    -- The checkout switches the plan once Mercado Pago confirms the payment.
    return;
  end if;

  select * into v_sub from public.subscriptions where driver_id = auth.uid() for update;
  -- The current subscription and any unpaid checkout must stop charging.
  -- The server cancels everything listed in cancel_pending on its next sync.
  v_meta := case when found then public.subscription_metadata_retiring(v_sub) else '{}'::jsonb end;

  insert into public.subscriptions (driver_id, plan, plan_segment, status, amount, due_date, provider_metadata)
  values (auth.uid(), 'commission', v_segment, 'active', 0, current_date + 3650, v_meta)
  on conflict (driver_id) do update
    set plan = 'commission',
        plan_segment = v_segment,
        status = 'active',
        amount = 0,
        due_date = current_date + 3650,
        provider_subscription_id = null,
        provider_status = case
          when public.subscriptions.provider_subscription_id is not null then 'cancelled'
          else null
        end,
        provider_payment_method_id = null,
        next_payment_at = null,
        provider_metadata = v_meta,
        updated_at = now();

  update public.drivers
     set plan_type = 'commission', plan_segment = v_segment, updated_at = now()
   where id = auth.uid();
end;
$$;

-- Older app builds send only the plan. The category comes from the driver's
-- current one when it still fits the vehicle, otherwise from the vehicle.
create or replace function public.driver_select_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public.driver_select_plan(p_plan, (select plan_segment from public.drivers where id = auth.uid()));
end;
$$;

revoke execute on function public.driver_select_plan(text) from public, anon;
grant execute on function public.driver_select_plan(text) to authenticated, service_role;
revoke execute on function public.driver_select_plan(text, text) from public, anon;
grant execute on function public.driver_select_plan(text, text) to authenticated, service_role;

-- ─── 3. One-time passes ────────────────────────────────────────────────────
-- Applies one Mercado Pago notification to a pass checkout. Returns what
-- happened: credited, credited_duplicate, refunded, updated, unchanged or
-- ignored. Only the server (service role) calls it.
create or replace function public.apply_one_time_plan_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_status public.payment_status,
  p_provider_status text default null,
  p_method public.payment_method default null,
  p_provider_metadata jsonb default null
)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_payment public.payments;
  v_other public.payments;
  v_sub public.subscriptions;
  v_provider_id text := nullif(btrim(p_provider_payment_id), '');
  v_plan text;
  v_days integer;
  v_segment text;
  v_base date;
  v_target uuid;
  v_result text := 'credited';
  v_extra jsonb := case when p_provider_metadata is null then '{}'::jsonb
                        else jsonb_build_object('provider', p_provider_metadata) end;
begin
  if p_status is null then raise exception 'status required'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;
  if v_payment.provider is distinct from 'mercadopago'
     or coalesce(v_payment.provider_metadata ->> 'billing_model', '') not in ('one_time_daily', 'one_time_pass') then
    raise exception 'payment is not a one-time plan checkout';
  end if;

  -- A second charge of the same checkout already has its own ledger row.
  if v_provider_id is not null and v_payment.provider_payment_id is distinct from v_provider_id then
    select * into v_other from public.payments
     where provider = 'mercadopago' and provider_payment_id = v_provider_id
     for update;
    if found then
      if v_other.driver_id is distinct from v_payment.driver_id then
        raise exception 'provider payment belongs to another driver';
      end if;
      v_payment := v_other;
    end if;
  end if;

  v_plan := v_payment.provider_metadata ->> 'plan';
  v_days := case v_plan when 'daily' then 1 when 'weekly' then 7 else null end;
  if v_days is null then raise exception 'invalid one-time plan'; end if;

  if v_payment.status in ('approved', 'refunded') then
    if v_provider_id is null or v_provider_id is not distinct from v_payment.provider_payment_id then
      if p_status = 'refunded' and v_payment.status = 'approved' then
        update public.payments
           set status = 'refunded',
               provider_status = coalesce(p_provider_status, provider_status),
               provider_metadata = provider_metadata || v_extra
         where id = v_payment.id;
        -- A refunded or charged-back pass takes its days back while the driver
        -- is still on passes; a later plan change already replaced them.
        update public.subscriptions
           set due_date = due_date - v_days,
               updated_at = now()
         where driver_id = v_payment.driver_id
           and plan in ('daily', 'weekly')
           and provider_status = 'one_time_approved';
        return 'refunded';
      end if;
      update public.payments
         set provider_status = coalesce(p_provider_status, provider_status),
             provider_metadata = provider_metadata || v_extra
       where id = v_payment.id;
      return 'unchanged';
    end if;
    -- Another charge on a checkout that was already paid (e.g. an old Pix
    -- paid after a card). The driver paid for it, so it counts as one more
    -- pass on its own ledger row.
    if p_status <> 'approved' then return 'ignored'; end if;
    insert into public.payments (
      driver_id, subscription_id, amount, method, status, provider,
      provider_payment_id, provider_status, external_reference, provider_metadata
    ) values (
      v_payment.driver_id, v_payment.subscription_id, v_payment.amount,
      coalesce(p_method, v_payment.method), 'pending', 'mercadopago',
      v_provider_id, p_provider_status,
      coalesce(v_payment.external_reference, '') || '#' || v_provider_id,
      (v_payment.provider_metadata - 'provider' - 'init_point')
        || jsonb_build_object('duplicate_of', v_payment.id) || v_extra
    )
    on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing
    returning id into v_target;
    if v_target is null then return 'ignored'; end if;
    v_result := 'credited_duplicate';
  else
    if p_status <> 'approved' then
      update public.payments
         set status = p_status,
             method = coalesce(p_method, method),
             provider_payment_id = coalesce(v_provider_id, provider_payment_id),
             provider_status = coalesce(p_provider_status, provider_status),
             provider_metadata = provider_metadata || v_extra
       where id = v_payment.id;
      return 'updated';
    end if;
    v_target := v_payment.id;
  end if;

  select * into v_sub from public.subscriptions
   where driver_id = v_payment.driver_id
   for update;
  if not found then raise exception 'subscription not found'; end if;

  v_segment := coalesce(nullif(v_payment.provider_metadata ->> 'plan_segment', ''), v_sub.plan_segment, 'economy');
  if v_segment not in ('moto', 'economy', 'comfort', 'premium') then
    raise exception 'invalid plan segment';
  end if;

  update public.payments
     set status = 'approved',
         paid_at = coalesce(paid_at, now()),
         method = coalesce(p_method, method),
         provider_payment_id = coalesce(v_provider_id, provider_payment_id),
         provider_status = coalesce(p_provider_status, 'approved'),
         subscription_id = v_sub.id,
         provider_metadata = provider_metadata || v_extra
   where id = v_target;

  -- Days stack on any paid plan the driver still has, so an early renewal or
  -- a switch from a monthly plan never loses a day.
  v_base := case
    when v_sub.status = 'active' and v_sub.plan <> 'commission' and v_sub.due_date >= current_date
      then v_sub.due_date
    else current_date
  end;

  update public.subscriptions
     set plan = v_plan::public.plan_type,
         plan_segment = v_segment,
         amount = v_payment.amount,
         status = 'active',
         due_date = v_base + v_days,
         paid_at = now(),
         provider = 'mercadopago',
         provider_subscription_id = null,
         provider_status = 'one_time_approved',
         provider_payment_method_id = coalesce(p_method, v_payment.method)::text,
         next_payment_at = null,
         provider_last_synced_at = now(),
         provider_cancelled_at = case
           when v_sub.provider_subscription_id is not null then now()
           else v_sub.provider_cancelled_at
         end,
         provider_metadata = public.subscription_metadata_retiring(v_sub)
           || jsonb_build_object('billing_model', 'one_time_pass'),
         updated_at = now()
   where id = v_sub.id;

  return v_result;
end;
$$;

revoke execute on function public.apply_one_time_plan_payment(uuid, text, public.payment_status, text, public.payment_method, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_one_time_plan_payment(uuid, text, public.payment_status, text, public.payment_method, jsonb)
  to service_role;

-- Kept for a server that has not been redeployed yet.
create or replace function public.confirm_daily_plan_payment(
  p_payment_id uuid,
  p_provider_payment_id text default null
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public.apply_one_time_plan_payment(p_payment_id, p_provider_payment_id, 'approved', 'approved', null, null);
end;
$$;

revoke execute on function public.confirm_daily_plan_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_daily_plan_payment(uuid, text) to service_role;

-- ─── 4. Admin plan changes ─────────────────────────────────────────────────
drop function if exists public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status);

create or replace function public.admin_set_driver_plan(
  p_driver_id uuid,
  p_plan public.plan_type,
  p_segment text,
  p_status public.subscription_status,
  p_due_date date default null
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_segment text := lower(nullif(btrim(p_segment), ''));
  v_amount numeric(10,2);
  v_days integer;
  v_sub public.subscriptions;
  v_retire boolean;
  v_meta jsonb;
begin
  -- The server calls this with the service role (no user); the app as an admin.
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  if p_plan is null or p_status is null then raise exception 'Plano ou status inválido'; end if;
  if v_segment is null or v_segment not in ('moto', 'economy', 'comfort', 'premium') then
    raise exception 'Categoria do veículo inválida';
  end if;
  if not public.driver_plan_segment_allowed(p_driver_id, v_segment) then
    raise exception 'A categoria não combina com o veículo principal do motorista';
  end if;

  select case
    when v_segment = 'moto' and p_plan = 'daily' then moto_daily_price
    when v_segment = 'moto' and p_plan = 'weekly' then moto_weekly_price
    when v_segment = 'moto' and p_plan = 'monthly' then moto_monthly_price
    when v_segment = 'economy' and p_plan = 'monthly' then car_economy_monthly_price
    when v_segment = 'comfort' and p_plan = 'monthly' then car_comfort_monthly_price
    when v_segment = 'premium' and p_plan = 'monthly' then car_premium_monthly_price
    when p_plan = 'daily' then subscription_daily_amount
    when p_plan = 'weekly' then plan_weekly_price
    else subscription_monthly_amount
  end
  into v_amount
  from public.app_settings where id = 1;

  v_amount := case when p_plan = 'commission' then 0 else coalesce(v_amount, 0) end;
  if p_plan <> 'commission' and v_amount <= 0 then
    raise exception 'O preço deste plano não está configurado';
  end if;
  -- Por Corrida never ends; the far date keeps older app builds, which
  -- still compare it with today, from blocking the driver.
  v_days := case p_plan when 'daily' then 1 when 'weekly' then 7 when 'monthly' then 30 else 3650 end;

  update public.drivers
     set plan_type = p_plan, plan_segment = v_segment, updated_at = now()
   where id = p_driver_id;
  if not found then raise exception 'Motorista não encontrado'; end if;

  select * into v_sub from public.subscriptions where driver_id = p_driver_id for update;
  -- Another plan, or no access at all: the Mercado Pago subscription must
  -- stop charging. The same plan kept active keeps its renewal.
  v_retire := found and (
    v_sub.plan is distinct from p_plan
    or v_sub.plan_segment is distinct from v_segment
    or p_status <> 'active'
  );
  v_meta := case
    when not found then '{}'::jsonb
    when v_retire then public.subscription_metadata_retiring(v_sub)
    else coalesce(v_sub.provider_metadata, '{}'::jsonb)
  end;

  -- manual_admin keeps the Mercado Pago sync from undoing this change.
  insert into public.subscriptions (
    driver_id, plan, plan_segment, status, amount, due_date, paid_at, provider_status, provider_metadata
  ) values (
    p_driver_id, p_plan, v_segment, p_status, v_amount,
    coalesce(p_due_date, current_date + v_days),
    case when p_status = 'active' then now() else null end,
    'manual_admin',
    v_meta
  )
  on conflict (driver_id) do update
    set plan = excluded.plan,
        plan_segment = excluded.plan_segment,
        status = excluded.status,
        amount = excluded.amount,
        due_date = excluded.due_date,
        paid_at = case when excluded.status = 'active' then now() else public.subscriptions.paid_at end,
        provider_status = 'manual_admin',
        provider_subscription_id = case when v_retire then null else public.subscriptions.provider_subscription_id end,
        provider_cancelled_at = case
          when v_retire and public.subscriptions.provider_subscription_id is not null then now()
          else public.subscriptions.provider_cancelled_at
        end,
        next_payment_at = case when v_retire then null else public.subscriptions.next_payment_at end,
        provider_metadata = excluded.provider_metadata,
        updated_at = now();
end;
$$;

revoke execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status, date) from public, anon;
grant execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status, date) to authenticated, service_role;

-- ─── 5. Renewal reminders ──────────────────────────────────────────────────
create table if not exists public.plan_renewal_reminders (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  due_date  date not null,
  kind      text not null check (kind in ('h24', 'h3', 'expired')),
  sent_at   timestamptz not null default now(),
  primary key (driver_id, due_date, kind)
);

alter table public.plan_renewal_reminders enable row level security;
revoke all on public.plan_renewal_reminders from anon, authenticated;
grant select, insert, delete on public.plan_renewal_reminders to service_role;

comment on table public.plan_renewal_reminders is
  'One row per renewal push sent, so the server never repeats a reminder for the same due date.';

-- Paid plans that end around now, for the server's reminder job.
create or replace function public.plan_renewal_reminder_candidates()
returns table (
  driver_id uuid,
  plan public.plan_type,
  status public.subscription_status,
  due_date date,
  auto_renews boolean,
  push_token text
)
language sql stable security definer set search_path = public
as $$
  select s.driver_id, s.plan, s.status, s.due_date,
         -- A monthly plan Mercado Pago is still charging (an admin edit that
         -- kept the plan keeps its subscription). An expired one is not.
         -- The admin edit renews only if Mercado Pago last had that
         -- subscription authorized; a checkout never paid charges nothing.
         (s.provider_subscription_id is not null
           and s.provider_cancelled_at is null
           and s.status = 'active'
           and (lower(coalesce(s.provider_status, '')) in ('authorized', 'active')
             or (s.provider_status = 'manual_admin'
               and lower(coalesce(s.provider_metadata->>'status', 'authorized')) in ('authorized', 'active')))) as auto_renews,
         p.push_token
    from public.subscriptions s
    join public.drivers d on d.id = s.driver_id
    join public.profiles p on p.id = s.driver_id
   where s.plan <> 'commission'
     and s.status in ('active', 'expired')
     -- A row the checkout created for a plan that was never paid.
     and not (s.status = 'expired' and coalesce(s.provider_status, '') = 'checkout_pending')
     -- Nor the row a new driver starts with: nothing was ever paid on it.
     and not (s.status = 'expired' and s.paid_at is null and s.provider_subscription_id is null)
     and s.due_date between current_date - 2 and current_date + 1
     and p.push_token is not null
     and p.role = 'driver'
     and coalesce(p.is_active, true)
     and d.is_verified;
$$;

revoke execute on function public.plan_renewal_reminder_candidates() from public, anon, authenticated;
grant execute on function public.plan_renewal_reminder_candidates() to service_role;

-- ─── 6. No ride pushes without a current plan ──────────────────────────────
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
  where d.status = 'online'
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

-- ─── 7. Manual confirmation ────────────────────────────────────────────────
-- Same as 20260813010002, except for pass checkouts: only a Mercado Pago
-- payment credits a pass (apply_one_time_plan_payment), so a manual
-- confirmation can neither grant the wrong days nor credit a pass twice.
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
  if coalesce(v_payment.provider_metadata ->> 'billing_model', '') in ('one_time_pass', 'one_time_daily') then
    raise exception 'Passe Diário/Semanal: o Mercado Pago confirma sozinho. Use Sincronizar no painel administrativo.';
  end if;
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
end;
$$;

revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text) to service_role;

-- ─── 8. Existing rows ──────────────────────────────────────────────────────
-- Drivers with a vehicle whose stored category does not fit it (a moto on a
-- car category, mostly never saved) take the vehicle's.
update public.drivers d
   set plan_segment = public.driver_plan_segment_for(d.id, d.plan_segment),
       updated_at = now()
 where exists (select 1 from public.vehicles v where v.driver_id = d.id)
   and d.plan_segment is distinct from public.driver_plan_segment_for(d.id, d.plan_segment);

update public.subscriptions s
   set plan_segment = public.driver_plan_segment_for(s.driver_id, s.plan_segment),
       updated_at = now()
 where exists (select 1 from public.vehicles v where v.driver_id = s.driver_id)
   and s.plan_segment is distinct from public.driver_plan_segment_for(s.driver_id, s.plan_segment);

-- Por Corrida no longer ends. Rows the old expiry job closed (their due date
-- had passed) are open again. A row an admin expired before its due date
-- (the Vencer button or the admin app) stays expired.
update public.subscriptions
   set status = case
         when status = 'expired' and due_date < current_date then 'active'
         else status
       end,
       due_date = greatest(due_date, current_date + 3650),
       updated_at = now()
 where plan = 'commission'
   and due_date < current_date + 3650;

-- ─── 9. An expired pass leaves the driver without a plan ──────────────────
-- Older app builds compare the plan tapped with drivers.plan_type and answer
-- "Você já está neste plano", so a driver whose Diário or Semanal ended could
-- not buy it again. Once a pass expires it stops being the driver's plan; the
-- next payment sets it again. The app reads the plan from the subscription.
create or replace function public.sync_active_subscription_plan_to_driver()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'active' then
    update public.drivers
       set plan_type = new.plan,
           plan_segment = new.plan_segment,
           updated_at = now()
     where id = new.driver_id
       and (plan_type is distinct from new.plan or plan_segment is distinct from new.plan_segment);
  elsif new.status = 'expired' and new.plan in ('daily', 'weekly') then
    update public.drivers
       set plan_type = null,
           updated_at = now()
     where id = new.driver_id
       and plan_type = new.plan;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_active_subscription_plan_to_driver() from public, anon, authenticated;

update public.drivers d
   set plan_type = null,
       updated_at = now()
  from public.subscriptions s
 where s.driver_id = d.id
   and s.status = 'expired'
   and s.plan in ('daily', 'weekly')
   and d.plan_type = s.plan;
