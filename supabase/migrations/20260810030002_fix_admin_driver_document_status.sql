-- Corrige a escrita do status documental na aprovação administrativa.
-- A coluna usa o enum document_status; o cast explicito evita erro de tipo.
set search_path = public, extensions;

create or replace function public.admin_verify_driver(p_driver_id uuid, p_approve boolean)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare v_driver public.drivers;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  update public.drivers
     set is_verified      = p_approve,
         documents_status = (case when p_approve then 'approved' else 'rejected' end)::public.document_status
   where id = p_driver_id
   returning * into v_driver;

  if not found then raise exception 'driver not found'; end if;

  update public.driver_documents
     set verified = p_approve, reviewed_at = now()
   where driver_id = p_driver_id;

  return v_driver;
end;
$$;

grant execute on function public.admin_verify_driver(uuid, boolean) to authenticated, service_role;
