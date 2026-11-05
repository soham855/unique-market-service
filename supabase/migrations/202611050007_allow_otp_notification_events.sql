-- Allow trusted OTP notification event types in the WhatsApp outbox.
-- Keep the existing notification types unchanged; the worker already handles
-- cash_payment_otp and service_report_otp as sensitive, customer-only messages.
alter table public.whatsapp_notification_events
  drop constraint if exists whatsapp_notification_events_event_type_check;

alter table public.whatsapp_notification_events
  add constraint whatsapp_notification_events_event_type_check
  check (
    event_type = any (
      array[
        'created'::text,
        'assigned'::text,
        'status_changed'::text,
        'cash_payment_otp'::text,
        'service_report_otp'::text
      ]
    )
  );
