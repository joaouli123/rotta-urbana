-- ============================================================================
-- Rotta Urbana — 0039b: sistema de gerentes + relatórios avançados
-- Requer que 20260623020001_add_manager_role já tenha sido aplicado.
-- ============================================================================
set search_path = public, extensions;

-- 1. Tabela de gerentes
create table if not exists public.managers (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  city        text not null check (length(btrim(city)) > 0),
  assigned_by uuid references public.profiles(id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint managers_profile_id_key unique (profile_id)
);

create trigger trg_managers_updated_at
  before update on public.managers
  for each row execute function public.set_updated_at();

alter table public.managers enable row level security;

create policy "managers_admin_all" on public.managers
  for all using (is_admin());

create policy "managers_read_own" on public.managers
  for select using (profile_id = auth.uid());

-- 2. Helper: verificar se usuário é gerente
create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  )
$$;
grant execute on function public.is_manager() to authenticated;

-- 3. RPC: listar gerentes (admin)
create or replace function public.admin_list_managers()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
      select
        m.id,
        m.profile_id,
        p.full_name,
        p.email,
        p.phone,
        m.city,
        m.is_active,
        m.created_at,
        a.full_name as assigned_by_name
      from public.managers m
      join public.profiles p on p.id = m.profile_id
      left join public.profiles a on a.id = m.assigned_by
      order by m.created_at desc
    ) r
  );
end;
$$;
grant execute on function public.admin_list_managers() to authenticated;

-- 4. RPC: criar ou atualizar gerente
create or replace function public.admin_upsert_manager(p_profile_id uuid, p_city text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  update public.profiles set role = 'manager', updated_at = now()
  where id = p_profile_id;
  insert into public.managers (profile_id, city, assigned_by)
  values (p_profile_id, p_city, auth.uid())
  on conflict (profile_id) do update
    set city = excluded.city, is_active = true, updated_at = now();
end;
$$;
grant execute on function public.admin_upsert_manager(uuid, text) to authenticated;

-- 5. RPC: remover gerente
create or replace function public.admin_remove_manager(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  update public.profiles set role = 'passenger', updated_at = now()
  where id = p_profile_id;
  delete from public.managers where profile_id = p_profile_id;
end;
$$;
grant execute on function public.admin_remove_manager(uuid) to authenticated;

-- 6. RPC: buscar usuário por e-mail (para criar gerente)
create or replace function public.admin_find_user_by_email(p_email text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  return (
    select row_to_json(r) from (
      select id, full_name, email, phone, role::text as role
      from public.profiles
      where lower(email) = lower(trim(p_email))
      limit 1
    ) r
  );
end;
$$;
grant execute on function public.admin_find_user_by_email(text) to authenticated;

-- 7. RPC: relatório completo (admin)
create or replace function public.admin_full_report()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_result json;
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;

  select json_build_object(
    'passengers', (
      select json_build_object(
        'total',      count(*),
        'female',     count(*) filter (where gender = 'female'),
        'male',       count(*) filter (where gender = 'male'),
        'other',      count(*) filter (where gender = 'other' or gender is null),
        'active_30d', count(*) filter (where updated_at > now() - interval '30 days')
      ) from public.profiles where role = 'passenger'
    ),
    'drivers', (
      select json_build_object(
        'total',       count(*),
        'verified',    count(*) filter (where d.is_verified = true),
        'pending',     count(*) filter (where d.is_verified = false and d.documents_status = 'pending'),
        'rejected',    count(*) filter (where d.documents_status = 'rejected'),
        'avg_rating',  round(coalesce(avg(p.rating), 0)::numeric, 2),
        'total_rides', coalesce(sum(d.total_rides), 0)
      )
      from public.drivers d
      join public.profiles p on p.id = d.id
    ),
    'rides', (
      select json_build_object(
        'total',            count(*),
        'completed',        count(*) filter (where status = 'completed'),
        'cancelled',        count(*) filter (where status = 'cancelled'),
        'in_progress',      count(*) filter (where status in ('in_progress','driver_found','driver_on_way','driver_arrived')),
        'this_month',       count(*) filter (where requested_at >= date_trunc('month', now())),
        'last_month',       count(*) filter (
                              where requested_at >= date_trunc('month', now() - interval '1 month')
                              and   requested_at <  date_trunc('month', now())
                            ),
        'avg_price',        round(coalesce(avg(price) filter (where status='completed'), 0)::numeric, 2),
        'avg_duration_min', round(coalesce(avg(duration_min) filter (where status='completed'), 0)::numeric, 1),
        'avg_distance_km',  round(coalesce(avg(distance_km)  filter (where status='completed'), 0)::numeric, 1),
        'gross_total',      coalesce(sum(price) filter (where status='completed'), 0),
        'by_month', (
          select coalesce(json_agg(json_build_object(
            'month', to_char(m.mo, 'YYYY-MM'),
            'count', coalesce(r.cnt, 0),
            'gross', coalesce(r.gross, 0)
          ) order by m.mo), '[]'::json)
          from (
            select generate_series(
              date_trunc('month', now()) - interval '5 months',
              date_trunc('month', now()),
              '1 month'::interval
            ) as mo
          ) m
          left join (
            select date_trunc('month', requested_at) as mo,
                   count(*) as cnt,
                   coalesce(sum(price), 0) as gross
            from public.rides where status = 'completed'
            group by date_trunc('month', requested_at)
          ) r on r.mo = m.mo
        )
      ) from public.rides
    ),
    'revenue', (
      select json_build_object(
        'subscriptions_total',   coalesce(sum(amount) filter (where status = 'approved'), 0),
        'subscriptions_pending', count(*)  filter (where status = 'pending')
      ) from public.payments
    ),
    'complaints', (
      select json_build_object(
        'total',       count(*),
        'open',        count(*) filter (where status = 'open'),
        'in_progress', count(*) filter (where status = 'in_progress'),
        'closed',      count(*) filter (where status = 'closed')
      ) from public.support_tickets
    )
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function public.admin_full_report() to authenticated;

-- 8. RPC: ranking de motoristas (admin ou gerente)
create or replace function public.admin_driver_ranking(p_limit int default 30)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() and not is_manager() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
      select
        d.id                                                            as driver_id,
        p.full_name,
        p.phone,
        p.rating,
        p.total_ratings,
        d.total_rides,
        d.is_verified,
        v.model                                                         as vehicle_model,
        v.plate::text                                                   as vehicle_plate,
        row_number() over (order by p.rating desc, d.total_rides desc)  as rank_by_rating,
        row_number() over (order by d.total_rides desc, p.rating desc)  as rank_by_rides
      from public.drivers d
      join public.profiles p on p.id = d.id
      left join public.vehicles v on v.driver_id = d.id and v.is_primary = true
      where d.is_verified = true
      order by p.rating desc, d.total_rides desc
      limit p_limit
    ) r
  );
end;
$$;
grant execute on function public.admin_driver_ranking(int) to authenticated;

-- 9. RPC: KPIs do gerente
create or replace function public.manager_kpis()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_city text;
begin
  if not is_manager() then raise exception 'Unauthorized'; end if;
  select city into v_city
  from public.managers
  where profile_id = auth.uid() and is_active = true
  limit 1;
  if v_city is null then raise exception 'Gerente não encontrado ou inativo'; end if;

  return json_build_object(
    'city',              v_city,
    'rides_today',       (select count(*) from public.rides
                          where requested_at::date = current_date),
    'rides_week',        (select count(*) from public.rides
                          where requested_at > now() - interval '7 days'),
    'rides_month',       (select count(*) from public.rides
                          where requested_at > now() - interval '30 days' and status = 'completed'),
    'drivers_total',     (select count(*) from public.drivers),
    'drivers_verified',  (select count(*) from public.drivers where is_verified = true),
    'drivers_pending',   (select count(*) from public.drivers where is_verified = false),
    'support_open',      (select count(*) from public.support_tickets where status = 'open'),
    'rides_in_progress', (select count(*) from public.rides
                          where status in ('in_progress','driver_found','driver_on_way','driver_arrived'))
  );
end;
$$;
grant execute on function public.manager_kpis() to authenticated;

-- 10. RLS extra: gerentes podem ler motoristas, corridas e tickets
drop policy if exists "managers_select_drivers" on public.drivers;
create policy "managers_select_drivers" on public.drivers
  for select using (is_manager());

drop policy if exists "managers_select_rides" on public.rides;
create policy "managers_select_rides" on public.rides
  for select using (is_manager());

drop policy if exists "managers_select_tickets" on public.support_tickets;
create policy "managers_select_tickets" on public.support_tickets
  for select using (is_manager());
