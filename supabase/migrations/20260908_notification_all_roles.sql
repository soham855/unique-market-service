-- Ensure all three roles receive important service-desk notifications.
create or replace function public.notify_complaint_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_ticket text;
begin
  v_ticket := coalesce(new.ticket_no, new.title, 'Complaint');

  if tg_op = 'INSERT' then
    perform public.create_role_notification(new.customer_id, 'complaint_raised', 'New Complaint Raised', 'Your complaint ' || v_ticket || ' has been raised successfully.', 'complaint', new.id);

    for p in select id from public.profiles where role = 'admin' loop
      perform public.create_role_notification(p.id, 'complaint_raised', 'New Complaint Received', v_ticket || ' has been raised by ' || coalesce(new.customer_name, 'customer') || '.', 'complaint', new.id);
    end loop;

    for p in select id from public.profiles where role = 'technician' loop
      perform public.create_role_notification(p.id, 'complaint_raised', 'New Complaint Available', v_ticket || ' has been raised and needs service attention.', 'complaint', new.id);
    end loop;

    if new.technician_id is not null then
      perform public.create_role_notification(new.technician_id, 'complaint_assigned', 'Complaint Assigned', v_ticket || ' has been assigned to you.', 'complaint', new.id);
    end if;
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
  if tg_op = 'INSERT' then
    if v_status = 'confirmed' then
      perform public.create_role_notification(new.customer_id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' has been received.', 'payment', new.id);
      for p in select id from public.profiles where role in ('admin','technician') loop
        perform public.create_role_notification(p.id, 'payment_received', 'Payment Received', 'Payment of ₹' || v_amount || ' has been received.', 'payment', new.id);
      end loop;
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
      for p in select id from public.profiles where role in ('admin','technician') loop
        perform public.create_role_notification(p.id, 'payment_received', 'Payment Confirmed', 'Payment of ₹' || v_amount || ' has been confirmed.', 'payment', new.id);
      end loop;
    elsif new.status = 'rejected' then
      perform public.create_role_notification(new.customer_id, 'payment_rejected', 'Payment Rejected', 'Payment of ₹' || v_amount || ' was rejected.', 'payment', new.id);
    end if;
  end if;
  return new;
end;
$$;
