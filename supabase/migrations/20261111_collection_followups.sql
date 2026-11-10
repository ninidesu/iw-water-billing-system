begin;
create table public.collection_followups (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 method text not null check(method in ('Phone call','Office visit','Field visit','Notice delivered')),
 notes text not null check(length(trim(notes)) between 1 and 2000),
 next_date date,
 promise_date date,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index on public.collection_followups(customer_id,created_at desc);
alter table public.collection_followups enable row level security;
create policy staff_read on public.collection_followups for select to authenticated using(public.get_my_role() in ('admin','cashier'));
create policy staff_insert on public.collection_followups for insert to authenticated with check(public.get_my_role() in ('admin','cashier') and created_by=auth.uid());
grant select,insert on public.collection_followups to authenticated;
commit;
