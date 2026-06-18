-- ============================================================================
-- Rotta Urbana — 0027: close ride-mutation fraud vector + pin helper search_path
-- ----------------------------------------------------------------------------
-- FINDING (critical): table-level UPDATE/INSERT/DELETE on public.rides was
-- granted to `authenticated`, and the rides_update_* policies were column-blind
-- (only checked passenger_id/driver_id = auth.uid()). A client could bypass the
-- state-machine RPCs entirely and POST e.g.
--     supabase.from('rides').update({ fare_paid:true, price:0, status:'completed' })
-- — direct fare fraud / ride hijack. The app NEVER writes rides directly: every
-- mutation goes through SECURITY DEFINER RPCs (request_ride / accept_ride /
-- update_ride_status / cancel_ride / rate_ride), which run as owner and are
-- unaffected by this revoke. So we revoke direct write privileges and drop the
-- column-blind policies; SELECT stays for the app to read its own rides.
--
-- Also pins search_path on the two INVOKER helper functions that are called from
-- inside SECURITY DEFINER functions (defense against search_path injection).
-- ============================================================================
set search_path = public, extensions;

-- ─── 1. rides: writes only through RPCs (and service_role for the admin web) ──
revoke insert, update, delete on public.rides from authenticated;

-- These policies are now redundant AND misleading (they implied any-column
-- updates were allowed). Drop them so the intent is explicit and deny-by-default.
drop policy if exists rides_update_passenger on public.rides;
drop policy if exists rides_update_driver    on public.rides;
drop policy if exists rides_insert_own        on public.rides;
-- rides_select (read own / open requests) and rides_admin_all stay in place.

-- ─── 2. harden the INVOKER eligibility helpers (pin search_path) ─────────────
create or replace function public.vehicle_qualifies(
  p_year int, p_fipe numeric, p_type public.vehicle_type, p_seats int, p_color text,
  p_ride_type public.ride_type
) returns boolean
language sql stable
set search_path = public, extensions
as $$
  select case when not f.active then false else (
        coalesce(p_year, 0)  >= f.min_year
    and coalesce(p_fipe, 0)  >= f.min_fipe_value
    and coalesce(p_seats, 4) >= f.min_seats
    and (cardinality(f.allowed_vehicle_types) = 0 or p_type::text = any(f.allowed_vehicle_types))
    and (cardinality(f.require_colors) = 0 or lower(coalesce(p_color, '')) = any(f.require_colors))
  ) end
  from public.fare_config f
  where f.ride_type = p_ride_type;
$$;

create or replace function public.driver_categories(p_driver uuid)
returns public.ride_type[]
language sql stable
set search_path = public, extensions
as $$
  with v as (
    select year, fipe_value, type, seats, color
    from public.vehicles where driver_id = p_driver and is_primary
    order by created_at limit 1
  )
  select coalesce(array_agg(f.ride_type order by f.ride_type), '{}')
  from public.fare_config f, v
  where public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, f.ride_type);
$$;

comment on table public.rides is
  'Rides. Client writes are revoked — all mutations go through SECURITY DEFINER RPCs; admin web uses service_role.';
