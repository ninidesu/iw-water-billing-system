-- Migration: 20261113_admin_collect_payments.sql
-- Allow both administrators and cashiers to collect and record payments,
-- ensuring the signed-in staff member's ID is recorded on the transaction.

begin;

-- 1. Update the payment collector trigger to allow both admin and cashier
create or replace function public.guard_payment_collector()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (public.get_my_role() not in ('admin', 'cashier')) or (new.collected_by is distinct from auth.uid()) then
      raise exception 'Payments must be recorded by the signed-in staff';
    end if;
  elsif new.collected_by is distinct from old.collected_by then
    raise exception 'Payment collector cannot be changed';
  end if;
  return new;
end;
$$;

-- 2. Update RLS policies on public.payments for insert and update
drop policy if exists payments_cashier_insert on public.payments;
drop policy if exists payments_staff_insert on public.payments;
create policy payments_staff_insert on public.payments for insert to authenticated
  with check (public.get_my_role() in ('admin', 'cashier') and collected_by = (select auth.uid()));

drop policy if exists payments_cashier_update on public.payments;
drop policy if exists payments_staff_update on public.payments;
create policy payments_staff_update on public.payments for update to authenticated
  using (public.get_my_role() in ('admin', 'cashier'))
  with check (public.get_my_role() in ('admin', 'cashier'));

-- 3. Update RLS policies on public.bills for staff insert and update
drop policy if exists bills_cashier_insert on public.bills;
drop policy if exists bills_staff_insert on public.bills;
create policy bills_staff_insert on public.bills for insert to authenticated
  with check (public.get_my_role() in ('admin', 'cashier') and exists (
    select 1 from public.customers where id = customer_id and status = 'active'));

drop policy if exists bills_cashier_update on public.bills;
drop policy if exists bills_staff_update on public.bills;
create policy bills_staff_update on public.bills for update to authenticated
  using (public.get_my_role() in ('admin', 'cashier'))
  with check (public.get_my_role() in ('admin', 'cashier'));

-- 4. Update create_bill function to allow both admin and cashier
create or replace function public.create_bill(
  p_customer_id uuid, p_billing_month date, p_due_date date, p_current_reading numeric, p_first_previous_reading numeric default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_customer public.customers%rowtype; v_last public.bills%rowtype; v_previous numeric; v_usage numeric;
  v_charge numeric; v_prior numeric; v_id uuid; v_date date; t record; v_line numeric;
begin
  if public.get_my_role() not in ('admin', 'cashier') then raise exception 'Staff access required'; end if;
  if extract(day from p_billing_month) <> 1 then raise exception 'Billing month must be the first day of a month'; end if;
  if p_due_date <= p_billing_month then raise exception 'Due date must follow the billing month'; end if;
  if p_current_reading is null or p_current_reading < 0 then raise exception 'Current reading must be non-negative'; end if;
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found or v_customer.status <> 'active' then raise exception 'Active customer required'; end if;
  select * into v_last from public.bills where customer_id = p_customer_id order by billing_month desc, id desc limit 1;
  if found then
    if p_billing_month <= v_last.billing_month then raise exception 'A bill already exists for this or a later month'; end if;
    v_previous := v_last.current_reading;
  else
    v_previous := coalesce(p_first_previous_reading, v_customer.initial_reading, 0);
  end if;
  if p_current_reading < v_previous then raise exception 'Current reading cannot be lower than previous reading'; end if;
  v_usage := p_current_reading - v_previous;
  v_charge := public.compute_water_charge(v_usage);
  select coalesce(sum(balance), 0) into v_prior from public.bills where customer_id = p_customer_id and balance > 0;
  v_date := (now() at time zone 'Asia/Manila')::date;
  insert into public.bills(customer_id, billing_month, bill_date, due_date,
    previous_reading, current_reading, amount, previous_balance, bill_no)
  values(p_customer_id, p_billing_month, v_date, p_due_date,
    v_previous, p_current_reading, v_charge, v_prior, public.next_bill_number(p_billing_month))
  returning id into v_id;
  for t in select * from public.active_charges() order by code loop
    if t.charge_type = 'fixed' then v_line := t.amount;
    else v_line := round((v_charge * t.rate_percent / 100.0), 2); end if;
    insert into public.bill_items(bill_id, description, amount)
    values(v_id, t.name, v_line);
  end loop;
  perform public.refresh_bill_from_allocations(v_id);
  return v_id;
end;
$$;

-- 5. Update profiles policy so staff (admin and cashier) can view collector profiles
drop policy if exists profiles_self_staff_read on public.profiles;
create policy profiles_self_staff_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.get_my_role() in ('admin', 'cashier'));

-- 6. Update customers policies for staff writes
drop policy if exists customers_cashier_insert on public.customers;
drop policy if exists customers_staff_insert on public.customers;
create policy customers_staff_insert on public.customers for insert to authenticated
  with check (public.get_my_role() in ('admin', 'cashier'));

drop policy if exists customers_cashier_update on public.customers;
drop policy if exists customers_staff_update on public.customers;
create policy customers_staff_update on public.customers for update to authenticated
  using (public.get_my_role() in ('admin', 'cashier'))
  with check (public.get_my_role() in ('admin', 'cashier'));

commit;
