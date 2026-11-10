-- Migration: 20261114_staff_activate_application.sql
-- Allow both administrators and cashiers to activate new service applications.

begin;

create or replace function public.activate_application(
  p_id uuid,
  p_can text,
  p_meter text,
  p_reading numeric,
  p_message text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  app public.service_applications%rowtype;
  anchor uuid := gen_random_uuid();
  account uuid;
begin
  if public.get_my_role() not in ('admin', 'cashier') then
    raise exception 'Staff access required';
  end if;

  select * into strict app from public.service_applications where id = p_id for update;

  if app.linked_account_id is not null then
    return app.linked_account_id;
  end if;

  if app.status <> 'installation'
     or nullif(trim(p_can), '') is null
     or nullif(trim(p_meter), '') is null
     or p_reading is null
     or p_reading < 0 then
    raise exception 'Confirm installation, CAN, meter and initial reading';
  end if;

  if exists(
    select 1 from public.application_requirements
    where application_id = p_id and status not in ('accepted', 'waived')
  ) then
    raise exception 'Review outstanding requirements before activation';
  end if;

  insert into public.customers(id, address, contact_no, meter_no, status)
  values(anchor, app.service_address, coalesce(app.contact_no, ''), upper(trim(p_meter)), 'active');

  insert into public.contract_accounts(can, legacy_customer_id, account_name, service_address, meter_no, installation_reading)
  values(upper(trim(p_can)), anchor, app.applicant_name, app.service_address, upper(trim(p_meter)), p_reading)
  returning id into account;

  insert into public.account_contacts values(account, app.contact_no, app.contact_email, now());

  update public.service_applications
  set linked_account_id = account,
      status = 'activated',
      customer_message = nullif(trim(p_message), ''),
      updated_at = now()
  where id = p_id;

  return account;
end;
$$;

revoke all on function public.activate_application(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.activate_application(uuid, text, text, numeric, text) to authenticated;

commit;
