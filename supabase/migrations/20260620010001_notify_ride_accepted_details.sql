-- ============================================================================
-- Rotta Urbana — 0036: include driver name + vehicle + plate in the accept push
-- ----------------------------------------------------------------------------
-- The "Motorista a caminho" push (sent when the app is closed) was generic. Make
-- it Uber-like: show the driver's name, car model and plate right in the push.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.notify_ride_accepted()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_token text;
  v_name  text;
  v_veh   text;
  v_plate text;
  v_body  text;
begin
  if new.status = 'driver_on_way' and coalesce(old.status, '') = 'searching' then
    select push_token into v_token
    from public.profiles
    where id = new.passenger_id and push_token is not null;

    if v_token is not null then
      select full_name into v_name from public.profiles where id = new.driver_id;
      select model, plate into v_veh, v_plate
      from public.vehicles
      where driver_id = new.driver_id and is_primary
      order by created_at limit 1;

      v_body := coalesce(v_name, 'Seu motorista') || ' está a caminho'
        || case when v_veh is not null then ' • ' || v_veh else '' end
        || case when v_plate is not null then ' • ' || v_plate else '' end;

      perform net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to', v_token,
          'title', 'Motorista a caminho! 🚗',
          'body', v_body,
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
  return new;
end;
$$;
