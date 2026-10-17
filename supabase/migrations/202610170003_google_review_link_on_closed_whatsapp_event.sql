-- Send customers directly to the Unique Market Google review page when a service is closed.
-- Keep this in the outbox so the persistent OpenWA bridge and other senders use the same CTA.

create or replace function public.set_google_review_link_on_closed_whatsapp_event()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_status text;
  v_review_url constant text := 'https://g.page/r/CWY_3B12wn32EBI/review';
begin
  if new.event_type = 'status_changed' and new.complaint_id is not null then
    select lower(replace(coalesce(c.status, ''), '_', ' '))
      into v_status
    from public.complaints c
    where c.id = new.complaint_id;

    if v_status in ('closed', 'resolved', 'completed')
       and position(v_review_url in coalesce(new.message, '')) = 0 then
      new.message := rtrim(coalesce(new.message, '')) ||
        E'\n⭐ Google Review: ' || v_review_url;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists whatsapp_closed_google_review_link on public.whatsapp_notification_events;
create trigger whatsapp_closed_google_review_link
before insert or update of message, event_type, complaint_id
on public.whatsapp_notification_events
for each row
execute function public.set_google_review_link_on_closed_whatsapp_event();
