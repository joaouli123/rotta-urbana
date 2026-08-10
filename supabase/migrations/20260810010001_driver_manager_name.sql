-- Motoristas podem consultar somente o nome do gerente responsável.
-- O painel, permissões e métricas continuam exclusivos do site.
create or replace function public.driver_manager_name()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.full_name
  from public.managers m
  join public.profiles p on p.id = m.profile_id
  where m.is_active = true
    and (
      exists (
        select 1
        from public.manager_drivers md
        where md.manager_id = m.id
          and md.driver_id = auth.uid()
          and md.is_active = true
      )
      or exists (
        select 1
        from public.manager_cities mc
        join public.drivers d on d.id = auth.uid()
        left join public.profiles dp on dp.id = d.id
        where mc.manager_id = m.id
          and mc.is_active = true
          and lower(btrim(mc.city)) = lower(btrim(coalesce(d.operating_city, dp.address_city, '')))
      )
      or m.manager_type = 'network'
    )
  order by
    case
      when exists (
        select 1 from public.manager_drivers md
        where md.manager_id = m.id and md.driver_id = auth.uid() and md.is_active = true
      ) then 1
      when exists (
        select 1
        from public.manager_cities mc
        join public.drivers d on d.id = auth.uid()
        left join public.profiles dp on dp.id = d.id
        where mc.manager_id = m.id
          and mc.is_active = true
          and lower(btrim(mc.city)) = lower(btrim(coalesce(d.operating_city, dp.address_city, '')))
      ) then 2
      when m.manager_type = 'network' then 3
      else 4
    end,
    m.created_at desc nulls last
  limit 1;
$$;

grant execute on function public.driver_manager_name() to authenticated;
