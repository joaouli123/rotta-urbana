-- ============================================================================
-- Rotta Urbana — 0029: mark a completed ride's fare as paid (cash/pix-direto)
-- ----------------------------------------------------------------------------
-- Until now rides.fare_paid had no writer, so the admin 'Pago' column was always
-- 'pending'. Direct writes to rides are (correctly) revoked, so settlement goes
-- through this SECURITY DEFINER RPC: only the ride's assigned driver (confirming
-- they received the money) or an admin can flip it, and only for a completed
-- ride. The admin web panel uses service_role directly, so it bypasses this.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.mark_fare_paid(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public
as $$
declare v_ride public.rides;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.rides
     set fare_paid = true
   where id = p_ride_id
     and status = 'completed'
     and (driver_id = auth.uid() or public.is_admin())
   returning * into v_ride;
  if not found then raise exception 'corrida nao encontrada, nao concluida, ou nao e sua'; end if;
  return v_ride;
end;
$$;

grant  execute on function public.mark_fare_paid(uuid) to authenticated, service_role;
revoke execute on function public.mark_fare_paid(uuid) from anon;

comment on function public.mark_fare_paid is
  'Marks a completed ride as paid. Caller must be the assigned driver or an admin.';
