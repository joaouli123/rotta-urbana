-- Rotta Urbana — relatório completo do plano comissão
-- Complementa o relatório administrativo com bruto, comissão e líquido.
set search_path = public, extensions;

create or replace function public.admin_commission_report()
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Unauthorized'; end if;
  return (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
      select
        dc.driver_id,
        p.full_name,
        p.phone,
        count(*) filter (where dc.status = 'pending') as pending_count,
        coalesce(sum(dc.commission_amount) filter (where dc.status = 'pending'), 0) as pending_amount,
        coalesce(sum(dc.commission_amount) filter (where dc.status = 'paid'), 0) as paid_amount,
        coalesce(sum(dc.ride_price), 0) as gross_amount,
        coalesce(sum(dc.commission_amount), 0) as commission_amount,
        coalesce(sum(dc.ride_price - dc.commission_amount), 0) as net_amount,
        count(*) as total_rides
      from public.driver_commissions dc
      join public.profiles p on p.id = dc.driver_id
      group by dc.driver_id, p.full_name, p.phone
      order by pending_amount desc nulls last
    ) r
  );
end;
$$;

grant execute on function public.admin_commission_report() to authenticated;
