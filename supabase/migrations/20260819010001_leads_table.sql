-- Rotta Urbana — leads table for the landing page contact form.
-- railway-admin/server.js saveLead()/getLeads() already write here via the
-- service-role client; without this table every insert silently fails and
-- falls back to an in-memory array that is lost on every server restart,
-- which is why the admin panel showed 0 leads despite campaign traffic.
set search_path = public, extensions;

create table if not exists public.leads (
  id         text primary key,
  created_at timestamptz not null default now(),
  name       text not null default '',
  email      text not null default '',
  phone      text default '',
  subject    text not null default 'Geral',
  message    text default '',
  status     text not null default 'novo'
);

create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

comment on table public.leads is
  'Contact-form leads captured from the public landing page; written only by the railway-admin service-role client.';
