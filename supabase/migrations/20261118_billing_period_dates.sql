begin;
alter table public.bills add column if not exists period_start date;
alter table public.bills add column if not exists period_end date;
-- Preserve issued charges, balances and due dates. Backfill only the missing period.
update public.bills set period_start=coalesce(period_start,billing_month),
  period_end=coalesce(period_end,(billing_month+interval '1 month - 1 day')::date)
where period_start is null or period_end is null;

create or replace function public.validate_soa_dates()
returns trigger language plpgsql set search_path='' as $$
declare current_month date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;
  custom_dates jsonb:=nullif(current_setting('app.soa_dates',true),'')::jsonb;
begin
  if new.billing_month is null or extract(day from new.billing_month)<>1 then raise exception 'Billing month must be the first day of a month'; end if;
  if tg_op='INSERT' and custom_dates->>'customer'=new.customer_id::text and custom_dates->>'month'=new.billing_month::text then
    new.period_start:=(custom_dates->>'start')::date;
    new.period_end:=(custom_dates->>'end')::date;
  end if;
  new.period_start:=coalesce(new.period_start,new.billing_month);
  new.period_end:=coalesce(new.period_end,(new.billing_month+interval '1 month - 1 day')::date);
  if new.period_end<new.period_start then raise exception 'Period end cannot be before period start'; end if;
  if tg_op='INSERT' then
    if coalesce(new.historical,false) and new.billing_month>=current_month then raise exception 'Past SOAs must use a previous month'; end if;
    if not coalesce(new.historical,false) and new.billing_month<current_month then raise exception 'New SOAs cannot use a past billing month'; end if;
    -- All new calls that do not provide dates use calendar-month defaults.
    if new.due_date is null then new.due_date:=new.period_end+10; end if;
  end if;
  if tg_op='UPDATE' then
    if (new.billing_month is distinct from old.billing_month or new.historical is distinct from old.historical or (old.status='pending' and new.status<>'pending')) then
      if coalesce(new.historical,false) and new.billing_month>=current_month then raise exception 'Past SOAs must use a previous month'; end if;
      if not coalesce(new.historical,false) and new.billing_month<current_month then raise exception 'New SOAs cannot use a past billing month'; end if;
    end if;
    -- Existing legacy due dates remain unchanged during payment updates.
    if new.due_date is not distinct from old.due_date and new.period_start is not distinct from old.period_start and new.period_end is not distinct from old.period_end then return new; end if;
  end if;
  if new.due_date<new.period_end then raise exception 'Due date cannot be before the billing period ends'; end if;
  return new;
end $$;
drop trigger if exists bills_validate_soa_dates on public.bills;
create trigger bills_validate_soa_dates before insert or update on public.bills for each row execute function public.validate_soa_dates();

create or replace function public.create_staff_bill_period(
  p_customer_id uuid,p_billing_month date,p_due_date date,p_period_start date,p_period_end date,
  p_current_reading numeric,p_first_previous_reading numeric default null,p_usage_m3 numeric default null,
  p_rate_per_m3 numeric default null,p_adjustment_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare bill_id uuid; current_month date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;
begin
  if public.get_my_role() is null or public.get_my_role() not in ('admin','cashier') then raise exception 'Staff access required'; end if;
  if p_billing_month is null or p_billing_month<current_month then raise exception 'New SOAs cannot use a past billing month'; end if;
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start or p_due_date is null or p_due_date<p_period_end then raise exception 'Invalid billing period or due date'; end if;
  -- The existing RPC performs all meter, duplicate, charge and pending-SOA checks.
  -- Set the custom period before encoding a pending row so date validation uses it.
  perform 1 from public.customers where id=p_customer_id for update;
  update public.bills set period_start=p_period_start,period_end=p_period_end,due_date=p_due_date
    where customer_id=p_customer_id and billing_month=p_billing_month and status='pending';
  perform set_config('app.soa_dates',jsonb_build_object('customer',p_customer_id,'month',p_billing_month,'start',p_period_start,'end',p_period_end)::text,true);
  bill_id:=public.create_staff_bill(p_customer_id,p_billing_month,p_due_date,p_current_reading,p_first_previous_reading,p_usage_m3,p_rate_per_m3,p_adjustment_note);
  perform set_config('app.soa_dates','',true);
  update public.bills set period_start=p_period_start,period_end=p_period_end,due_date=p_due_date where id=bill_id;
  return bill_id;
end $$;

create or replace function public.save_customer_record_period(p_customer uuid,p_action text,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare start_date date:=(p_data->>'period_start')::date; end_date date:=(p_data->>'period_end')::date;
  month_date date:=(p_data->>'month')::date; due date:=(p_data->>'due')::date;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
  if p_action<>'bill' then raise exception 'This action only adds past SOAs'; end if;
  if month_date is null or month_date>=date_trunc('month',now() at time zone 'Asia/Manila')::date then raise exception 'Past SOAs must use a previous month'; end if;
  if start_date is null or end_date is null or end_date<start_date or due is null or due<end_date then raise exception 'Invalid billing period or due date'; end if;
  perform set_config('app.soa_dates',jsonb_build_object('customer',p_customer,'month',month_date,'start',start_date,'end',end_date)::text,true);
  perform public.save_customer_record(p_customer,p_action,p_data);
  perform set_config('app.soa_dates','',true);
  update public.bills set period_start=start_date,period_end=end_date,due_date=due
    where customer_id=p_customer and billing_month=month_date and historical;
end $$;
revoke all on function public.create_staff_bill_period(uuid,date,date,date,date,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.create_staff_bill_period(uuid,date,date,date,date,numeric,numeric,numeric,numeric,text) to authenticated;
revoke all on function public.save_customer_record_period(uuid,text,jsonb) from public,anon;
grant execute on function public.save_customer_record_period(uuid,text,jsonb) to authenticated;
-- Pending SOAs use the same calendar-month due date convention.
create or replace function public.generate_monthly_pending_soas(p_target_month date default null)
returns table(generated_count integer, target_month date)
language plpgsql security definer set search_path = public as $body$
declare
  v_role text := public.get_my_role();
  v_month date;
  v_now date := (now() at time zone 'Asia/Manila')::date;
  v_cust record;
  v_prev_reading numeric;
  v_prior_bal numeric;
  v_due_date date;
  v_count integer := 0;
begin
  if v_role not in ('admin', 'cashier') then
    raise exception 'Staff access required';
  end if;

  if p_target_month is null then
    v_month := date_trunc('month', v_now)::date;
  else
    v_month := date_trunc('month', p_target_month)::date;
  end if;

  v_due_date := (v_month + interval '1 month - 1 day')::date + 10;

  for v_cust in select * from public.customers where status = 'active' loop
    if not exists (select 1 from public.bills where customer_id = v_cust.id and billing_month = v_month) then
      -- Get latest reading from previous bills
      select current_reading into v_prev_reading
      from public.bills
      where customer_id = v_cust.id and current_reading is not null and billing_month < v_month
      order by billing_month desc
      limit 1;

      if v_prev_reading is null then
        v_prev_reading := coalesce(v_cust.initial_reading, 0);
      end if;

      -- Get previous unpaid balance
      select coalesce(sum(balance), 0) into v_prior_bal
      from public.bills
      where customer_id = v_cust.id and balance > 0 and status in ('unpaid', 'partial');

      insert into public.bills (
        customer_id,
        billing_month,
        bill_date,
        due_date,
        previous_reading,
        current_reading,
        water_used,
        rate_per_m3,
        amount,
        amount_paid,
        balance,
        status,
        previous_balance,
        total_amount,
        usage_m3
      ) values (
        v_cust.id,
        v_month,
        v_now,
        v_due_date,
        v_prev_reading,
        null,
        null,
        0,
        null,
        0,
        v_prior_bal,
        'pending',
        v_prior_bal,
        null,
        null
      );

      v_count := v_count + 1;
    end if;
  end loop;

  return query select v_count, v_month;
end;
$body$;
commit;
