-- Rotta Urbana — Mercado Pago subscriptions / recurring billing.
-- The provider owns card/Pix/boleto collection; this schema stores a local,
-- auditable projection and makes webhook retries idempotent.
set search_path = public, extensions;

alter table public.subscriptions
  add column if not exists provider text not null default 'mercadopago',
  add column if not exists provider_subscription_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payment_method_id text,
  add column if not exists next_payment_at timestamptz,
  add column if not exists provider_last_synced_at timestamptz,
  add column if not exists provider_cancelled_at timestamptz;

create unique index if not exists subscriptions_provider_subscription_key
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists subscriptions_next_payment_idx
  on public.subscriptions (next_payment_at);

alter table public.payments
  add column if not exists provider_status text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_authorized_payment_id text,
  add column if not exists external_reference text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists payments_provider_authorized_payment_key
  on public.payments (provider, provider_authorized_payment_id)
  where provider_authorized_payment_id is not null;

create index if not exists payments_provider_subscription_idx
  on public.payments (provider_subscription_id);

comment on column public.subscriptions.provider_status is
  'Raw Mercado Pago preapproval status, kept for reconciliation and support.';
comment on column public.payments.provider_authorized_payment_id is
  'Mercado Pago recurring invoice id; webhook retries must update this row.';
