-- Rotta Urbana: suporte por escopo e notificacao ao usuario atendido.
-- Gerentes podem acompanhar motoristas e passageiros que tiveram corrida com
-- a rede no periodo carregado pelo portal. A resposta do suporte gera push
-- somente para o usuario dono do chamado.
set search_path = public, extensions;

create extension if not exists pg_net;

create or replace function public.manager_can_access_support_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select public.is_manager()
    and (
      exists (
        select 1
        from public.drivers d
        where d.id = p_user_id
          and public.manager_has_driver_access(d.id)
      )
      or exists (
        select 1
        from public.rides r
        where r.passenger_id = p_user_id
          and r.driver_id is not null
          and public.manager_has_driver_access(r.driver_id)
      )
    )
$$;

grant execute on function public.manager_can_access_support_user(uuid) to authenticated;

drop policy if exists managers_select_tickets on public.support_tickets;
create policy managers_select_tickets on public.support_tickets
  for select to authenticated
  using (public.manager_can_access_support_user(user_id));

create or replace function public.manager_list_tickets(p_limit int default 200)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json)
    from (
      select t.id as ticket_id, p.full_name as user_name, p.role::text as user_role,
             t.subject, t.message, t.status, t.response, t.created_at
      from public.support_tickets t
      left join public.profiles p on p.id = t.user_id
      where public.manager_can_access_support_user(t.user_id)
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
  select user_id into v_user_id
  from public.support_tickets
  where id = p_ticket_id;
  if v_user_id is null or not public.manager_can_access_support_user(v_user_id) then
    raise exception 'Unauthorized';
  end if;
  update public.support_tickets
  set status = p_status,
      response = nullif(btrim(p_response), ''),
      updated_at = now()
  where id = p_ticket_id;
end;
$$;

grant execute on function public.manager_set_ticket_status(uuid, public.ticket_status, text) to authenticated;

create or replace function public.notify_support_ticket_update()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_token text;
  v_body text;
begin
  if new.status is not distinct from old.status
     and new.response is not distinct from old.response then
    return new;
  end if;

  select push_token into v_token
  from public.profiles
  where id = new.user_id
    and push_token is not null;

  if v_token is null then return new; end if;

  v_body := case new.status
    when 'closed' then 'Seu chamado foi encerrado. Abra o suporte no app para consultar os detalhes.'
    when 'in_progress' then 'Seu chamado está em análise. Abra o suporte no app para consultar a atualização.'
    else 'Seu chamado recebeu uma atualização. Abra o suporte no app para consultar os detalhes.'
  end;

  if nullif(btrim(new.response), '') is not null then
    v_body := v_body || ' Há uma nova resposta da equipe.';
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'title', 'Atualização do suporte',
      'body', v_body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'support',
      'data', jsonb_build_object('ticketId', new.id, 'type', 'support_ticket_update')
    )
  );
  return new;
exception when others then
  -- Falha de push nunca deve impedir a resposta ou o fechamento do chamado.
  return new;
end;
$$;

drop trigger if exists trg_notify_support_ticket_update on public.support_tickets;
create trigger trg_notify_support_ticket_update
  after update on public.support_tickets
  for each row execute function public.notify_support_ticket_update();

comment on function public.notify_support_ticket_update is
  'Envia push ao passageiro ou motorista dono do chamado quando o suporte atualiza status ou resposta.';
