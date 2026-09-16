-- Public service tracking: exposes only non-sensitive complaint fields by ticket number.
create or replace function public.track_complaint(p_ticket_no text)
returns table (
  ticket_no text,
  customer_name text,
  title text,
  description text,
  category text,
  priority text,
  status text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.ticket_no,
         left(coalesce(c.customer_name, 'Customer'), 80),
         left(coalesce(c.title, ''), 160),
         left(coalesce(c.description, ''), 300),
         left(coalesce(c.category, ''), 40),
         left(coalesce(c.priority, 'normal'), 20),
         coalesce(c.status, 'open'),
         c.updated_at
  from public.complaints c
  where upper(trim(c.ticket_no)) = upper(trim(p_ticket_no))
  limit 1;
$$;

revoke all on function public.track_complaint(text) from public;
grant execute on function public.track_complaint(text) to anon, authenticated;
