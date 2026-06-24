-- ============================================================================
-- Rotta Urbana — 0040b: sistema de seleção de plano pós-cadastro
-- Modelos: comissão (%) por corrida, diário, semanal, mensal — tudo via PIX.
-- Requer 20260624010001_add_plan_types_enum já aplicado.
-- ============================================================================
set search_path = public, extensions;

-- 1. Novos campos em app_settings
alter table public.app_settings
  add column if not exists commission_pct  numeric(5,2) not null default 15.00
    check (commission_pct >= 0 and commission_pct <= 100),
  add column if not exists plan_weekly_price numeric(10,2) not null default 50.00
    check (plan_weekly_price >= 0);

-- 2. Campo plan_type em drivers (null = motorista ainda não escolheu)
alter table public.drivers
  add column if not exists plan_type public.plan_type;

-- 3. Tabela de comissões por corrida
create table if not exists public.driver_commissions (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.drivers(id) on delete cascade,
  ride_id           uuid not null references public.rides(id)   on delete cascade,
  ride_price        numeric(10,2) not null check (ride_price > 0),
  commission_pct    numeric(5,2)  not null,
  commission_amount numeric(10,2) not null,
  status            text not null default 'pending'
    check (status in ('pending', 'paid', 'waived')),
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  constraint driver_commissions_ride_id_key unique (ride_id)
);

alter table public.driver_commissions enable row level security;

create policy "dc_driver_own" on public.driver_commissions
  for select using (driver_id = auth.uid());

create policy "dc_admin_all" on public.driver_commissions
  for all using (is_admin());

grant select on public.driver_commissions to authenticated;

-- 4. Trigger: registrar comissão quando corrida é concluída
create or replace function public.record_ride_commission()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan   public.plan_type;
  v_pct    numeric;
begin
  -- Acionar apenas na transição → 'completed'
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  if new.driver_id is null or coalesce(new.price, 0) <= 0 then
    return new;
  end if;

  select plan_type into v_plan from public.drivers where id = new.driver_id;
  if v_plan is distinct from 'commission' then
    return new;
  end if;

  select commission_pct into v_pct from public.app_settings limit 1;
  v_pct := coalesce(v_pct, 15.00);

  insert into public.driver_commissions
    (driver_id, ride_id, ride_price, commission_pct, commission_amount)
  values
    (new.driver_id, new.id, new.price, v_pct, round(new.price * v_pct / 100, 2))
  on conflict (ride_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_record_commission on public.rides;
create trigger trg_record_commission
  after update on public.rides
  for each row execute function public.record_ride_commission();

-- 5. RPC: motorista escolhe plano
create or replace function public.driver_select_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_plan   public.plan_type;
  v_amount numeric;
  v_days   int;
begin
  v_plan := p_plan::public.plan_type;

  -- Salvar na tabela drivers
  update public.drivers set plan_type = v_plan where id = auth.uid();
  if not found then raise exception 'Motorista não encontrado'; end if;

  if v_plan = 'commission' then
    -- Comissão: acesso imediato, valor zero, vence daqui 30 dias (renova conforme uso)
    update public.subscriptions
    set plan     = 'commission',
        status   = 'active',
        amount   = 0.00,
        due_date = current_date + interval '30 days'
    where driver_id = auth.uid();

  else
    -- Plano fixo: calcula o valor e deixa como 'expired' até o admin confirmar o PIX
    select
      case v_plan
        when 'daily'   then subscription_daily_amount
        when 'weekly'  then plan_weekly_price
        else                subscription_monthly_amount
      end,
      case v_plan
        when 'daily'  then 1
        when 'weekly' then 7
        else               30
      end
    into v_amount, v_days
    from public.app_settings limit 1;

    v_amount := coalesce(v_amount,
      case v_plan when 'daily' then 10.00 when 'weekly' then 50.00 else 99.90 end);

    update public.subscriptions
    set plan     = v_plan,
        amount   = v_amount,
        status   = 'expired',
        due_date = current_date + (v_days || ' days')::interval
    where driver_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.driver_select_plan(text) to authenticated;

-- 6. RPC: saldo de comissões do motorista
create or replace function public.driver_get_commission_balance()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return (
    select json_build_object(
      'pending_count',  count(*)               filter (where status = 'pending'),
      'pending_amount', coalesce(sum(commission_amount) filter (where status = 'pending'), 0),
      'paid_amount',    coalesce(sum(commission_amount) filter (where status = 'paid'),    0),
      'total_rides',    count(*)
    )
    from public.driver_commissions
    where driver_id = auth.uid()
  );
end;
$$;

grant execute on function public.driver_get_commission_balance() to authenticated;

-- 7. RPC: relatório de comissões (admin)
create or replace function public.admin_commission_report()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
      select
        dc.driver_id,
        p.full_name,
        p.phone,
        count(*)                filter (where dc.status = 'pending')  as pending_count,
        coalesce(sum(dc.commission_amount) filter (where dc.status = 'pending'), 0) as pending_amount,
        coalesce(sum(dc.commission_amount) filter (where dc.status = 'paid'),    0) as paid_amount,
        count(*)                                                        as total_rides
      from public.driver_commissions dc
      join public.profiles p on p.id = dc.driver_id
      group by dc.driver_id, p.full_name, p.phone
      order by pending_amount desc nulls last
    ) r
  );
end;
$$;

grant execute on function public.admin_commission_report() to authenticated;

-- 8. RPC: admin ajusta percentual de comissão
create or replace function public.admin_set_commission_pct(p_pct numeric)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  if p_pct < 0 or p_pct > 100 then raise exception 'Percentual inválido (0–100)'; end if;
  update public.app_settings set commission_pct = p_pct;
end;
$$;

grant execute on function public.admin_set_commission_pct(numeric) to authenticated;

-- 9. RPC: admin ajusta preço semanal
create or replace function public.admin_set_plan_weekly_price(p_price numeric)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  if p_price < 0 then raise exception 'Preço inválido'; end if;
  update public.app_settings set plan_weekly_price = p_price;
end;
$$;

grant execute on function public.admin_set_plan_weekly_price(numeric) to authenticated;

-- 10. RLS: motorista pode atualizar seu próprio plan_type em drivers
-- (o selectPlan usa security definer RPC, não acesso direto à tabela)
-- Garante que drivers podem ver seu own row (para getDriverPlanType)
drop policy if exists "driver_read_own" on public.drivers;
create policy "driver_read_own" on public.drivers
  for select using (id = auth.uid() or is_admin() or is_manager());
