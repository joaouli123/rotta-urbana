-- Avoid accepting Mato Grosso do Sul when the configured state is Mato Grosso.
set search_path = public, extensions;

create or replace function public.service_area_allows_address(p_address text)
returns boolean
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  s public.app_settings%rowtype;
  v_text text;
  v_state_name text;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not coalesce(s.service_area_enabled, true) or coalesce(s.service_area_scope, 'radius') = 'radius' then
    return true;
  end if;

  v_text := lower(extensions.unaccent(coalesce(p_address, '')));
  if length(btrim(v_text)) = 0 then return false; end if;

  if coalesce(s.service_area_scope, 'radius') = 'country' then
    if upper(coalesce(s.service_area_country, 'BR')) = 'BR' then
      return v_text like '%brasil%' or v_text ~ '(^|[^a-z])br([^a-z]|$)';
    end if;
    return v_text like '%' || lower(coalesce(s.service_area_country, '')) || '%';
  end if;

  v_state_name := case upper(coalesce(s.service_area_state, 'MT'))
    when 'AC' then 'acre' when 'AL' then 'alagoas' when 'AP' then 'amapa'
    when 'AM' then 'amazonas' when 'BA' then 'bahia' when 'CE' then 'ceara'
    when 'DF' then 'distrito federal' when 'ES' then 'espirito santo' when 'GO' then 'goias'
    when 'MA' then 'maranhao' when 'MT' then 'mato grosso' when 'MS' then 'mato grosso do sul'
    when 'MG' then 'minas gerais' when 'PA' then 'para' when 'PB' then 'paraiba'
    when 'PR' then 'parana' when 'PE' then 'pernambuco' when 'PI' then 'piaui'
    when 'RJ' then 'rio de janeiro' when 'RN' then 'rio grande do norte'
    when 'RS' then 'rio grande do sul' when 'RO' then 'rondonia' when 'RR' then 'roraima'
    when 'SC' then 'santa catarina' when 'SP' then 'sao paulo' when 'SE' then 'sergipe'
    when 'TO' then 'tocantins' else lower(coalesce(s.service_area_state, 'MT')) end;

  if upper(coalesce(s.service_area_state, 'MT')) = 'MT'
     and v_text like '%mato grosso do sul%' then
    return false;
  end if;
  if not (v_text like '%' || v_state_name || '%' or v_text ~ ('(^|[^a-z])' || lower(coalesce(s.service_area_state, 'MT')) || '([^a-z]|$)')) then
    return false;
  end if;
  if coalesce(s.service_area_scope, 'radius') = 'state' then return true; end if;
  return v_text like '%' || lower(coalesce(s.service_area_city, 'Sinop')) || '%';
end;
$$;

grant execute on function public.service_area_allows_address(text)
  to authenticated, service_role;
revoke execute on function public.service_area_allows_address(text) from anon;
