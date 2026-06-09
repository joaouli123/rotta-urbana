-- ============================================================================
-- Rotta Urbana — 0004: subscriptions, payments
-- ----------------------------------------------------------------------------
-- Business model: drivers pay a recurring subscription (assinatura) to operate.
--  * subscriptions = current subscription state, one row per driver.
--  * payments      = immutable ledger of every charge (PIX via Mercado Pago).
-- ============================================================================
set search_path = public, extensions;

-- ─── subscriptions (current state, 1 per driver) ───────────────────────────
create table public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null unique references public.drivers(id) on delete cascade,
  status     public.subscription_status not null default 'expired',
  amount     numeric(10,2) not null check (amount >= 0),
  due_date   date not null,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_status_idx   on public.subscriptions (status);
create index subscriptions_due_date_idx on public.subscriptions (due_date);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- ─── payments (ledger) ─────────────────────────────────────────────────────
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  subscription_id     uuid references public.subscriptions(id) on delete set null,
  amount              numeric(10,2) not null check (amount > 0),
  method              public.payment_method not null default 'pix',
  status              public.payment_status not null default 'pending',
  provider            text not null default 'mercadopago',
  provider_payment_id text,
  pix_qr_code         text,        -- copia-e-cola
  pix_qr_code_base64  text,        -- QR image (base64 png)
  pix_ticket_url      text,
  expires_at          timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index        payments_driver_idx      on public.payments (driver_id);
create index        payments_status_idx      on public.payments (status);
create index        payments_created_idx     on public.payments (created_at desc);
-- A provider payment id must map to exactly one row (idempotent webhooks).
create unique index payments_provider_id_key on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

comment on table public.subscriptions is 'Current subscription state per driver (one row each).';
comment on table public.payments      is 'Immutable ledger of subscription charges. Unique (provider, provider_payment_id) makes webhooks idempotent.';
