-- Suporte restrito ao escopo do gerente.
set search_path = public, extensions;

create or replace function public.manager_list_tickets(p_limit int default 200)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json)
    from (
      select t.id as ticket_id, p.full_name as user_name, t.subject, t.message,
             t.status, t.response, t.created_at
      from public.support_tickets t
      left join public.profiles p on p.id = t.user_id
      where exists (
        select 1 from public.drivers d
        where d.id = t.user_id and public.manager_has_driver_access(d.id)
      )
      order by t.created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) r
  );
end;
$$;
grant execute on function public.manager_list_tickets(int) to authenticated;

create or replace function public.manager_set_ticket_status(
  p_ticket_id uuid,
  p_status public.ticket_status,
  p_response text default null
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_user_id uuid;
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  select user_id into v_user_id from public.support_tickets where id = p_ticket_id;
  if v_user_id is null or not public.manager_has_driver_access(v_user_id) then raise exception 'Unauthorized'; end if;
  update public.support_tickets
  set status = p_status, response = nullif(btrim(p_response), ''), updated_at = now()
  where id = p_ticket_id;
end;
$$;
grant execute on function public.manager_set_ticket_status(uuid, public.ticket_status, text) to authenticated;
