-- Mobile admin tools for changing a driver's plan and manually confirming
-- subscription payments. Every callable function verifies the authenticated admin.
set search_path = public, extensions;

drop function if exists public.admin_list_drivers(int);

create or replace function public.admin_list_drivers(p_limit int default 200)
returns table (
  driver_id uuid, full_name text, phone text, rating numeric,
  status public.driver_status, is_verified boolean,
  documents_status text, total_rides int,
  vehicle_model text, vehicle_plate text, vehicle_color text, vehicle_year int,
  subscription_status public.subscription_status, subscription_due date,
  operating_city text, operating_state text,
  subscription_plan public.plan_type, plan_segment text
)
language sql stable security definer set search_path = public
as $$
  select d.id, p.full_name, p.phone, p.rating,
         d.status, d.is_verified, d.documents_status::text, d.total_rides,
         v.model, v.plate::text, v.color, v.year,
         s.status, s.due_date, d.operating_city, d.operating_state,
         coalesce(s.plan, d.plan_type), coalesce(s.plan_segment, d.plan_segment)
  from public.drivers d
  join public.profiles p on p.id = d.id
  left join lateral (
    select model, plate, color, year from public.vehicles
    where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  left join lateral (
    select status, due_date, plan, plan_segment from public.subscriptions
    where driver_id = d.id order by due_date desc limit 1
  ) s on true
  where public.is_admin()
  order by d.is_verified asc, p.full_name asc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.admin_list_drivers(int) to authenticated, service_role;

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

  insert into public.subscriptions (driver_id, plan, plan_segment, status, amount, due_date, paid_at)
  values (
    p_driver_id, p_plan, v_segment, p_status, v_amount,
    current_date + v_days,
    case when p_status = 'active' then now() else null end
  )
  on conflict (driver_id) do update
    set plan = excluded.plan,
        plan_segment = excluded.plan_segment,
        status = excluded.status,
        amount = excluded.amount,
        due_date = excluded.due_date,
        paid_at = case when excluded.status = 'active' then now() else public.subscriptions.paid_at end,
        updated_at = now();
end;
$$;

revoke execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status) from public, anon;
grant execute on function public.admin_set_driver_plan(uuid, public.plan_type, text, public.subscription_status) to authenticated, service_role;

create or replace function public.admin_confirm_subscription_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  perform public.confirm_payment(p_payment_id, null);
end;
$$;

revoke execute on function public.admin_confirm_subscription_payment(uuid) from public, anon;
grant execute on function public.admin_confirm_subscription_payment(uuid) to authenticated, service_role;
