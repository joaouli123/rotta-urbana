-- ============================================================================
-- Rotta Urbana — 0033: louder driver push (custom-sound channel rides-v2)
-- ----------------------------------------------------------------------------
-- The driver alert must be LOUD even when the app is fully closed — in that
-- case only the system notification sound plays (the in-app expo-audio loop
-- can't run). Android caches a channel's sound after first creation, so we move
-- to a fresh channel id ('rides-v2') whose sound is the bundled loud alert
-- (request.wav, bundled via the expo-notifications `sounds` config). Only the
-- channelId changes here; the eligibility logic is unchanged.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.notify_new_ride()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare v_tokens text[];
begin
  if new.status <> 'searching' then return new; end if;

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
      'channelId', 'rides-v2',
      'data', jsonb_build_object('rideId', new.id, 'type', 'new_ride')
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
