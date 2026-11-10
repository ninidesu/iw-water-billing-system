begin;
alter table public.contract_accounts add column if not exists property_type text;
alter table public.bills add column if not exists historical boolean not null default false;
alter table public.payments add column if not exists historical boolean not null default false;
create table public.account_activity (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 actor uuid not null references auth.users(id),
 action text not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.account_activity enable row level security;
create policy staff_read on public.account_activity for select to authenticated using(public.get_my_role() in ('admin','cashier'));
grant select on public.account_activity to authenticated;
create function public.save_customer_record(p_customer uuid,p_action text,p_data jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare a uuid; b public.bills%rowtype; v_id uuid; v_amount numeric; v_before jsonb;
begin
 if public.get_my_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
 perform 1 from public.customers where id=p_customer for update;
 if not found then raise exception 'Customer not found'; end if;
 select id,to_jsonb(contract_accounts) into a,v_before from public.contract_accounts where legacy_customer_id=p_customer;
 if a is null then raise exception 'Service account not found'; end if;
 if p_action='profile' then
   if nullif(trim(p_data->>'name'),'') is null or nullif(trim(p_data->>'mobile'),'') is null or nullif(trim(p_data->>'address'),'') is null or nullif(trim(p_data->>'type'),'') is null then raise exception 'Complete required fields'; end if;
   update public.contract_accounts set account_name=trim(p_data->>'name'),service_address=trim(p_data->>'address'),property_type=p_data->>'type',updated_at=now() where id=a;
   update public.customers set address=trim(p_data->>'address'),contact_no=trim(p_data->>'mobile'),updated_at=now() where id=p_customer;
   insert into public.account_contacts(account_id,phone,email) values(a,p_data->>'mobile',nullif(p_data->>'email','')) on conflict(account_id) do update set phone=excluded.phone,email=excluded.email,updated_at=now();
 elsif p_action='bill' then
   if (p_data->>'month')::date > (now() at time zone 'Asia/Manila')::date then raise exception 'Historical billing cannot be future dated'; end if;
   if exists(select 1 from public.customer_migrations where customer_id=p_customer and opening_balance>0) then raise exception 'Reconcile the recorded opening balance before adding past bills to avoid counting debt twice'; end if;
   v_amount:=(p_data->>'amount')::numeric;
   if v_amount is null or v_amount<0 then raise exception 'Invalid charge'; end if;
   insert into public.bills(customer_id,account_id,bill_no,billing_month,bill_date,due_date,previous_reading,current_reading,rate_per_m3,water_charge,usage_m3,total_amount,previous_balance,created_by,historical)
   values(p_customer,a,coalesce(nullif(trim(p_data->>'number'),''),'HIST-'||gen_random_uuid()::text),(p_data->>'month')::date,(p_data->>'date')::date,(p_data->>'due')::date,(p_data->>'previous')::numeric,(p_data->>'current')::numeric,0,v_amount,(p_data->>'current')::numeric-(p_data->>'previous')::numeric,v_amount,0,auth.uid(),true);
 elsif p_action='payment' then
   select * into b from public.bills where id=(p_data->>'bill')::uuid and customer_id=p_customer for update;
   if not found or not b.historical then raise exception 'Select a historical bill'; end if;
   v_amount:=(p_data->>'amount')::numeric;
   if v_amount is null or v_amount<=0 or v_amount>b.balance then raise exception 'Payment must be positive and within bill balance'; end if;
   if (p_data->>'date')::date > (now() at time zone 'Asia/Manila')::date or (p_data->>'date')::date<b.bill_date then raise exception 'Invalid original payment date'; end if;
   insert into public.payments(bill_id,customer_id,amount,method,or_number,paid_at,collected_by,historical,balance_after)
   values(b.id,p_customer,v_amount,p_data->>'method',nullif(trim(p_data->>'number'),''),((p_data->>'date')::date::timestamp at time zone 'Asia/Manila'),auth.uid(),true,b.balance-v_amount) returning id into v_id;
   insert into public.payment_allocations values(v_id,b.id,v_amount);
   perform public.refresh_bill_from_allocations(b.id);
 else raise exception 'Unknown action';
 end if;
 insert into public.account_activity(customer_id,actor,action,details) values(p_customer,auth.uid(),p_action,jsonb_build_object('entered',p_data,'previous_account',case when p_action='profile' then v_before else null end));
end $$;
revoke all on function public.save_customer_record(uuid,text,jsonb) from public,anon;
grant execute on function public.save_customer_record(uuid,text,jsonb) to authenticated;
commit;
