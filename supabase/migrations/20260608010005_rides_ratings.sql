-- ============================================================================
-- Rotta Urbana — 0005: rides, ride_ratings
-- ----------------------------------------------------------------------------
-- The core trip record. Origin/destination are PostGIS points so we can run
-- distance math and nearest-driver matching directly in SQL.
-- ============================================================================
set search_path = public, extensions;

create table public.rides (
  id                  uuid primary key default gen_random_uuid(),
  passenger_id        uuid not null references public.profiles(id) on delete cascade,
  driver_id           uuid references public.drivers(id) on delete set null,
  status              public.ride_status not null default 'searching',
  ride_type           public.ride_type   not null default 'economy',
  origin              geography(Point, 4326) not null,
  origin_address      text not null,
  destination         geography(Point, 4326) not null,
  destination_address text not null,
  price               numeric(10,2) check (price is null or price >= 0),
  distance_km         numeric(10,2) check (distance_km is null or distance_km >= 0),
  duration_min        integer       check (duration_min is null or duration_min >= 0),
  payment_method      public.payment_method not null default 'pix',
  cancel_reason       text,
  cancelled_by        public.user_role,
  requested_at        timestamptz not null default now(),
  accepted_at         timestamptz,
  arrived_at          timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index rides_passenger_idx on public.rides (passenger_id);
create index rides_driver_idx    on public.rides (driver_id);
create index rides_status_idx    on public.rides (status);
create index rides_requested_idx on public.rides (requested_at desc);
-- Hot path: drivers polling for open requests.
create index rides_searching_idx on public.rides (requested_at) where status = 'searching';

create trigger trg_rides_updated_at
  before update on public.rides
  for each row execute function public.set_updated_at();

alter table public.rides enable row level security;

-- ─── ride_ratings ──────────────────────────────────────────────────────────
-- Either side can rate the other, once per ride.
create table public.ride_ratings (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  rater_id   uuid not null references public.profiles(id) on delete cascade,
  rater_role public.user_role not null,
  stars      integer not null check (stars between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  unique (ride_id, rater_id)
);

create index ride_ratings_ride_idx on public.ride_ratings (ride_id);

alter table public.ride_ratings enable row level security;

comment on table public.rides        is 'Trip records with PostGIS origin/destination. Lifecycle tracked via ride_status + timestamps.';
comment on table public.ride_ratings is 'Per-ride ratings; one per rater. Feeds profiles.rating via trigger (0009).';
