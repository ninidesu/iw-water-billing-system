-- Run in the Supabase SQL Editor of a test project with the existing-customer
-- and billing-period migrations applied. No CANs or other inputs are needed.
-- Assignments: two 1-month accounts, one 2-month account, one 3+ month account.
begin;

create temporary table overdue_examples (
  meter text primary key,
  account_name text not null,
  service_address text not null,
  readings numeric[] not null,
  starting_reading numeric not null
) on commit drop;

-- Consumption per bill in m³, oldest cycle first.
insert into overdue_examples values
  ('IW-84182', 'Maribel Dacillo', 'Brgy. Libertad, Isabel, Leyte', array[14.50], 138.00),
  ('IW-84193', 'Ramon Villareal', 'Brgy. Marvel, Isabel, Leyte', array[19.25], 206.50),
  ('IW-84204', 'Liza Montellano', 'Brgy. Matlang, Isabel, Leyte', array[13.00, 16.75], 94.00),
  ('IW-84215', 'Ernesto Calapano', 'Brgy. Tolingon, Isabel, Leyte', array[21.50, 17.00, 19.00], 282.00);

do $$
declare
  as_of date := (now() at time zone 'Asia/Manila')::date;
  month_start date := date_trunc('month', as_of)::date;
  example record;
  customer_uuid uuid;
  account_uuid uuid;
  new_can text;
  cycle integer;
  months_back integer;
  period_first date;
  period_last date;
  due date;
  previous numeric;
  reading numeric;
begin
  lock table public.contract_accounts in share row exclusive mode;

  if exists (
    select 1 from overdue_examples e
    where exists (select 1 from public.customers c where upper(c.meter_no) = e.meter)
       or exists (select 1 from public.contract_accounts a where upper(a.meter_no) = e.meter)
  ) then
    raise exception 'At least one example meter already exists. No accounts or bills were added.';
  end if;

  for example in select * from overdue_examples order by meter loop
    loop
      new_can := floor(100000000 + random() * 900000000)::bigint::text;
      exit when not exists (select 1 from public.contract_accounts where can = new_can);
    end loop;

    insert into public.customers (id, address, meter_no, status)
    values (gen_random_uuid(), example.service_address, example.meter, 'active')
    returning id into customer_uuid;

    insert into public.contract_accounts (
      can, legacy_customer_id, account_name, service_address, meter_no, installation_reading, status
    ) values (
      new_can, customer_uuid, example.account_name, example.service_address,
      example.meter, example.starting_reading, 'active'
    ) returning id into account_uuid;

    previous := example.starting_reading;
    for cycle in 1..cardinality(example.readings) loop
      months_back := cardinality(example.readings) - cycle + 1;
      period_first := (month_start - make_interval(months => months_back))::date;
      period_last := (period_first + interval '1 month')::date - 1;
      due := greatest(period_last, as_of - (8 + (months_back - 1) * 30));
      reading := previous + example.readings[cycle];

      insert into public.bills (
        customer_id, account_id, billing_month, period_start, period_end,
        bill_date, due_date, previous_reading, current_reading, rate_per_m3,
        water_charge, usage_m3, total_amount, previous_balance, amount_paid, historical
      ) values (
        customer_uuid, account_uuid, period_first, period_first, period_last,
        period_last, due, previous, reading, 8,
        example.readings[cycle] * 8, example.readings[cycle],
        example.readings[cycle] * 8, 0, 0, true
      );
      previous := reading;
    end loop;
  end loop;
end $$;

select a.account_name, a.can, a.meter_no, b.billing_month, b.bill_no, b.due_date, b.status, b.balance
from public.bills b
join public.contract_accounts a on a.id = b.account_id
join overdue_examples e on e.meter = a.meter_no
where b.due_date < (now() at time zone 'Asia/Manila')::date and b.balance > 0
order by a.can, b.billing_month;

-- Replace with ROLLBACK for a dry run.
commit;
