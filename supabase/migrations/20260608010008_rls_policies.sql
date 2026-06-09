-- ============================================================================
-- Rotta Urbana — 0008: Row Level Security policies + role grants
-- ----------------------------------------------------------------------------
-- Defense-in-depth: every table already has RLS enabled (deny-all). These
-- policies open the *minimum* each role needs. Privileged server work (payment
-- webhooks, matching) runs as service_role, which bypasses RLS by design.
--
-- Hardening highlights:
--  * Users cannot change their own role (anti privilege-escalation).
--  * Drivers cannot self-verify or self-approve documents.
--  * Passengers/drivers only see each other through a shared ride.
-- ============================================================================
set search_path = public, extensions;

-- Table privileges. RLS still gates *rows*; these gate the *operation*.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ─── profiles ──────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
    where (r.passenger_id = auth.uid() and r.driver_id = profiles.id)
       or (r.driver_id   = auth.uid() and r.passenger_id = profiles.id)
  )
);

create policy profiles_update_own on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());  -- role frozen

create policy profiles_admin_all on public.profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── drivers ───────────────────────────────────────────────────────────────
create policy drivers_select on public.drivers for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.driver_id = drivers.id
      and r.passenger_id = auth.uid()
      and r.status in ('driver_found','driver_on_way','driver_arrived','in_progress')
  )
);

create policy drivers_update_own on public.drivers for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  -- driver may move/go online, but cannot self-verify or self-approve docs:
  and is_verified      = (select d.is_verified      from public.drivers d where d.id = auth.uid())
  and documents_status = (select d.documents_status from public.drivers d where d.id = auth.uid())
);

create policy drivers_admin_all on public.drivers for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── vehicles ──────────────────────────────────────────────────────────────
create policy vehicles_select on public.vehicles for select to authenticated
using (
  driver_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.driver_id = vehicles.driver_id
      and r.passenger_id = auth.uid()
      and r.status in ('driver_found','driver_on_way','driver_arrived','in_progress')
  )
);

create policy vehicles_write_own on public.vehicles for all to authenticated
using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy vehicles_admin_all on public.vehicles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── driver_documents ──────────────────────────────────────────────────────
create policy docs_select_own on public.driver_documents for select to authenticated
using (driver_id = auth.uid() or public.is_admin());

create policy docs_insert_own on public.driver_documents for insert to authenticated
with check (driver_id = auth.uid() and verified = false);

create policy docs_update_own on public.driver_documents for update to authenticated
using (driver_id = auth.uid())
with check (driver_id = auth.uid() and verified = false);  -- only admin flips verified

create policy docs_admin_all on public.driver_documents for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── subscriptions (driver reads; only admin/service_role writes) ──────────
create policy subs_select_own on public.subscriptions for select to authenticated
using (driver_id = auth.uid() or public.is_admin());

create policy subs_admin_all on public.subscriptions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── payments (driver reads own; writes via service_role/admin) ────────────
create policy payments_select_own on public.payments for select to authenticated
using (driver_id = auth.uid() or public.is_admin());

create policy payments_admin_all on public.payments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── rides ─────────────────────────────────────────────────────────────────
create policy rides_select on public.rides for select to authenticated
using (
  passenger_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
  -- verified drivers can see open requests to accept them:
  or (status = 'searching' and public.is_active_driver())
);

create policy rides_insert_own on public.rides for insert to authenticated
with check (passenger_id = auth.uid() and status = 'searching');

create policy rides_update_passenger on public.rides for update to authenticated
using (passenger_id = auth.uid())
with check (passenger_id = auth.uid());

create policy rides_update_driver on public.rides for update to authenticated
using (driver_id = auth.uid())
with check (driver_id = auth.uid());

create policy rides_admin_all on public.rides for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── ride_ratings ──────────────────────────────────────────────────────────
create policy ratings_select on public.ride_ratings for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.id = ride_ratings.ride_id
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);

create policy ratings_insert on public.ride_ratings for insert to authenticated
with check (
  rater_id = auth.uid()
  and exists (
    select 1 from public.rides r
    where r.id = ride_ratings.ride_id
      and r.status = 'completed'
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);

-- ─── fare_config (everyone authenticated reads; admin writes) ──────────────
create policy fare_select on public.fare_config for select to authenticated using (true);
create policy fare_admin  on public.fare_config for all    to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── support_tickets ───────────────────────────────────────────────────────
create policy tickets_select_own on public.support_tickets for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy tickets_insert_own on public.support_tickets for insert to authenticated
with check (user_id = auth.uid());

create policy tickets_admin_all on public.support_tickets for all to authenticated
using (public.is_admin()) with check (public.is_admin());
