-- Inclui a cidade operacional no catálogo que o administrador usa para
-- selecionar motoristas e formar grupos gerenciais.
set search_path = public, extensions;

drop function if exists public.admin_list_drivers(int);

create or replace function public.admin_list_drivers(p_limit int default 200)
returns table (
  driver_id uuid, full_name text, phone text, rating numeric,
  status public.driver_status, is_verified boolean,
  documents_status text, total_rides int,
  vehicle_model text, vehicle_plate text, vehicle_color text, vehicle_year int,
  subscription_status public.subscription_status, subscription_due date,
  operating_city text, operating_state text
)
language sql stable security definer set search_path = public
as $$
  select d.id, p.full_name, p.phone, p.rating,
         d.status, d.is_verified, d.documents_status::text, d.total_rides,
         v.model, v.plate::text, v.color, v.year,
         s.status, s.due_date, d.operating_city, d.operating_state
  from public.drivers d
  join public.profiles p on p.id = d.id
  left join lateral (
    select model, plate, color, year from public.vehicles
    where driver_id = d.id and is_primary order by created_at limit 1
  ) v on true
  left join lateral (
    select status, due_date from public.subscriptions
    where driver_id = d.id order by due_date desc limit 1
  ) s on true
  where public.is_admin()
  order by d.is_verified asc, p.full_name asc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.admin_list_drivers(int) to authenticated, service_role;
