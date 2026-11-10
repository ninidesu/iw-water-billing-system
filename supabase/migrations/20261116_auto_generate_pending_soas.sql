-- Migration: Support Pending SOAs with automated generation and encoding

-- 1. Allow nullable current_reading, water_used, amount, and total_amount for unencoded/pending bills
alter table public.bills alter column current_reading drop not null;
alter table public.bills alter column water_used drop not null;
alter table public.bills alter column amount drop not null;
alter table public.bills alter column total_amount drop not null;

-- 2. Update status check to include 'pending'
alter table public.bills drop constraint if exists bills_status_check;
alter table public.bills add constraint bills_status_check check (status in ('pending', 'unpaid', 'partial', 'paid'));

-- 3. Update current_reading check constraint to allow null
alter table public.bills drop constraint if exists bills_current_reading_check;
alter table public.bills add constraint bills_current_reading_check check (current_reading is null or current_reading >= previous_reading);

-- 4. Update amount_paid check constraint to allow null amount
alter table public.bills drop constraint if exists amount_paid_within_bill;
alter table public.bills add constraint amount_paid_within_bill check (amount_paid >= 0 and (amount is null or amount_paid <= amount));

-- 5. Exempt pending SOA encoding from payment guard trigger
create or replace function public.guard_bill_payment_totals()
returns trigger language plpgsql set search_path = '' as $body$
begin
  -- Allow encoding pending bills (transitioning from 'pending' to 'unpaid' / 'partial' / 'paid' with its computed balance)
  if old.status = 'pending' then
    return new;
  end if;

  if auth.uid() is not null and pg_trigger_depth() = 1
    and (new.amount_paid is distinct from old.amount_paid or new.balance is distinct from old.balance
      or new.status is distinct from old.status) then
    raise exception 'Bill payment totals are updated from the payment ledger';
  end if;
  return new;
end;
$body$;

-- 6. Function to generate pending SOAs for active customers for a billing month
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

  v_due_date := v_month + interval '14 days';

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

revoke all on function public.generate_monthly_pending_soas(date) from public, anon;
grant execute on function public.generate_monthly_pending_soas(date) to authenticated;

-- 7. Update create_staff_bill to update pending SOAs seamlessly when encoded
create or replace function public.create_staff_bill(
  p_customer_id uuid,
  p_billing_month date,
  p_due_date date,
  p_current_reading numeric,
  p_first_previous_reading numeric default null,
  p_usage_m3 numeric default null,
  p_rate_per_m3 numeric default null,
  p_adjustment_note text default null
)
returns uuid language plpgsql security definer set search_path = public as $body$
declare
  v_role text := public.get_my_role();
  v_customer public.customers%rowtype;
  v_last public.bills%rowtype;
  v_existing_pending_id uuid;
  v_previous numeric;
  v_current numeric;
  v_meter_usage numeric;
  v_usage numeric;
  v_charge numeric;
  v_prior numeric;
  v_id uuid;
  v_date date;
  t record;
  v_line numeric;
  v_note text := nullif(trim(coalesce(p_adjustment_note,'')),'');
begin
  if v_role not in ('admin','cashier') then raise exception 'Staff access required'; end if;
  if extract(day from p_billing_month) <> 1 then raise exception 'Billing month must be the first day of a month'; end if;
  if p_usage_m3 is not null and p_usage_m3 < 0 then raise exception 'Adjusted usage must be nonnegative'; end if;
  if p_rate_per_m3 is not null and p_rate_per_m3 < 0 then raise exception 'Adjusted rate must be nonnegative'; end if;
  if (p_usage_m3 is not null or p_rate_per_m3 is not null) and v_note is null then
    raise exception 'An adjustment note is required';
  end if;

  select * into v_customer from public.customers where id=p_customer_id for update;
  if not found or v_customer.status <> 'active' then raise exception 'Select an active customer'; end if;

  -- Check if a finalized bill already exists
  if exists(select 1 from public.bills where customer_id=p_customer_id and billing_month=p_billing_month and status <> 'pending') then
    raise exception 'A finalized bill already exists for this customer and month';
  end if;

  -- Check for existing pending bill to update
  select id into v_existing_pending_id from public.bills where customer_id=p_customer_id and billing_month=p_billing_month and status = 'pending';

  select * into v_last from public.bills where customer_id=p_customer_id and (status <> 'pending' or billing_month < p_billing_month) order by billing_month desc limit 1;
  if found and p_billing_month < v_last.billing_month then raise exception 'Choose a month on or after the latest bill'; end if;

  v_previous := case when v_last.id is null then coalesce(p_first_previous_reading,0) else v_last.current_reading end;
  if p_current_reading is null or p_current_reading < v_previous then
    raise exception 'Current reading must be at least the previous reading';
  end if;
  v_meter_usage := p_current_reading-v_previous;
  v_usage := coalesce(p_usage_m3,v_meter_usage);
  v_current := case when p_usage_m3 is null then p_current_reading else v_previous+v_usage end;

  if p_rate_per_m3 is null then
    v_charge := public.compute_water_charge(v_usage);
  else
    v_charge := round(v_usage*p_rate_per_m3,2);
  end if;
  select coalesce(sum(balance),0) into v_prior from public.bills where customer_id=p_customer_id and balance>0 and id is distinct from v_existing_pending_id;
  select max(effective_from) into v_date from public.rate_tiers where is_active and effective_from<=(now() at time zone 'Asia/Manila')::date;

  if v_existing_pending_id is not null then
    update public.bills set
      due_date = p_due_date,
      previous_reading = v_previous,
      current_reading = v_current,
      rate_per_m3 = coalesce(p_rate_per_m3, 0),
      water_charge = v_charge,
      previous_balance = v_prior,
      usage_m3 = v_usage,
      water_used = v_usage,
      amount = v_charge + v_prior,
      total_amount = v_charge + v_prior,
      balance = (v_charge + v_prior) - coalesce(amount_paid, 0),
      status = case when coalesce(amount_paid, 0) >= (v_charge + v_prior) then 'paid'
                    when coalesce(amount_paid, 0) > 0 then 'partial'
                    else 'unpaid' end,
      created_by = auth.uid(),
      usage_adjusted = (p_usage_m3 is not null),
      rate_adjusted = (p_rate_per_m3 is not null),
      adjustment_note = v_note
    where id = v_existing_pending_id
    returning id into v_id;

    delete from public.bill_items where bill_id = v_id;
  else
    insert into public.bills(customer_id,billing_month,due_date,previous_reading,current_reading,
      rate_per_m3,water_charge,previous_balance,usage_m3,total_amount,amount,balance,status,created_by,
      usage_adjusted,rate_adjusted,adjustment_note,water_used)
    values(p_customer_id,p_billing_month,p_due_date,v_previous,v_current,
      coalesce(p_rate_per_m3,0),v_charge,v_prior,v_usage,v_charge+v_prior,v_charge+v_prior,v_charge+v_prior,'unpaid',auth.uid(),
      p_usage_m3 is not null,p_rate_per_m3 is not null,v_note,v_usage)
    returning id into v_id;
  end if;

  if p_rate_per_m3 is not null then
    insert into public.bill_items(bill_id,description,quantity,unit_rate,amount)
    values(v_id,'Staff-adjusted cubic charge',v_usage,p_rate_per_m3,v_charge);
  else
    for t in select * from public.rate_tiers where effective_from=v_date and is_active order by min_m3 loop
      v_line := case when t.fixed_charge is not null then t.fixed_charge
        else greatest(least(v_usage,coalesce(t.max_m3,v_usage))-t.min_m3,0)*t.rate_per_m3 end;
      if v_line > 0 then
        insert into public.bill_items(bill_id,description,quantity,unit_rate,amount)
        values(v_id,case when t.fixed_charge is not null then 'Minimum charge (0-10 m3)'
          else (t.min_m3+1)::text || '-' || coalesce(t.max_m3::text,'above') || ' m3' end,
          case when t.fixed_charge is not null then least(v_usage,coalesce(t.max_m3,v_usage))
            else greatest(least(v_usage,coalesce(t.max_m3,v_usage))-t.min_m3,0) end,
          case when t.fixed_charge is not null then null else t.rate_per_m3 end,round(v_line,2));
      end if;
    end loop;
  end if;

  if p_usage_m3 is not null or p_rate_per_m3 is not null then
    insert into public.billing_adjustments(bill_id,usage_m3,rate_per_m3,note,adjusted_by)
    values(v_id,p_usage_m3,p_rate_per_m3,v_note,auth.uid());
  end if;
  return v_id;
end;
$body$;

revoke all on function public.create_staff_bill(uuid,date,date,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.create_staff_bill(uuid,date,date,numeric,numeric,numeric,numeric,text) to authenticated;
