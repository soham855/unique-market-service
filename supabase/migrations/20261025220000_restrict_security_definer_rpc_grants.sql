-- Restrict SECURITY DEFINER RPCs to the intended callers.
-- Trigger functions may still invoke create_role_notification as their owner.
begin;

revoke all on function public.create_role_notification(uuid, text, text, text, text, uuid) from public;
revoke all on function public.create_role_notification(uuid, text, text, text, text, uuid) from anon, authenticated;

create or replace function public.resolve_payment_customer_profile(p_customer_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(c.profile_id, c.user_id, c.id)
  from public.customers c
  where c.id = p_customer_id
    and (
      public.is_admin()
      or c.user_id = auth.uid()
      or c.profile_id = auth.uid()
    )
  limit 1;
$function$;

revoke all on function public.resolve_payment_customer_profile(uuid) from public;
revoke all on function public.resolve_payment_customer_profile(uuid) from anon;
grant execute on function public.resolve_payment_customer_profile(uuid) to authenticated;

create or replace function public.refresh_admin_operational_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  insert into public.admin_notifications(title, message, type)
  select 'AMC Expiring Soon',
         'AMC for customer ' || customer_id || ' expires on ' || expiry_date,
         'warning'
  from public.amc
  where expiry_date between current_date and current_date + 30
    and coalesce(status, '') not in ('expired', 'cancelled')
    and not exists (
      select 1 from public.admin_notifications n
      where n.title = 'AMC Expiring Soon'
        and n.message like '%customer ' || customer_id || '%expires on ' || expiry_date || '%'
    );

  insert into public.admin_notifications(title, message, type)
  select 'Low Stock',
         'Product ' || name || ' is below minimum stock (' || current_stock || ' / ' || min_stock || ')',
         'warning'
  from public.products
  where current_stock <= min_stock
    and not exists (
      select 1 from public.admin_notifications n
      where n.title = 'Low Stock'
        and n.message like '%Product ' || name || '%'
    );
end;
$function$;

revoke all on function public.refresh_admin_operational_alerts() from public;
revoke all on function public.refresh_admin_operational_alerts() from anon;
grant execute on function public.refresh_admin_operational_alerts() to authenticated, service_role;

-- This helper is used by ticket-status-history RLS checks; authenticated execution
-- is required, but anonymous/public execution is not.
revoke all on function public.can_insert_ticket_status_history(uuid) from public;
revoke all on function public.can_insert_ticket_status_history(uuid) from anon;
grant execute on function public.can_insert_ticket_status_history(uuid) to authenticated;

commit;
