-- ============================================================================
-- Rotta Urbana — 0002: profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
-- The public face of every user. auth.users (managed by Supabase Auth) holds
-- the credentials/email; this table holds app data and the role. Populated
-- automatically by the handle_new_user() trigger (0007).
-- ============================================================================
set search_path = public, extensions;

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) between 2 and 120),
  email         citext,
  phone         text check (phone is null or phone ~ '^[0-9+()\-\s]{8,20}$'),
  role          public.user_role not null default 'passenger',
  avatar_url    text,
  rating        numeric(3,2) not null default 5.00 check (rating >= 0 and rating <= 5),
  total_ratings integer      not null default 0 check (total_ratings >= 0),
  is_active     boolean      not null default true,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

create unique index profiles_email_key on public.profiles (email) where email is not null;
create index        profiles_role_idx  on public.profiles (role);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS on, policies defined in 0008. No policy => deny all (safe default).
alter table public.profiles enable row level security;

comment on table public.profiles is 'Application profile for each auth.users row. Holds role and public info.';
