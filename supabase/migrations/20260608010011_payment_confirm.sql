-- ============================================================================
-- Rotta Urbana — 0011: server-only payment confirmation
-- ----------------------------------------------------------------------------
-- Called by the Mercado Pago webhook (service_role) when a PIX charge is paid.
-- Marks the payment approved and rolls the subscription forward 30 days.
-- Idempotent: a second call for an already-approved payment is a no-op.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_provider_payment_id text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_driver uuid;
begin
  update public.payments
     set status = 'approved',
         paid_at = now(),
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
   where id = p_payment_id and status <> 'approved'
   returning driver_id into v_driver;

  if v_driver is null then
    return;  -- not found, or already approved (idempotent)
  end if;

  update public.subscriptions
     set status   = 'active',
         due_date = (greatest(current_date, due_date) + interval '30 days')::date,
         paid_at  = now()
   where driver_id = v_driver;
end;
$$;

-- SERVER ONLY: drivers must never self-confirm their own payment.
revoke execute on function public.confirm_payment(uuid, text) from public;
grant  execute on function public.confirm_payment(uuid, text) to service_role;

comment on function public.confirm_payment is 'Service-role only: marks a PIX payment approved and extends the subscription.';
