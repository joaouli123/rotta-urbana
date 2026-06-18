-- ============================================================================
-- Rotta Urbana — 0022: admin app functions (callable from the mobile admin)
-- ----------------------------------------------------------------------------
-- The admin screens run inside the app (authenticated role), not the service
-- web. Every function below is SECURITY DEFINER and self-checks is_admin(), so
-- granting EXECUTE to `authenticated` is safe — non-admins are rejected.
-- ============================================================================
set search_path = public, extensions;

-- ─── 1. Re-allow the dashboard to read KPIs ─────────────────────────────────
-- 0015 locked admin_kpis() to service_role only. The in-app dashboard needs it;
-- the function already raises 'forbidden' for non-admin authenticated callers.
grant execute on function public.admin_kpis() to authenticated;

-- ─── 2. Active rides (live monitoring) ──────────────────────────────────────
create or replace function public.admin_active_rides(p_limit int default 100)
returns table (
  ride_id uuid, passenger_name text, driver_name text,
  origin_address text, destination_address text,
  status public.ride_status, ride_type public.ride_type,
  price numeric, requested_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select r.id, pp.full_name, dp.full_name,
         r.origin_address, r.destination_address,
         r.status, r.ride_type, r.price, r.requested_at
  from public.rides r
  join public.profiles pp on pp.id = r.passenger_id
  left join public.profiles dp on dp.id = r.driver_id
  where r.status in ('searching','driver_found','driver_on_way','driver_arrived','in_progress')
    and public.is_admin()
  order by r.requested_at desc
  limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.admin_active_rides to authenticated, service_role;

-- ─── 3. Driver list (profile + vehicle + subscription) ──────────────────────
create or replace function public.admin_list_drivers(p_limit int default 200)
returns table (
  driver_id uuid, full_name text, phone text, rating numeric,
  status public.driver_status, is_verified boolean,
  documents_status text, total_rides int,
  vehicle_model text, vehicle_plate text, vehicle_color text, vehicle_year int,
  subscription_status public.subscription_status, subscription_due date
)
language sql stable security definer set search_path = public
as $$
  select d.id, p.full_name, p.phone, p.rating,
         d.status, d.is_verified, d.documents_status::text, d.total_rides,
         v.model, v.plate::text, v.color, v.year,
         s.status, s.due_date
  from public.drivers d
  join public.profiles p on p.id = d.id
  left join lateral (
    select model, plate, color, year from public.vehicles
    where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  left join public.subscriptions s on s.driver_id = d.id
  where public.is_admin()
  order by d.is_verified asc, p.full_name asc
  limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.admin_list_drivers to authenticated, service_role;

-- ─── 4. Verify / reject a driver ────────────────────────────────────────────
create or replace function public.admin_verify_driver(p_driver_id uuid, p_approve boolean)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare v_driver public.drivers;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  update public.drivers
     set is_verified      = p_approve,
         documents_status = case when p_approve then 'approved' else 'rejected' end
   where id = p_driver_id
   returning * into v_driver;

  if not found then raise exception 'driver not found'; end if;

  -- Stamp any pending documents as reviewed.
  update public.driver_documents
     set verified = p_approve, reviewed_at = now()
   where driver_id = p_driver_id;

  return v_driver;
end;
$$;
grant execute on function public.admin_verify_driver to authenticated, service_role;

-- ─── 5. Payments list (with driver name) ────────────────────────────────────
create or replace function public.admin_list_payments(p_limit int default 100)
returns table (
  payment_id uuid, driver_name text, driver_phone text, amount numeric,
  status public.payment_status, method public.payment_method,
  paid_at timestamptz, created_at timestamptz,
  subscription_status public.subscription_status, subscription_due date
)
language sql stable security definer set search_path = public
as $$
  select pay.id, prof.full_name, prof.phone, pay.amount,
         pay.status, pay.method, pay.paid_at, pay.created_at,
         s.status, s.due_date
  from public.payments pay
  join public.profiles prof on prof.id = pay.driver_id
  left join public.subscriptions s on s.id = pay.subscription_id
  where public.is_admin()
  order by pay.created_at desc
  limit greatest(1, least(p_limit, 300));
$$;
grant execute on function public.admin_list_payments to authenticated, service_role;

-- ─── 6. Support tickets list + status update ────────────────────────────────
create or replace function public.admin_list_tickets(p_limit int default 100)
returns table (
  ticket_id uuid, user_name text, subject text, message text,
  status public.ticket_status, response text, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select t.id, p.full_name, t.subject, t.message, t.status, t.response, t.created_at
  from public.support_tickets t
  join public.profiles p on p.id = t.user_id
  where public.is_admin()
  order by
    case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end,
    t.created_at desc
  limit greatest(1, least(p_limit, 300));
$$;
grant execute on function public.admin_list_tickets to authenticated, service_role;

create or replace function public.admin_set_ticket_status(
  p_ticket_id uuid, p_status public.ticket_status, p_response text default null
)
returns public.support_tickets
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.support_tickets;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.support_tickets
     set status   = p_status,
         response = coalesce(p_response, response)
   where id = p_ticket_id
   returning * into v_ticket;
  if not found then raise exception 'ticket not found'; end if;
  return v_ticket;
end;
$$;
grant execute on function public.admin_set_ticket_status to authenticated, service_role;
