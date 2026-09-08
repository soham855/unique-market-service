-- Unique Market complaint numbering
-- Format: UM-YYZZ/NN where YYZZ is the financial year (April-March).
-- The numeric sequence is GLOBAL and NEVER resets. Only the FY prefix changes.
-- Existing ticket_no values are preserved.

alter table public.complaints
  add column if not exists ticket_no text;

create table if not exists public.complaint_ticket_counter (
  id boolean primary key default true check (id),
  next_number bigint not null
);

-- Seed the global counter from the highest numeric suffix already present.
do $$
declare
  v_next bigint;
begin
  select coalesce(max((regexp_match(ticket_no, '/([0-9]+)$'))[1]::bigint), 0) + 1
    into v_next
  from public.complaints
  where ticket_no is not null and ticket_no ~ '/[0-9]+$';

  insert into public.complaint_ticket_counter(id, next_number)
  values (true, greatest(v_next, 1))
  on conflict (id) do nothing;
end $$;

create or replace function public.complaint_financial_year(p_date timestamptz)
returns text
language sql
immutable
as $$
  select case
    when extract(month from p_date) >= 4 then
      to_char(extract(year from p_date)::int % 100, 'FM00') ||
      to_char((extract(year from p_date)::int + 1) % 100, 'FM00')
    else
      to_char((extract(year from p_date)::int - 1) % 100, 'FM00') ||
      to_char(extract(year from p_date)::int % 100, 'FM00')
  end;
$$;

-- Backfill only rows that have no ticket number. Existing values are untouched.
-- Backfilled rows consume numbers from the same global sequence.
do $$
declare
  r record;
  v_number bigint;
begin
  for r in
    select id, coalesce(created_at, now()) as created_at
    from public.complaints
    where ticket_no is null or btrim(ticket_no) = ''
    order by created_at, id
  loop
    update public.complaint_ticket_counter
       set next_number = next_number + 1
     where id = true
     returning next_number - 1 into v_number;

    if v_number is null then
      insert into public.complaint_ticket_counter(id, next_number)
      values (true, 2);
      v_number := 1;
    end if;

    update public.complaints
       set ticket_no = 'UM-' || public.complaint_financial_year(r.created_at) || '/' || lpad(v_number::text, 2, '0')
     where id = r.id;
  end loop;
end $$;

create or replace function public.assign_complaint_ticket_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
  v_date timestamptz;
begin
  -- Never replace an existing ticket number.
  if new.ticket_no is not null and btrim(new.ticket_no) <> '' then
    return new;
  end if;

  v_date := coalesce(new.created_at, now());

  -- Atomic counter update is safe for concurrent complaint creation.
  update public.complaint_ticket_counter
     set next_number = next_number + 1
   where id = true
   returning next_number - 1 into v_number;

  if v_number is null then
    insert into public.complaint_ticket_counter(id, next_number)
    values (true, 2)
    on conflict (id) do update set next_number = public.complaint_ticket_counter.next_number + 1;
    select next_number - 1 into v_number
    from public.complaint_ticket_counter
    where id = true;
  end if;

  new.ticket_no := 'UM-' || public.complaint_financial_year(v_date) || '/' || lpad(v_number::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists complaints_assign_ticket_no on public.complaints;
create trigger complaints_assign_ticket_no
before insert on public.complaints
for each row execute function public.assign_complaint_ticket_no();

-- Ticket numbers are immutable after creation.
create or replace function public.prevent_complaint_ticket_no_change()
returns trigger
language plpgsql
as $$
begin
  if old.ticket_no is distinct from new.ticket_no then
    raise exception 'Complaint ticket number cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_ticket_no_immutable on public.complaints;
create trigger complaints_ticket_no_immutable
before update of ticket_no on public.complaints
for each row execute function public.prevent_complaint_ticket_no_change();

create unique index if not exists complaints_ticket_no_unique
  on public.complaints(ticket_no)
  where ticket_no is not null;
