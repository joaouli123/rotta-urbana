-- Confirm a one-time daily pass atomically with its payment ledger entry.
-- The driver's current plan remains untouched while Checkout Pro is pending.
set search_path = public, extensions;

-- Keep the profile's selected plan in sync only once the subscription is
-- actually active; a pending checkout must not change the driver's plan.
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
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_active_subscription_plan_to_driver() from public, anon, authenticated;

drop trigger if exists trg_sync_active_subscription_plan_to_driver on public.subscriptions;
create trigger trg_sync_active_subscription_plan_to_driver
  after insert or update of status, plan, plan_segment on public.subscriptions
  for each row execute function public.sync_active_subscription_plan_to_driver();

create or replace function public.confirm_daily_plan_payment(
  p_payment_id uuid,
  p_provider_payment_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payment public.payments;
  v_subscription public.subscriptions;
  v_segment text;
begin
  select pay.*
    into v_payment
    from public.payments pay
   where pay.id = p_payment_id
   for update;
  if not found then raise exception 'payment not found'; end if;
  if v_payment.provider is distinct from 'mercadopago'
     or v_payment.provider_metadata ->> 'billing_model' is distinct from 'one_time_daily'
     or v_payment.provider_metadata ->> 'plan' is distinct from 'daily' then
    raise exception 'payment is not a daily one-time checkout';
  end if;
  if v_payment.status = 'approved' then return; end if;
  if v_payment.status <> 'pending' then
    raise exception 'payment is not awaiting confirmation';
  end if;

  select sub.*
    into v_subscription
    from public.subscriptions sub
   where sub.id = v_payment.subscription_id
     and sub.driver_id = v_payment.driver_id
   for update;
  if not found then raise exception 'subscription not found'; end if;

  v_segment := coalesce(v_payment.provider_metadata ->> 'plan_segment', 'economy');
  if v_segment not in ('moto', 'economy', 'comfort', 'premium') then
    raise exception 'invalid plan segment';
  end if;

  update public.payments
     set status = 'approved',
         paid_at = coalesce(paid_at, now()),
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         provider_status = 'approved'
   where id = p_payment_id;

  update public.subscriptions
     set plan = 'daily',
         plan_segment = v_segment,
         amount = v_payment.amount,
         status = 'active',
         due_date = case
           when v_subscription.plan = 'daily'
             and v_subscription.status = 'active'
             and v_subscription.due_date >= current_date
             then v_subscription.due_date + 1
           else current_date + 1
         end,
         paid_at = now(),
         provider = 'mercadopago',
         provider_subscription_id = null,
         provider_status = 'one_time_approved',
         provider_payment_method_id = v_payment.method::text,
         next_payment_at = null,
         provider_last_synced_at = now(),
         provider_cancelled_at = case
           when v_subscription.provider_subscription_id is not null then now()
           else v_subscription.provider_cancelled_at
         end,
         provider_metadata = coalesce(v_subscription.provider_metadata, '{}'::jsonb)
           || jsonb_build_object('billing_model', 'one_time_daily'),
         updated_at = now()
   where id = v_subscription.id;
end;
$$;

revoke execute on function public.confirm_daily_plan_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_daily_plan_payment(uuid, text) to service_role;
