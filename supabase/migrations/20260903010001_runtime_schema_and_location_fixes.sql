-- Rotta Urbana — runtime fixes found in the driver app.
-- Keeps the recurring-subscription projection in sync with the server payload
-- and normalizes unavailable GPS headings before they hit the database check.
set search_path = public, extensions;

alter table public.subscriptions
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

comment on column public.subscriptions.provider_metadata is
  'Safe Mercado Pago subscription metadata used to resume and reconcile checkout.';

create or replace function public.update_driver_location(
  p_lat numeric, p_lng numeric, p_heading numeric default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_heading numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- An expired driver may keep sending location only long enough to finish
  -- the ride already accepted before the expiry.
  if not public.subscription_is_current(auth.uid()) and not exists (
    select 1 from public.rides
     where driver_id = auth.uid()
       and status in ('driver_on_way', 'driver_arrived', 'in_progress')
  ) then
    raise exception 'subscription inactive or expired';
  end if;

  -- Expo uses negative values (commonly -1) when no compass heading exists.
  -- Store NULL for unavailable/out-of-range values to satisfy drivers_heading_check.
  v_heading := case
    when p_heading is null or p_heading < 0 or p_heading >= 360 then null
    else p_heading
  end;

  update public.drivers
     set current_location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
         location_updated_at = now(), heading = v_heading, updated_at = now()
   where id = auth.uid();
  if not found then raise exception 'not a driver'; end if;
end;
$$;

grant execute on function public.update_driver_location(numeric, numeric, numeric)
  to authenticated, service_role;
