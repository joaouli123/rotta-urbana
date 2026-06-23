-- ============================================================================
-- Rotta Urbana — 0035: push the PASSENGER when a driver accepts the ride
-- ----------------------------------------------------------------------------
-- The app shows a local "Motorista a caminho!" notification when matched, but
-- that only works while the app is backgrounded (not fully killed). To alert the
-- passenger even with the app closed, send an Expo push when the ride flips from
-- 'searching' to 'driver_on_way'. Requires the passenger to have a push_token
-- registered (the app now registers one for passengers too).
-- ============================================================================
set search_path = public, extensions;

create or replace function public.notify_ride_accepted()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text;
begin
  if new.status = 'driver_on_way' and coalesce(old.status, '') = 'searching' then
    select push_token into v_token
    from public.profiles
    where id = new.passenger_id and push_token is not null;

    if v_token is not null then
      perform net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to', v_token,
          'title', 'Motorista a caminho! 🚗',
          'body', 'Seu motorista aceitou a corrida e está indo até você.',
          'sound', 'default',
          'priority', 'high',
          'channelId', 'ride-status',
          'data', jsonb_build_object('rideId', new.id, 'type', 'ride_accepted')
        )
      );
    end if;
  end if;
  return new;
exception when others then
  -- A push failure must never block the accept flow.
  return new;
end;
$$;

drop trigger if exists trg_notify_ride_accepted on public.rides;
create trigger trg_notify_ride_accepted
  after update on public.rides
  for each row execute function public.notify_ride_accepted();

comment on function public.notify_ride_accepted is
  'AFTER UPDATE on rides: Expo push to the passenger when a driver accepts (searching → driver_on_way).';
