-- Keep production schema compatible with the WhatsApp outbox used by OTP delivery.
alter table public.whatsapp_notification_events add column if not exists event_key text;
create unique index if not exists whatsapp_notification_events_event_key_uidx
  on public.whatsapp_notification_events(event_key)
  where event_key is not null;
