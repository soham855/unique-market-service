-- Unique Market: single WhatsApp outbox for service lifecycle + payments.
-- All customer-facing WhatsApp events are created by database triggers, so
-- every client/admin/technician path uses the same pipeline.

create table if not exists public.whatsapp_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text,
  event_type text not null,
  phone text,
  customer_phone text,
  message text not null,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_notification_events
  add column if not exists event_key text;
alter table public.whatsapp_notification_events
  add column if not exists phone text;
alter table public.whatsapp_notification_events
  add column if not exists customer_phone text;
alter table public.whatsapp_notification_events
  add column if not exists event_type text;
alter table public.whatsapp_notification_events
  add column if not exists message text;
alter table public.whatsapp_notification_events
  add column if not exists status text default 'pending';
alter table public.whatsapp_notification_events
  add column if not exists error_message text;
alter table public.whatsapp_notification_events
  add column if not exists sent_at timestamptz;
alter table public.whatsapp_notification_events
  add column if not exists created_at timestamptz default now();

update public.whatsapp_notification_events
set event_key = 'legacy:' || id::text
where event_key is null;

create unique index if not exists whatsapp_notification_events_event_key_uidx
  on public.whatsapp_notification_events(event_key);

create index if not exists whatsapp_notification_events_pending_idx
  on public.whatsapp_notification_events(status, created_at);

alter table public.whatsapp_notification_events enable row level security;
revoke all on public.whatsapp_notification_events from anon, authenticated;

create or replace function public.enqueue_whatsapp_event(
  p_event_key text,
  p_event_type text,
  p_phone text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_phone,'')), '') is null
     or nullif(trim(coalesce(p_message,'')), '') is null then
    return;
  end if;

  insert into public.whatsapp_notification_events(
    event_key, event_type, phone, customer_phone, message, status
  )
  values (
    p_event_key,
    p_event_type,
    regexp_replace(p_phone, '\\D', '', 'g'),
    regexp_replace(p_phone, '\\D', '', 'g'),
    p_message,
    'pending'
  )
  on conflict (event_key) do nothing;
end;
$$;

-- Customer complaint lifecycle:
-- INSERT       -> Raise Request
-- status=assigned -> Accept
-- status=resolved/closed -> Complete
create or replace function public.enqueue_complaint_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket text := coalesce(new.ticket_no, new.title, 'Complaint');
  v_phone text := coalesce(new.customer_phone, '');
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_whatsapp_event(
      'complaint:' || new.id::text || ':raised',
      'complaint_raised',
      v_phone,
      'Unique Market: Your service request ' || v_ticket ||
      ' has been raised successfully. We will process your request shortly.'
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'assigned' then
      perform public.enqueue_whatsapp_event(
        'complaint:' || new.id::text || ':accepted',
        'complaint_accepted',
        v_phone,
        'Unique Market: Your service request ' || v_ticket ||
        ' has been accepted and assigned to a technician.'
      );
    elsif new.status in ('resolved','closed')
          and old.status not in ('resolved','closed') then
      perform public.enqueue_whatsapp_event(
        'complaint:' || new.id::text || ':completed',
        'complaint_completed',
        v_phone,
        'Unique Market: Your service request ' || v_ticket ||
        ' has been completed. Thank you for choosing Unique Market.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists complaints_whatsapp_outbox on public.complaints;
create trigger complaints_whatsapp_outbox
after insert or update of status on public.complaints
for each row execute function public.enqueue_complaint_whatsapp();

-- Payment collection:
-- A payment row is the single source event, regardless of whether it was
-- entered by Customer or Technician. This avoids duplicate WhatsApp sends.
create or replace function public.enqueue_payment_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_amount text := to_char(coalesce(new.amount,0), 'FM999999990.00');
  v_ref text := nullif(trim(coalesce(new.reference_no,'')), '');
begin
  select c.mobile into v_phone
  from public.customers c
  where c.id = new.customer_id
  limit 1;

  if nullif(trim(coalesce(v_phone,'')), '') is not null then
    perform public.enqueue_whatsapp_event(
      'payment:' || new.id::text || ':collect',
      'payment_collect',
      v_phone,
      'Unique Market: Payment of ₹' || v_amount ||
      ' has been ' ||
      case when coalesce(new.status,'confirmed') = 'pending'
        then 'submitted for verification'
        else 'collected/recorded'
      end ||
      case when v_ref is not null then '. UTR/Reference: ' || v_ref else '.' end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payments_whatsapp_outbox on public.payments;
create trigger payments_whatsapp_outbox
after insert on public.payments
for each row execute function public.enqueue_payment_whatsapp();
