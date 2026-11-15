begin;
create or replace function public.record_selected_staff_payment(
  p_request_id uuid,p_customer_id uuid,p_amount numeric,p_bill_ids uuid[],p_method text,p_reference_no text default null,p_tendered numeric default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_customer public.customers%rowtype; v_remaining numeric; v_total numeric; v_take numeric;
  v_bill public.bills%rowtype; v_first uuid; v_id uuid; v_selected_total numeric;
begin
  if public.get_my_role() is null or public.get_my_role() not in ('admin','cashier') then raise exception 'Staff access required'; end if;
  if p_bill_ids is null or cardinality(p_bill_ids)=0 then raise exception 'Select at least one unpaid bill'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  if p_method not in ('Cash','GCash','Bank Transfer') then raise exception 'Invalid payment method'; end if;
  if p_method <> 'Cash' and nullif(trim(coalesce(p_reference_no,'')),'') is null then raise exception 'Reference number is required'; end if;
  if p_method='Cash' and (p_tendered is null or p_tendered < p_amount) then raise exception 'Cash tendered must cover the payment'; end if;
  select * into v_customer from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  select id into v_id from public.payments where request_id=p_request_id;
  if found then return v_id; end if;
  if exists(select 1 from unnest(p_bill_ids) as selected(id) left join public.bills b on b.id=selected.id where b.id is null or b.customer_id<>p_customer_id or b.balance<=0) then raise exception 'Selected bills must be unpaid and belong to this customer'; end if;
  select coalesce(sum(balance),0) into v_selected_total from public.bills where id=any(p_bill_ids) and customer_id=p_customer_id;
  if p_amount>v_selected_total then raise exception 'Payment exceeds selected bill balances'; end if;
  select coalesce(sum(balance),0) into v_total from public.bills where customer_id=p_customer_id and balance>0;
  if p_amount > v_total then raise exception 'Payment exceeds the running balance; customer credit is available in Phase 3'; end if;
  select id into v_first from public.bills where customer_id=p_customer_id and balance>0 and id=any(p_bill_ids)
    order by due_date,billing_month,id limit 1;
  insert into public.payments(bill_id,customer_id,or_number,amount,method,reference_no,
    tendered,change_amount,balance_after,collected_by,request_id)
  values(v_first,p_customer_id,public.next_or_number(),p_amount,p_method,nullif(trim(p_reference_no),''),
    case when p_method='Cash' then p_tendered else null end,
    case when p_method='Cash' then p_tendered-p_amount else 0 end,v_total-p_amount,auth.uid(),p_request_id)
  returning id into v_id;
  v_remaining := p_amount;
  for v_bill in select * from public.bills where customer_id=p_customer_id and balance>0 and id=any(p_bill_ids)
      order by due_date,billing_month,id for update loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining,v_bill.balance);
    insert into public.payment_allocations(payment_id,bill_id,amount) values(v_id,v_bill.id,v_take);
    perform public.refresh_bill_from_allocations(v_bill.id);
    v_remaining := v_remaining-v_take;
  end loop;
  return v_id;
end;
$$;

revoke all on function public.record_selected_staff_payment(uuid,uuid,numeric,uuid[],text,text,numeric) from public,anon;
grant execute on function public.record_selected_staff_payment(uuid,uuid,numeric,uuid[],text,text,numeric) to authenticated;
commit;
