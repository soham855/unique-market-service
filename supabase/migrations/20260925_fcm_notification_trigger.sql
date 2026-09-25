-- FCM push trigger: enqueue every in-app notification to the send-push-notification Edge Function.
create or replace function public.notify_fcm_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  webhook_key text;
begin
  select decrypted_secret into webhook_key
  from vault.decrypted_secrets
  where name = 'fcm_webhook_key'
  limit 1;

  if webhook_key is null then
    raise warning 'FCM webhook key is not configured';
    return new;
  end if;

  perform net.http_post(
    url := 'https://tfscvycomllamoubtlcf.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fcm-webhook-secret', webhook_key
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
exception when others then
  raise warning 'FCM trigger failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_fcm_on_notification_insert() from public;
revoke all on function public.notify_fcm_on_notification_insert() from anon, authenticated;

drop trigger if exists trg_notifications_fcm_push on public.notifications;
create trigger trg_notifications_fcm_push
after insert on public.notifications
for each row
execute function public.notify_fcm_on_notification_insert();
