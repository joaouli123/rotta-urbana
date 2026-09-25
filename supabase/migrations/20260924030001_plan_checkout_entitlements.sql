-- Rotta Urbana — a paid plan only changes after Mercado Pago confirms it.
--
-- 1. Per-ride commission has nothing to renew, so it no longer expires after
--    30 days and blocks the driver.
-- 2. Choosing a paid plan no longer touches the current plan. The server keeps
--    the unpaid checkout aside and switches the plan once the payment is
--    authorized. Older app builds still call this RPC before the checkout;
--    they used to expire the driver's current plan on the spot.
-- 3. Choosing commission through the RPC also works for a driver without a
--    subscription row, and hands any Mercado Pago subscription to the server
--    to be cancelled.
-- 4. An admin change is marked manual_admin so the provider sync keeps it.
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
      and (s.plan = 'commission' or s.due_date >= current_date)
  );
$$;

comment on function public.subscription_is_current(uuid) is
  'True only when a verified, active driver has an active subscription: per-ride commission, or a paid plan whose due_date is today or later.';

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
     and plan <> 'commission'
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
  v_ids text[];
  v_cancel jsonb;
  v_replaced jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_plan := p_plan::public.plan_type;
  v_segment := lower(nullif(btrim(p_segment), ''));
  if v_segment is null or v_segment not in ('moto','economy','comfort','premium') then
    raise exception 'categoria de plano invalida';
  end if;
  if not exists (select 1 from public.drivers where id = auth.uid()) then
    raise exception 'Motorista nao encontrado';
  end if;

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
    -- The checkout switches the plan once Mercado Pago authorizes it.
    return;
  end if;

  select * into v_sub from public.subscriptions where driver_id = auth.uid() for update;
  v_meta := coalesce(v_sub.provider_metadata, '{}'::jsonb);
  -- The current subscription and any unpaid checkout must stop charging.
  -- The server cancels everything listed in cancel_pending on its next sync.
  v_ids := array_remove(array[
    nullif(v_sub.provider_subscription_id, ''),
    nullif(v_meta #>> '{pending_checkout,preapproval_id}', '')
  ], null);

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

  v_meta := v_meta - 'pending_checkout';
  if jsonb_array_length(v_cancel) > 0 then
    v_meta := jsonb_set(v_meta, '{cancel_pending}', v_cancel);
  end if;
  if jsonb_array_length(v_replaced) > 0 then
    v_meta := jsonb_set(v_meta, '{replaced_preapproval_ids}', v_replaced);
  end if;

  insert into public.subscriptions (driver_id, plan, plan_segment, status, amount, due_date, provider_metadata)
  values (auth.uid(), 'commission', v_segment, 'active', 0, current_date + 30, v_meta)
  on conflict (driver_id) do update
    set plan = 'commission',
        plan_segment = v_segment,
        status = 'active',
        amount = 0,
        due_date = current_date + 30,
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

create or replace function public.admin_set_driver_plan(
  p_driver_id uuid,
  p_plan public.plan_type,
  p_segment text,
  p_status public.subscription_status
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_segment text := lower(nullif(btrim(p_segment), ''));
  v_amount numeric(10,2);
  v_days integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_plan is null or p_status is null then raise exception 'Plano ou status inválido'; end if;
  if v_segment is null or v_segment not in ('moto', 'economy', 'comfort', 'premium') then
    raise exception 'Categoria do veículo inválida';
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
  v_days := case p_plan when 'daily' then 1 when 'weekly' then 7 else 30 end;

  update public.drivers
     set plan_type = p_plan, plan_segment = v_segment, updated_at = now()
   where id = p_driver_id;
  if not found then raise exception 'Motorista não encontrado'; end if;

  -- manual_admin keeps the Mercado Pago sync from undoing this change.
  insert into public.subscriptions (driver_id, plan, plan_segment, status, amount, due_date, paid_at, provider_status)
  values (
    p_driver_id, p_plan, v_segment, p_status, v_amount,
    current_date + v_days,
    case when p_status = 'active' then now() else null end,
    'manual_admin'
  )
  on conflict (driver_id) do update
    set plan = excluded.plan,
        plan_segment = excluded.plan_segment,
        status = excluded.status,
        amount = excluded.amount,
        due_date = excluded.due_date,
        paid_at = case when excluded.status = 'active' then now() else public.subscriptions.paid_at end,
        provider_status = 'manual_admin',
        updated_at = now();
end;
$$;

grant execute on function public.subscription_is_current(uuid) to authenticated, service_role;
grant execute on function public.expire_overdue_subscriptions() to authenticated, service_role;
revoke execute on function public.expire_overdue_subscriptions() from anon;
grant execute on function public.driver_select_plan(text, text) to authenticated, service_role;
grant execute on function public.driver_select_plan(text) to authenticated, service_role;
revoke execute on function public.driver_select_plan(text, text) from anon;
revoke execute on function public.driver_select_plan(text) from anon;
revoke execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status) from public, anon;
grant execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status) to authenticated, service_role;
