-- Unique Market: realtime in-app notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep notification creation server-side through trusted database triggers.
create or replace function public.create_role_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
  values (p_user_id,p_type,p_title,p_message,p_entity_type,p_entity_id);
end;
$$;

create or replace function public.notify_complaint_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_ticket text;
  v_title text;
  v_message text;
begin
  v_ticket := coalesce(new.ticket_no, new.title, 'Complaint');

  if tg_op = 'INSERT' then
    v_title := 'New Complaint Raised';
    v_message := v_ticket || ' has been raised by ' || coalesce(new.customer_name, 'customer') || '.';

    -- Customer confirmation
    perform public.create_role_notification(new.customer_id, 'complaint_raised', v_title, 'Your complaint ' || v_ticket || ' has been raised successfully.', 'complaint', new.id);

    -- All admins
    for p in select id from public.profiles where role = 'admin' loop
      perform public.create_role_notification(p.id, 'complaint_raised', v_title, v_message, 'complaint', new.id);
    end loop;

    -- Assigned technician, if one was already supplied at creation.
    perform public.create_role_notification(new.technician_id, 'complaint_assigned', 'Complaint Assigned', v_ticket || ' has been assigned to you.', 'complaint', new.id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.technician_id is distinct from old.technician_id and new.technician_id is not null then
      perform public.create_role_notification(new.technician_id, 'complaint_assigned', 'New Complaint Assigned', v_ticket || ' has been assigned to you.', 'complaint', new.id);
      perform public.create_role_notification(new.customer_id, 'complaint_assigned', 'Technician Assigned', 'A technician has been assigned to complaint ' || v_ticket || '.', 'complaint', new.id);
      for p in select id from public.profiles where role = 'admin' loop
        perform public.create_role_notification(p.id, 'complaint_assigned', 'Technician Assigned', v_ticket || ' has been assigned to a technician.', 'complaint', new.id);
      end loop;
    end if;

    if new.status is distinct from old.status then
      perform public.create_role_notification(new.customer_id, 'complaint_status', 'Complaint Status Updated', v_ticket || ' status changed to ' || coalesce(replace(new.status,'_',' '),'updated') || '.', 'complaint', new.id);
      perform public.create_role_notification(new.technician_id, 'complaint_status', 'Complaint Status Updated', v_ticket || ' status changed to ' || coalesce(replace(new.status,'_',' '),'updated') || '.', 'complaint', new.id);
      for p in select id from public.profiles where role = 'admin' loop
        perform public.create_role_notification(p.id, 'complaint_status', 'Complaint Status Updated', v_ticket || ' status changed to ' || coalesce(replace(new.status,'_',' '),'updated') || '.', 'complaint', new.id);
      end loop;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists complaints_notify_event on public.complaints;
create trigger complaints_notify_event
after insert or update of technician_id,status on public.complaints
for each row execute function public.notify_complaint_event();

create or replace function public.notify_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_status text := coalesce(new.status, 'confirmed');
  v_amount text := to_char(coalesce(new.amount,0), 'FM999999990.00');
begin
  -- A payment record means payment activity; only confirmed payments are
  -- announced as received. Pending UPI payments are announced separately.
  if tg_op = 'INSERT' then
    if v_status = 'confirmed' then
      perform public.create_role_notification(new.customer_id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' has been received.', 'payment', new.id);
      for p in select id from public.profiles where role = 'admin' loop
        perform public.create_role_notification(p.id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' received from customer.', 'payment', new.id);
      end loop;
      perform public.create_role_notification(new.recorded_by, 'payment_received', 'Payment Recorded', 'Payment of ₹' || v_amount || ' has been recorded successfully.', 'payment', new.id);
    elsif v_status = 'pending' then
      for p in select id from public.profiles where role = 'admin' loop
        perform public.create_role_notification(p.id, 'payment_pending', 'Payment Pending', 'Customer has submitted a payment of ₹' || v_amount || ' for verification.', 'payment', new.id);
      end loop;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.create_role_notification(new.customer_id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' has been confirmed.', 'payment', new.id);
      for p in select id from public.profiles where role = 'admin' loop
        perform public.create_role_notification(p.id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' has been confirmed.', 'payment', new.id);
      end loop;
      perform public.create_role_notification(new.recorded_by, 'payment_received', 'Payment Confirmed', 'Payment of ₹' || v_amount || ' has been confirmed.', 'payment', new.id);
    elsif new.status = 'rejected' then
      perform public.create_role_notification(new.customer_id, 'payment_rejected', 'Payment Rejected', 'Payment of ₹' || v_amount || ' was rejected.', 'payment', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_notify_event on public.payments;
create trigger payments_notify_event
after insert or update of status on public.payments
for each row execute function public.notify_payment_event();

-- Supabase Realtime listens to changes on this table.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then
    null;
  end;
end $$;
