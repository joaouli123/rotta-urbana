-- Leitura do escopo de um gerente para edição no painel administrativo.
set search_path = public, extensions;

create or replace function public.admin_manager_scope(p_profile_id uuid)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v_manager_id uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  select id into v_manager_id from public.managers where profile_id = p_profile_id;
  if v_manager_id is null then raise exception 'Gerente não encontrado'; end if;
  return json_build_object(
    'manager_type', (select manager_type from public.managers where id = v_manager_id),
    'cities', coalesce((select json_agg(mc.city order by mc.city) from public.manager_cities mc where mc.manager_id = v_manager_id and mc.is_active), '[]'::json),
    'driver_ids', coalesce((select json_agg(md.driver_id) from public.manager_drivers md where md.manager_id = v_manager_id and md.is_active), '[]'::json)
  );
end;
$$;
grant execute on function public.admin_manager_scope(uuid) to authenticated;
