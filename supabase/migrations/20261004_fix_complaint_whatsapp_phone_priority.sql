-- Keep complaint-entered phone numbers authoritative for WhatsApp customer notifications.
-- This migration mirrors the production hotfix applied directly to the function.

create or replace function public.queue_whatsapp_complaint_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  customer_phone text;
  tech_phone text;
  profile_phone text;
begin
  if tg_op = 'INSERT' then
    customer_phone := nullif(trim(coalesce(new.customer_phone, '')), '');

    if customer_phone is null and new.customer_id is not null then
      select phone into profile_phone from public.profiles where id = new.customer_id limit 1;
      customer_phone := nullif(trim(coalesce(profile_phone, '')), '');
    end if;

    if customer_phone is not null then
      insert into public.whatsapp_notification_events(
        complaint_id, recipient_user_id, phone, customer_phone, event_type, message
      )
      values(
        new.id, new.customer_id,
        regexp_replace(customer_phone, '\\D', '', 'g'),
        regexp_replace(customer_phone, '\\D', '', 'g'),
        'created',
        'Unique Market: Your complaint "' || coalesce(new.title, 'Service Request') || '" has been received.'
      );
    end if;

  elsif tg_op = 'UPDATE' then
    if new.technician_id is distinct from old.technician_id and new.technician_id is not null then
      select phone into tech_phone from public.profiles where id = new.technician_id limit 1;

      if nullif(trim(coalesce(tech_phone, '')), '') is not null then
        insert into public.whatsapp_notification_events(
          complaint_id, recipient_user_id, phone, customer_phone, event_type, message
        )
        values(
          new.id, new.technician_id,
          regexp_replace(tech_phone, '\\D', '', 'g'),
          null,
          'assigned',
          'Unique Market: Complaint "' || coalesce(new.title, 'Service Request') || '" has been assigned to you.'
        );
      end if;
    end if;

    if new.status is distinct from old.status then
      customer_phone := nullif(trim(coalesce(new.customer_phone, '')), '');

      if customer_phone is null and new.customer_id is not null then
        select phone into profile_phone from public.profiles where id = new.customer_id limit 1;
        customer_phone := nullif(trim(coalesce(profile_phone, '')), '');
      end if;

      if customer_phone is not null then
        insert into public.whatsapp_notification_events(
          complaint_id, recipient_user_id, phone, customer_phone, event_type, message
        )
        values(
          new.id, new.customer_id,
          regexp_replace(customer_phone, '\\D', '', 'g'),
          regexp_replace(customer_phone, '\\D', '', 'g'),
          'status_changed',
          'Unique Market: Complaint "' || coalesce(new.title, 'Service Request') ||
          '" status is now ' || replace(coalesce(new.status, ''), '_', ' ') || '.'
        );
      end if;
    end if;
  end if;

  return new;
end;
$function$;