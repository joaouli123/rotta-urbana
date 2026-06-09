-- ============================================================================
-- Rotta Urbana — 0016: driver self-service plan switch (daily/monthly)
-- ----------------------------------------------------------------------------
-- Drivers can switch between daily/monthly billing; the amount is pulled from
-- the admin-configured app_settings (drivers can't set arbitrary prices).
-- ============================================================================
set search_path = public, extensions;

create or replace function public.set_subscription_plan(p_plan public.plan_type)
returns public.subscriptions
language plpgsql security definer set search_path = public
as $$
declare v_sub public.subscriptions; v_amount numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select case when p_plan = 'daily' then subscription_daily_amount else subscription_monthly_amount end
    into v_amount
  from public.app_settings where id = 1;

  update public.subscriptions
     set plan = p_plan, amount = coalesce(v_amount, amount)
   where driver_id = auth.uid()
   returning * into v_sub;
  if not found then raise exception 'not a driver'; end if;
  return v_sub;
end;
$$;

revoke execute on function public.set_subscription_plan(public.plan_type) from public, anon;
grant  execute on function public.set_subscription_plan(public.plan_type) to authenticated, service_role;
