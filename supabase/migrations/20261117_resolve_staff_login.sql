-- Secure helper to allow internal staff (admin and cashier) to log in with their email or username
create or replace function public.resolve_staff_login(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $func$
declare
  v_id text := lower(trim(coalesce(p_identifier, '')));
  v_email text;
begin
  if v_id = '' then
    return null;
  end if;

  -- 1. Exact email match among staff
  select u.email into v_email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role in ('admin', 'cashier')
    and lower(u.email) = v_id
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 2. Exact email prefix match (e.g. 'admin' for 'admin@isabelwaters.com')
  select u.email into v_email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role in ('admin', 'cashier')
    and lower(split_part(u.email, '@', 1)) = v_id
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 3. Normalized prefix match (stripping spaces, underscores, hyphens)
  select u.email into v_email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role in ('admin', 'cashier')
    and regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9]', '', 'g') = regexp_replace(v_id, '[^a-z0-9]', '', 'g')
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 4. Match against profile full_name (e.g. 'admin 1', 'Cashier', 'Administrator')
  select u.email into v_email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role in ('admin', 'cashier')
    and regexp_replace(lower(p.full_name), '[^a-z0-9]', '', 'g') = regexp_replace(v_id, '[^a-z0-9]', '', 'g')
  limit 1;

  return v_email;
end;
$func$;

revoke all on function public.resolve_staff_login(text) from public;
grant execute on function public.resolve_staff_login(text) to anon, authenticated;
