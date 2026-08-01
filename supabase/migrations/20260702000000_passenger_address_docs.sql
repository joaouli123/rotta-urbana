-- Rotta Urbana — Add passenger address and document columns to profiles
set search_path = public;

alter table public.profiles add column if not exists address_cep text;
alter table public.profiles add column if not exists address_street text;
alter table public.profiles add column if not exists address_number text;
alter table public.profiles add column if not exists address_neighborhood text;
alter table public.profiles add column if not exists address_city text;
alter table public.profiles add column if not exists address_state text;
alter table public.profiles add column if not exists address_complement text;
alter table public.profiles add column if not exists doc_rg_path text;
alter table public.profiles add column if not exists doc_selfie_path text;

comment on column public.profiles.address_cep is 'Passenger CEP address';
comment on column public.profiles.address_street is 'Passenger street address';
comment on column public.profiles.address_number is 'Passenger street number';
comment on column public.profiles.address_neighborhood is 'Passenger address neighborhood';
comment on column public.profiles.address_city is 'Passenger address city';
comment on column public.profiles.address_state is 'Passenger address state';
comment on column public.profiles.address_complement is 'Passenger address complement';
comment on column public.profiles.doc_rg_path is 'Path to uploaded RG document in driver-docs storage bucket';
comment on column public.profiles.doc_selfie_path is 'Path to uploaded selfie in driver-docs storage bucket';

-- Update the handle_new_user() trigger to save passenger metadata fields
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role   public.user_role;
  v_name   text;
  v_phone  text;
  v_gender public.gender;
  v_cpf    text;
  v_plan   public.plan_type;
  v_daily  numeric(10,2);
  v_month  numeric(10,2);
  v_fee    numeric(10,2);
begin
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'passenger');
  exception when others then v_role := 'passenger'; end;
  if v_role = 'admin' then v_role := 'passenger'; end if;

  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );
  if length(v_name) < 2 then v_name := 'Usuario'; end if;

  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and v_phone !~ '^[0-9+()\-\s]{8,20}$' then v_phone := null; end if;

  begin
    v_gender := nullif(btrim(new.raw_user_meta_data->>'gender'), '')::public.gender;
  exception when others then v_gender := null; end;

  v_cpf := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
  if length(v_cpf) <> 11 then v_cpf := null; end if;

  insert into public.profiles (
    id, full_name, email, phone, role, gender, cpf,
    address_cep, address_street, address_number, address_neighborhood,
    address_city, address_state, address_complement, doc_rg_path, doc_selfie_path
  )
  values (
    new.id, v_name, new.email, v_phone, v_role, v_gender, v_cpf,
    new.raw_user_meta_data->>'address_cep',
    new.raw_user_meta_data->>'address_street',
    new.raw_user_meta_data->>'address_number',
    new.raw_user_meta_data->>'address_neighborhood',
    new.raw_user_meta_data->>'address_city',
    new.raw_user_meta_data->>'address_state',
    new.raw_user_meta_data->>'address_complement',
    new.raw_user_meta_data->>'doc_rg_path',
    new.raw_user_meta_data->>'doc_selfie_path'
  );

  if v_role = 'driver' then
    select default_plan, subscription_daily_amount, subscription_monthly_amount
      into v_plan, v_daily, v_month
    from public.app_settings where id = 1;

    v_plan := coalesce(v_plan, 'monthly');
    v_fee  := case when v_plan = 'daily' then coalesce(v_daily, 3.00) else coalesce(v_month, 49.90) end;

    insert into public.drivers (id) values (new.id);
    insert into public.subscriptions (driver_id, status, amount, due_date, plan)
    values (new.id, 'expired', v_fee, current_date, v_plan);
  end if;

  return new;
end;
$$;
