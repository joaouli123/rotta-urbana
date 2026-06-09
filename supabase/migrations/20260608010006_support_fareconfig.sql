-- ============================================================================
-- Rotta Urbana — 0006: fare_config, support_tickets
-- ----------------------------------------------------------------------------
-- fare_config    = pricing parameters per ride type (read by fare estimator).
-- support_tickets = in-app help requests from passengers/drivers.
-- ============================================================================
set search_path = public, extensions;

create table public.fare_config (
  ride_type  public.ride_type primary key,
  base_fare  numeric(10,2) not null check (base_fare >= 0),
  per_km     numeric(10,2) not null check (per_km    >= 0),
  per_min    numeric(10,2) not null check (per_min   >= 0),
  min_fare   numeric(10,2) not null check (min_fare  >= 0),
  updated_at timestamptz   not null default now()
);

create trigger trg_fare_config_updated_at
  before update on public.fare_config
  for each row execute function public.set_updated_at();

alter table public.fare_config enable row level security;

create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  subject    text not null check (length(btrim(subject)) > 0),
  message    text not null check (length(btrim(message)) > 0),
  status     public.ticket_status not null default 'open',
  response   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_user_idx   on public.support_tickets (user_id);
create index support_tickets_status_idx on public.support_tickets (status);

create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;

comment on table public.fare_config     is 'Pricing parameters per ride type; used by the fare estimator RPC.';
comment on table public.support_tickets is 'In-app support tickets opened by users.';
