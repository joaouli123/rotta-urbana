-- ============================================================================
-- Rotta Urbana — 0032: push notifications for new ride requests (drivers)
-- ----------------------------------------------------------------------------
-- Problem: drivers only saw ride requests via realtime/poll while the app was
-- open + online. With the app backgrounded/closed they got nothing. Fix: send an
-- Expo push notification when a ride is created, to every eligible ONLINE
-- verified driver that has a registered push token — so the phone rings even
-- with the app closed. Sending is done straight from Postgres via pg_net (async,
-- never blocks ride creation; failures are swallowed).
-- ============================================================================
set search_path = public, extensions;

create extension if not exists pg_net;

-- Each user stores their Expo push token (set from the app after permission).
alter table public.profiles add column if not exists push_token text;

-- ─── client registers / clears its push token ──────────────────────────────
create or replace function public.set_push_token(p_token text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.profiles set push_token = nullif(btrim(p_token), '') where id = auth.uid();
end;
$$;

grant  execute on function public.set_push_token(text) to authenticated, service_role;
revoke execute on function public.set_push_token(text) from public, anon;

-- ─── on new ride → push the eligible online drivers ────────────────────────
create or replace function public.notify_new_ride()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare v_tokens text[];
begin
  if new.status <> 'searching' then return new; end if;

  -- Online, verified drivers whose primary vehicle qualifies for the category,
  -- respecting the female-only preference, that have a push token registered.
  select array_agg(distinct p.push_token) into v_tokens
  from public.drivers d
  join public.profiles p on p.id = d.id
  join lateral (
    select year, fipe_value, type, seats, color
    from public.vehicles where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  where d.status = 'online'
    and d.is_verified
    and p.push_token is not null
    and public.vehicle_qualifies(v.year, v.fipe_value, v.type, v.seats, v.color, new.ride_type)
    and (not new.requires_female_driver or p.gender = 'female');

  if v_tokens is null or array_length(v_tokens, 1) is null then return new; end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', to_jsonb(v_tokens),
      'title', 'Nova corrida!',
      'body', 'Um passageiro esta te chamando. Toque para ver os detalhes.',
      'sound', 'default',
      'priority', 'high',
      'channelId', 'rides',
      'data', jsonb_build_object('rideId', new.id, 'type', 'new_ride')
    )
  );
  return new;
exception when others then
  -- A push failure must NEVER block ride creation.
  return new;
end;
$$;

drop trigger if exists trg_notify_new_ride on public.rides;
create trigger trg_notify_new_ride
  after insert on public.rides
  for each row execute function public.notify_new_ride();

comment on function public.notify_new_ride is
  'AFTER INSERT on rides: Expo push to eligible online verified drivers (pg_net).';
comment on column public.profiles.push_token is 'Expo push token for ride/notification alerts.';
