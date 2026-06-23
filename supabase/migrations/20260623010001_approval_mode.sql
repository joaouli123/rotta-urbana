-- ============================================================================
-- Rotta Urbana — 0037: sistema de aprovação de motoristas
-- Manual (admin aprova 1 a 1), Automático (aprovado ao cadastrar),
-- Aprovar todos (bulk approve dos pendentes) + ano mínimo do veículo.
-- ============================================================================
set search_path = public, extensions;

-- 1. Novas colunas em app_settings
alter table public.app_settings
  add column if not exists driver_approval_mode text not null default 'manual'
    check (driver_approval_mode in ('manual', 'auto')),
  add column if not exists min_vehicle_year int not null default 2014;

-- Garantir que exista pelo menos 1 linha (upsert seguro)
insert into public.app_settings (driver_approval_mode, min_vehicle_year)
select 'manual', 2014
where not exists (select 1 from public.app_settings);

-- 2. RPC: ler configurações completas (admin)
create or replace function public.admin_get_settings()
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  return (select row_to_json(s) from public.app_settings s limit 1);
end;
$$;

-- 3. RPC: alterar modo de aprovação
create or replace function public.admin_set_approval_mode(p_mode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  if p_mode not in ('manual', 'auto') then raise exception 'Modo inválido'; end if;
  update public.app_settings set driver_approval_mode = p_mode;
end;
$$;

-- 4. RPC: alterar ano mínimo do veículo
create or replace function public.admin_set_min_vehicle_year(p_year int)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  if p_year < 1990 or p_year > extract(year from now())::int + 1 then
    raise exception 'Ano inválido';
  end if;
  update public.app_settings set min_vehicle_year = p_year;
end;
$$;

-- 5. RPC: aprovar todos os motoristas pendentes de uma vez
create or replace function public.admin_approve_all_pending()
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_count int;
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;

  update public.drivers
  set is_verified = true,
      documents_status = 'approved',
      updated_at = now()
  where is_verified = false;

  get diagnostics v_count = row_count;

  -- marcar documentos dos motoristas recém-aprovados como verificados
  update public.driver_documents
  set verified = true, reviewed_at = now()
  where driver_id in (
    select id from public.drivers where is_verified = true
  ) and verified = false;

  return v_count;
end;
$$;

-- 6. Trigger: auto-aprovar motorista novo quando modo = 'auto'
create or replace function public.auto_approve_driver()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_mode text;
begin
  select driver_approval_mode into v_mode from public.app_settings limit 1;
  if v_mode = 'auto' then
    new.is_verified     := true;
    new.documents_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_driver on public.drivers;
create trigger trg_auto_approve_driver
  before insert on public.drivers
  for each row execute function public.auto_approve_driver();

-- Grants
grant execute on function public.admin_get_settings()                    to authenticated;
grant execute on function public.admin_set_approval_mode(text)           to authenticated;
grant execute on function public.admin_set_min_vehicle_year(int)         to authenticated;
grant execute on function public.admin_approve_all_pending()             to authenticated;
