-- ============================================================================
-- Rotta Urbana — 0003: drivers, vehicles, driver_documents
-- ----------------------------------------------------------------------------
-- A driver is a profile (role='driver') with extra operational state:
-- live geolocation (PostGIS), verification status, vehicle and documents.
-- ============================================================================
set search_path = public, extensions;

-- ─── drivers ───────────────────────────────────────────────────────────────
create table public.drivers (
  id                  uuid primary key references public.profiles(id) on delete cascade,
  status              public.driver_status   not null default 'offline',
  is_verified         boolean                not null default false,
  documents_status    public.document_status not null default 'pending',
  current_location    geography(Point, 4326),
  location_updated_at timestamptz,
  heading             numeric(5,2) check (heading is null or (heading >= 0 and heading < 360)),
  total_rides         integer      not null default 0 check (total_rides >= 0),
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

create index drivers_status_idx   on public.drivers (status);
create index drivers_location_gix on public.drivers using gist (current_location);
create index drivers_verified_idx on public.drivers (is_verified) where is_verified = true;

create trigger trg_drivers_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

alter table public.drivers enable row level security;

-- ─── vehicles ──────────────────────────────────────────────────────────────
create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  model       text not null check (length(btrim(model)) > 0),
  plate       citext not null,
  year        integer not null check (year between 1980 and 2100),
  color       text not null check (length(btrim(color)) > 0),
  type        public.vehicle_type not null default 'sedan',
  is_primary  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index vehicles_plate_key  on public.vehicles (plate);
create index        vehicles_driver_idx on public.vehicles (driver_id);

create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;

-- ─── driver_documents ──────────────────────────────────────────────────────
-- file_path points at an object in the private `driver-docs` storage bucket.
create table public.driver_documents (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  doc_type    public.document_type not null,
  file_path   text not null,
  verified    boolean not null default false,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (driver_id, doc_type)
);

create index driver_documents_driver_idx on public.driver_documents (driver_id);

alter table public.driver_documents enable row level security;

comment on table public.drivers          is 'Operational state for users with role=driver, including live PostGIS location.';
comment on column public.drivers.current_location is 'Live driver position as geography(Point,4326); GiST-indexed for nearest-neighbour search.';
comment on table public.vehicles         is 'Vehicles owned by a driver. plate is unique (case-insensitive).';
comment on table public.driver_documents is 'Uploaded driver documents (CNH/RG/vehicle/selfie) stored in private bucket driver-docs.';
