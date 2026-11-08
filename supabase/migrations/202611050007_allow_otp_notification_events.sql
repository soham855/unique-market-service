-- Allow trusted OTP notification event types in the WhatsApp outbox.
-- Preserve the live payment_receipt event type while adding service-report OTP.
-- OTP and payment receipt events are trusted server-generated notifications.
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
        'payment_receipt'::text,
        'service_report_otp'::text
      ]
    )
  );


-- Customer-facing RLS must not permit clients to enqueue trusted OTP messages.
-- The Edge Function writes these events with service_role (RLS bypass); admins
-- retain the existing admin policy. This prevents customers from spoofing OTP
-- messages or selecting arbitrary phone numbers through the public Data API.
drop policy if exists whatsapp_events_customer_insert on public.whatsapp_notification_events;
create policy whatsapp_events_customer_insert
  on public.whatsapp_notification_events
  for insert
  to authenticated
  with check (
    event_type not in ('cash_payment_otp', 'payment_receipt', 'service_report_otp')
    and exists (
      select 1
      from public.complaints c
      join public.customers cu on cu.id = c.customer_id
      where c.id = whatsapp_notification_events.complaint_id
        and (cu.profile_id = auth.uid() or cu.user_id = auth.uid())
    )
  );
