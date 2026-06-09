-- ============================================================================
-- Rotta Urbana — 0020: in-app chat (ride_messages)
-- ----------------------------------------------------------------------------
-- Real in-app chat between the passenger and the assigned driver of a ride.
-- RLS: only the two participants (or admin) can read/send. Realtime-enabled.
-- ============================================================================
set search_path = public, extensions;

create table public.ride_messages (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index ride_messages_ride_idx on public.ride_messages (ride_id, created_at);

alter table public.ride_messages enable row level security;

create policy ride_messages_select on public.ride_messages for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rides r
    where r.id = ride_messages.ride_id and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);

create policy ride_messages_insert on public.ride_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.rides r
    where r.id = ride_messages.ride_id and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  )
);

grant select, insert on public.ride_messages to authenticated;
grant all          on public.ride_messages to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_messages') then
    alter publication supabase_realtime add table public.ride_messages;
  end if;
end $$;
