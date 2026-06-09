-- ============================================================================
-- Rotta Urbana — 0007: RLS helper functions + auth/rating triggers
-- ----------------------------------------------------------------------------
-- These run AFTER all tables exist. All are SECURITY DEFINER with a pinned
-- search_path (prevents search_path hijacking — a real CVE class for definers).
-- ============================================================================
set search_path = public, extensions;

-- ─── RLS helpers ───────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_driver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.id
    where d.id = auth.uid() and p.role = 'driver' and d.is_verified = true
  );
$$;

comment on function public.is_admin()          is 'True when auth.uid() has the admin role. SECURITY DEFINER avoids RLS recursion.';
comment on function public.current_user_role() is 'Role of the currently authenticated user.';
comment on function public.is_active_driver()  is 'True when auth.uid() is a verified driver.';

-- ─── Signup handler: auth.users -> profiles (+ driver + subscription) ───────
-- Reads signup metadata (full_name, phone, role). SECURITY-CRITICAL: never
-- lets a user self-assign the admin role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role        public.user_role;
  v_name        text;
  v_phone       text;
  v_default_fee numeric(10,2) := 49.90;  -- default monthly driver subscription (R$)
begin
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'passenger');
  exception when others then
    v_role := 'passenger';
  end;
  if v_role = 'admin' then          -- admins are seeded manually, never self-served
    v_role := 'passenger';
  end if;

  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );
  if length(v_name) < 2 then v_name := 'Usuario'; end if;

  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and v_phone !~ '^[0-9+()\-\s]{8,20}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, email, phone, role)
  values (new.id, v_name, new.email, v_phone, v_role);

  if v_role = 'driver' then
    insert into public.drivers (id) values (new.id);
    insert into public.subscriptions (driver_id, status, amount, due_date)
    values (new.id, 'expired', v_default_fee, current_date);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Rating aggregation: ride_ratings -> profiles.rating ───────────────────
create or replace function public.apply_ride_rating()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ratee uuid;
begin
  select case when new.rater_role = 'passenger' then r.driver_id else r.passenger_id end
    into v_ratee
  from public.rides r
  where r.id = new.ride_id;

  if v_ratee is not null then
    update public.profiles
       set rating        = round(((rating * total_ratings) + new.stars)::numeric / (total_ratings + 1), 2),
           total_ratings = total_ratings + 1
     where id = v_ratee;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_ride_rating on public.ride_ratings;
create trigger trg_apply_ride_rating
  after insert on public.ride_ratings
  for each row execute function public.apply_ride_rating();

comment on function public.handle_new_user()  is 'Creates profile (+driver+subscription) on signup. Blocks self-assigned admin.';
comment on function public.apply_ride_rating() is 'Maintains incremental average rating on the rated party''s profile.';
