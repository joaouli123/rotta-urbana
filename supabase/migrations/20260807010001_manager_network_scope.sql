-- ============================================================================
-- Rotta Urbana — rede de gerentes
--
-- Expande o primeiro modelo de gerente para suportar:
--   * gerente local e gerente de rede;
--   * múltiplas cidades por gerente;
--   * vínculos diretos com motoristas;
--   * cidade operacional do motorista;
--   * KPIs, relatórios e consultas sempre limitados ao escopo do gerente;
--   * restauração correta do perfil original ao remover um gerente.
--
-- A criação de credenciais é feita pela Edge Function create-manager, que usa
-- a API administrativa do Supabase somente no servidor.
-- ============================================================================
set search_path = public, extensions;

-- 1. Perfil operacional do motorista usado na vinculação por cidade.
alter table public.drivers
  add column if not exists operating_city text,
  add column if not exists operating_state text;

create index if not exists drivers_operating_city_idx
  on public.drivers (lower(btrim(operating_city)))
  where operating_city is not null;

-- 2. Evolução do cadastro de gerentes existente.
alter table public.managers
  add column if not exists manager_type text not null default 'city',
  add column if not exists previous_role text not null default 'passenger';

alter table public.managers
  drop constraint if exists managers_manager_type_check;
alter table public.managers
  add constraint managers_manager_type_check
  check (manager_type in ('city', 'network'));

-- Gerentes criados antes desta migração que eram motoristas devem voltar a ser
-- motoristas caso o acesso de gerente seja removido.
update public.managers m
set previous_role = 'driver'
where m.previous_role = 'passenger'
  and exists (select 1 from public.drivers d where d.id = m.profile_id);

-- 3. Cidades vinculadas ao gerente. A coluna city da tabela managers é mantida
-- para compatibilidade com a primeira versão e recebe a primeira cidade.
create table if not exists public.manager_cities (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  city        text not null check (length(btrim(city)) > 0),
  state       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (manager_id, city)
);

create index if not exists manager_cities_city_idx
  on public.manager_cities (lower(btrim(city)));

alter table public.manager_cities enable row level security;

drop policy if exists manager_cities_admin_all on public.manager_cities;
create policy manager_cities_admin_all on public.manager_cities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists manager_cities_manager_read on public.manager_cities;
create policy manager_cities_manager_read on public.manager_cities
  for select to authenticated
  using (exists (
    select 1 from public.managers m
    where m.id = manager_cities.manager_id
      and m.profile_id = auth.uid()
      and m.is_active = true
  ));

insert into public.manager_cities (manager_id, city)
select m.id, m.city
from public.managers m
where length(btrim(coalesce(m.city, ''))) > 0
  and not exists (
    select 1 from public.manager_cities mc
    where mc.manager_id = m.id
  );

-- 4. Vínculos diretos gerente → motorista.
create table if not exists public.manager_drivers (
  id           uuid primary key default gen_random_uuid(),
  manager_id   uuid not null references public.managers(id) on delete cascade,
  driver_id    uuid not null references public.drivers(id) on delete cascade,
  assigned_by  uuid references public.profiles(id),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (manager_id, driver_id)
);

create index if not exists manager_drivers_driver_idx on public.manager_drivers (driver_id);
create index if not exists manager_drivers_manager_idx on public.manager_drivers (manager_id);

alter table public.manager_drivers enable row level security;

drop policy if exists manager_drivers_admin_all on public.manager_drivers;
create policy manager_drivers_admin_all on public.manager_drivers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists manager_drivers_manager_read on public.manager_drivers;
create policy manager_drivers_manager_read on public.manager_drivers
  for select to authenticated
  using (exists (
    select 1 from public.managers m
    where m.id = manager_drivers.manager_id
      and m.profile_id = auth.uid()
      and m.is_active = true
  ));

-- 5. Auditoria mínima das mudanças administrativas de acesso.
create table if not exists public.manager_audit_log (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid references public.managers(id) on delete set null,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists manager_audit_manager_idx on public.manager_audit_log (manager_id, created_at desc);
alter table public.manager_audit_log enable row level security;

drop policy if exists manager_audit_admin_read on public.manager_audit_log;
create policy manager_audit_admin_read on public.manager_audit_log
  for select to authenticated using (public.is_admin());

-- 6. Helpers de escopo. São SECURITY DEFINER para não depender de combinações
-- frágeis de RLS ao calcular uma métrica agregada.
create or replace function public.is_manager_network()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.managers m
    where m.profile_id = auth.uid()
      and m.manager_type = 'network'
      and m.is_active = true
  )
$$;

grant execute on function public.is_manager_network() to authenticated;

create or replace function public.manager_has_driver_access(p_driver_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select public.is_manager_network()
      or exists (
        select 1
        from public.manager_drivers md
        join public.managers m on m.id = md.manager_id
        where m.profile_id = auth.uid()
          and m.is_active = true
          and md.driver_id = p_driver_id
          and md.is_active = true
      )
      or exists (
        select 1
        from public.manager_cities mc
        join public.managers m on m.id = mc.manager_id
        join public.drivers d on d.id = p_driver_id
        left join public.profiles p on p.id = d.id
        where m.profile_id = auth.uid()
          and m.is_active = true
          and mc.is_active = true
          and lower(btrim(mc.city)) = lower(btrim(coalesce(d.operating_city, p.address_city, '')))
      )
$$;

grant execute on function public.manager_has_driver_access(uuid) to authenticated;

create or replace function public.manager_has_ride_access(p_ride_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.rides r
    where r.id = p_ride_id
      and r.driver_id is not null
      and public.manager_has_driver_access(r.driver_id)
  )
$$;

grant execute on function public.manager_has_ride_access(uuid) to authenticated;

-- 7. RLS de leitura para tabelas consultadas diretamente pela área gerencial.
drop policy if exists managers_select_drivers on public.drivers;
create policy managers_select_drivers on public.drivers
  for select to authenticated
  using (public.manager_has_driver_access(id));

drop policy if exists managers_select_vehicles on public.vehicles;
create policy managers_select_vehicles on public.vehicles
  for select to authenticated
  using (public.manager_has_driver_access(driver_id));

drop policy if exists managers_select_rides on public.rides;
create policy managers_select_rides on public.rides
  for select to authenticated
  using (public.manager_has_ride_access(id));

drop policy if exists managers_select_tickets on public.support_tickets;
create policy managers_select_tickets on public.support_tickets
  for select to authenticated
  using (exists (
    select 1 from public.drivers d
    where d.id = support_tickets.user_id
      and public.manager_has_driver_access(d.id)
  ));

drop policy if exists managers_select_profiles on public.profiles;
create policy managers_select_profiles on public.profiles
  for select to authenticated
  using (public.manager_has_driver_access(id));

-- 8. Lista administrativa completa, com cidades e quantidade de motoristas.
create or replace function public.admin_list_managers()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json)
    from (
      select
        m.id as manager_id,
        m.profile_id,
        p.full_name,
        p.email,
        p.phone,
        m.manager_type,
        m.is_active,
        m.created_at,
        coalesce((
          select json_agg(json_build_object('city', mc.city, 'state', mc.state) order by mc.city)
          from public.manager_cities mc
          where mc.manager_id = m.id and mc.is_active = true
        ), '[]'::json) as cities,
        (select count(*) from public.manager_drivers md
         where md.manager_id = m.id and md.is_active = true) as explicit_driver_count,
        a.full_name as assigned_by_name
      from public.managers m
      join public.profiles p on p.id = m.profile_id
      left join public.profiles a on a.id = m.assigned_by
    ) r
  );
end;
$$;

grant execute on function public.admin_list_managers() to authenticated;

-- 9. Configuração atômica de gerente existente. O cliente envia apenas IDs;
-- toda a autorização e a consistência são verificadas aqui.
create or replace function public.admin_configure_manager(
  p_profile_id uuid,
  p_manager_type text,
  p_cities jsonb default '[]'::jsonb,
  p_driver_ids jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_manager_id uuid;
  v_previous_role text;
  v_first_city text;
  v_city text;
  v_driver_id uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  if p_manager_type not in ('city', 'network') then raise exception 'Tipo de gerente inválido'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Usuário não encontrado';
  end if;
  if exists (select 1 from public.profiles where id = p_profile_id and role = 'admin') then
    raise exception 'Administrador não pode ser convertido em gerente';
  end if;

  select coalesce(m.previous_role,
                  case when exists (select 1 from public.drivers d where d.id = p.id)
                       then 'driver' else p.role::text end)
    into v_previous_role
  from public.profiles p
  left join public.managers m on m.profile_id = p.id
  where p.id = p_profile_id;

  select nullif(btrim(value), '') into v_first_city
  from jsonb_array_elements_text(coalesce(p_cities, '[]'::jsonb))
  limit 1;

  insert into public.managers (profile_id, city, assigned_by, manager_type, previous_role, is_active)
  values (p_profile_id, coalesce(v_first_city, 'Toda a rede'), auth.uid(), p_manager_type, v_previous_role, true)
  on conflict (profile_id) do update set
    city = excluded.city,
    assigned_by = excluded.assigned_by,
    manager_type = excluded.manager_type,
    is_active = true;

  select id into v_manager_id from public.managers where profile_id = p_profile_id;
  update public.profiles set role = 'manager', updated_at = now() where id = p_profile_id;

  delete from public.manager_cities where manager_id = v_manager_id;
  for v_city in select nullif(btrim(value), '') from jsonb_array_elements_text(coalesce(p_cities, '[]'::jsonb)) loop
    insert into public.manager_cities (manager_id, city)
    values (v_manager_id, v_city)
    on conflict (manager_id, city) do update set is_active = true;
  end loop;

  delete from public.manager_drivers where manager_id = v_manager_id;
  for v_driver_id in select value::uuid from jsonb_array_elements_text(coalesce(p_driver_ids, '[]'::jsonb)) loop
    if not exists (select 1 from public.drivers where id = v_driver_id) then
      raise exception 'Motorista inválido: %', v_driver_id;
    end if;
    insert into public.manager_drivers (manager_id, driver_id, assigned_by)
    values (v_manager_id, v_driver_id, auth.uid());
  end loop;

  insert into public.manager_audit_log (manager_id, actor_id, action, details)
  values (v_manager_id, auth.uid(), 'configure', jsonb_build_object(
    'manager_type', p_manager_type,
    'cities', coalesce(p_cities, '[]'::jsonb),
    'driver_ids', coalesce(p_driver_ids, '[]'::jsonb)
  ));

  return v_manager_id;
end;
$$;

grant execute on function public.admin_configure_manager(uuid, text, jsonb, jsonb) to authenticated;

-- Compatibilidade com a primeira tela de gerentes.
create or replace function public.admin_upsert_manager(p_profile_id uuid, p_city text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public.admin_configure_manager(p_profile_id, 'city', jsonb_build_array(p_city), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_upsert_manager(uuid, text) to authenticated;

create or replace function public.admin_set_manager_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_manager_id uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  update public.managers set is_active = p_active where profile_id = p_profile_id returning id into v_manager_id;
  if v_manager_id is null then raise exception 'Gerente não encontrado'; end if;
  insert into public.manager_audit_log (manager_id, actor_id, action, details)
  values (v_manager_id, auth.uid(), case when p_active then 'activate' else 'deactivate' end, '{}'::jsonb);
end;
$$;

grant execute on function public.admin_set_manager_active(uuid, boolean) to authenticated;

create or replace function public.admin_remove_manager(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_manager_id uuid;
  v_previous_role text;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  select id, previous_role into v_manager_id, v_previous_role
  from public.managers where profile_id = p_profile_id for update;
  if v_manager_id is null then raise exception 'Gerente não encontrado'; end if;

  update public.profiles
  set role = case
    when v_previous_role = 'driver' and exists (select 1 from public.drivers d where d.id = p_profile_id)
      then 'driver'::public.user_role
    else 'passenger'::public.user_role
  end,
  updated_at = now()
  where id = p_profile_id;

  insert into public.manager_audit_log (manager_id, actor_id, action, details)
  values (v_manager_id, auth.uid(), 'remove', jsonb_build_object('previous_role', v_previous_role));
  delete from public.managers where id = v_manager_id;
end;
$$;

grant execute on function public.admin_remove_manager(uuid) to authenticated;

-- 10. Contexto e KPIs filtrados pelo escopo atual.
create or replace function public.manager_context()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v_manager_id uuid; v_type text;
begin
  select id, manager_type into v_manager_id, v_type
  from public.managers where profile_id = auth.uid() and is_active = true;
  if v_manager_id is null then raise exception 'Gerente não encontrado ou inativo'; end if;
  return json_build_object(
    'manager_id', v_manager_id,
    'manager_type', v_type,
    'cities', coalesce((select json_agg(mc.city order by mc.city) from public.manager_cities mc where mc.manager_id = v_manager_id and mc.is_active), '[]'::json),
    'explicit_driver_count', (select count(*) from public.manager_drivers md where md.manager_id = v_manager_id and md.is_active)
  );
end;
$$;
grant execute on function public.manager_context() to authenticated;

create or replace function public.manager_kpis()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v_result json;
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  with scoped_drivers as (
    select d.id
    from public.drivers d
    where public.manager_has_driver_access(d.id)
  ),
  scoped_rides as (
    select r.*
    from public.rides r
    join scoped_drivers sd on sd.id = r.driver_id
  )
  select json_build_object(
    'context', public.manager_context(),
    'rides_today', (select count(*) from scoped_rides where requested_at::date = current_date),
    'rides_week', (select count(*) from scoped_rides where requested_at >= now() - interval '7 days'),
    'rides_month', (select count(*) from scoped_rides where requested_at >= date_trunc('month', now()) and status = 'completed'),
    'rides_in_progress', (select count(*) from scoped_rides where status in ('driver_found','driver_on_way','driver_arrived','in_progress')),
    'rides_completed', (select count(*) from scoped_rides where status = 'completed'),
    'rides_cancelled', (select count(*) from scoped_rides where status = 'cancelled'),
    'gross_month', coalesce((select sum(price) from scoped_rides where requested_at >= date_trunc('month', now()) and status = 'completed'), 0),
    'avg_ticket', coalesce((select avg(price) from scoped_rides where status = 'completed'), 0),
    'avg_distance_km', coalesce((select avg(distance_km) from scoped_rides where status = 'completed'), 0),
    'drivers_total', (select count(*) from scoped_drivers),
    'drivers_verified', (select count(*) from scoped_drivers sd join public.drivers d on d.id = sd.id where d.is_verified),
    'drivers_pending', (select count(*) from scoped_drivers sd join public.drivers d on d.id = sd.id where not d.is_verified),
    'drivers_online', (select count(*) from scoped_drivers sd join public.drivers d on d.id = sd.id where d.status = 'online'),
    'drivers_on_ride', (select count(*) from scoped_drivers sd join public.drivers d on d.id = sd.id where d.status = 'on_ride'),
    'support_open', (select count(*) from public.support_tickets t join scoped_drivers sd on sd.id = t.user_id where t.status = 'open'),
    'rides_by_type', coalesce((select json_object_agg(x.ride_type, x.total) from (select ride_type, count(*) total from scoped_rides where requested_at >= now() - interval '30 days' group by ride_type) x), '{}'::json),
    'by_month', coalesce((select json_agg(json_build_object('month', to_char(x.month_start, 'YYYY-MM'), 'rides', x.rides, 'gross', x.gross) order by x.month_start)
      from (
        select m.month_start, count(sr.id) filter (where sr.status = 'completed') as rides, coalesce(sum(sr.price) filter (where sr.status = 'completed'), 0) as gross
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m(month_start)
        left join scoped_rides sr on date_trunc('month', sr.requested_at) = m.month_start
        group by m.month_start
      ) x), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function public.manager_kpis() to authenticated;

-- 11. Listas e relatórios do gerente.
create or replace function public.manager_list_drivers(p_limit int default 300, p_search text default '')
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r) order by r.full_name), '[]'::json)
    from (
      select d.id as driver_id, p.full_name, p.phone, p.rating, p.total_ratings,
             d.status, d.is_verified, d.documents_status, d.total_rides,
             d.operating_city, d.operating_state,
             v.model as vehicle_model, v.plate::text as vehicle_plate, v.color as vehicle_color, v.year as vehicle_year,
             s.status as subscription_status, s.due_date as subscription_due
      from public.drivers d
      join public.profiles p on p.id = d.id
      left join public.vehicles v on v.driver_id = d.id and v.is_primary = true
      left join lateral (select status, due_date from public.subscriptions ss where ss.driver_id = d.id order by due_date desc limit 1) s on true
      where public.manager_has_driver_access(d.id)
        and (nullif(btrim(p_search), '') is null or p.full_name ilike '%' || btrim(p_search) || '%' or coalesce(p.phone, '') ilike '%' || btrim(p_search) || '%')
      order by p.full_name
      limit greatest(1, least(coalesce(p_limit, 300), 500))
    ) r
  );
end;
$$;
grant execute on function public.manager_list_drivers(int, text) to authenticated;

create or replace function public.manager_list_rides(p_limit int default 300)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r) order by r.requested_at desc), '[]'::json)
    from (
      select r.id as ride_id, r.status, r.ride_type, r.origin_address, r.destination_address,
             r.price, r.distance_km, r.duration_min, r.requested_at, r.completed_at,
             pp.full_name as passenger_name, dp.full_name as driver_name
      from public.rides r
      left join public.profiles pp on pp.id = r.passenger_id
      left join public.profiles dp on dp.id = r.driver_id
      where r.driver_id is not null and public.manager_has_driver_access(r.driver_id)
      order by r.requested_at desc
      limit greatest(1, least(coalesce(p_limit, 300), 500))
    ) r
  );
end;
$$;
grant execute on function public.manager_list_rides(int) to authenticated;

create or replace function public.manager_full_report()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare v_result json;
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  select json_build_object(
    'kpis', public.manager_kpis(),
    'drivers', (
      select coalesce(json_agg(row_to_json(x) order by x.rating desc, x.total_rides desc), '[]'::json)
      from (
        select p.full_name, p.rating, p.total_ratings, d.total_rides, d.status, d.is_verified,
               d.operating_city, v.model as vehicle_model
        from public.drivers d join public.profiles p on p.id = d.id
        left join public.vehicles v on v.driver_id = d.id and v.is_primary
        where public.manager_has_driver_access(d.id)
        order by p.rating desc, d.total_rides desc limit 50
      ) x
    ),
    'ride_status', (
      select coalesce(json_object_agg(x.status, x.total), '{}'::json)
      from (select r.status, count(*) total from public.rides r where r.driver_id is not null and public.manager_has_driver_access(r.driver_id) group by r.status) x
    )
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.manager_full_report() to authenticated;

-- Gerentes só podem operar motoristas dentro do próprio escopo.
create or replace function public.manager_verify_driver(p_driver_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() or not public.manager_has_driver_access(p_driver_id) then raise exception 'Unauthorized'; end if;
  update public.drivers
  set is_verified = p_approve,
      documents_status = case when p_approve then 'approved'::public.document_status else 'rejected'::public.document_status end,
      updated_at = now()
  where id = p_driver_id;
end;
$$;
grant execute on function public.manager_verify_driver(uuid, boolean) to authenticated;

-- 12. Atualiza o vínculo de cidade do próprio motorista no cadastro.
create or replace function public.update_my_operating_city(p_city text, p_state text default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.drivers
  set operating_city = nullif(btrim(p_city), ''), operating_state = nullif(btrim(p_state), ''), updated_at = now()
  where id = auth.uid();
end;
$$;
grant execute on function public.update_my_operating_city(text, text) to authenticated;

comment on table public.manager_cities is 'Cidades operacionais vinculadas a um gerente.';
comment on table public.manager_drivers is 'Vínculos diretos de motoristas com gerentes.';
comment on function public.manager_kpis() is 'KPIs restritos aos motoristas/cidades do gerente autenticado.';
