-- Customer ID + public service tracking.
-- Customer IDs use the financial-year format UM26/27-01 and reset each April.

alter table public.profiles
  add column if not exists customer_code text;

create unique index if not exists profiles_customer_code_unique
  on public.profiles(customer_code)
  where customer_code is not null;

create or replace function public.assign_customer_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fy text;
  n bigint;
begin
  if new.role <> 'customer' or coalesce(nullif(btrim(new.customer_code), ''), '') <> '' then
    return new;
  end if;

  fy := case
    when extract(month from now()) >= 4 then
      to_char(extract(year from now())::int % 100, 'FM00') || '/' ||
      to_char((extract(year from now())::int + 1) % 100, 'FM00')
    else
      to_char((extract(year from now())::int - 1) % 100, 'FM00') || '/' ||
      to_char(extract(year from now())::int % 100, 'FM00')
  end;

  select coalesce(max((regexp_match(customer_code, '/([0-9]+)$'))[1]::bigint), 0) + 1
    into n
  from public.profiles
  where role = 'customer'
    and customer_code like 'UM' || fy || '/%';

  new.customer_code := 'UM' || fy || '/' || lpad(n::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists profiles_assign_customer_code on public.profiles;
create trigger profiles_assign_customer_code
before insert on public.profiles
for each row execute function public.assign_customer_code();

create or replace function public.public_service_status(p_reference text)
returns table (
  ticket_no text,
  customer_code text,
  status text,
  category text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.ticket_no,
         p.customer_code,
         coalesce(c.status, 'open'),
         c.category,
         c.created_at,
         c.updated_at
  from public.complaints c
  left join public.profiles p on p.id = c.customer_id
  where upper(trim(c.ticket_no)) = upper(trim(p_reference))
     or upper(trim(coalesce(p.customer_code, ''))) = upper(trim(p_reference))
  order by c.created_at desc
  limit 1;
$$;

revoke all on function public.public_service_status(text) from public;
grant execute on function public.public_service_status(text) to anon, authenticated;
