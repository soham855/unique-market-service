-- Notify portal administrators when a customer submits a referral.
-- This is performed server-side so customer RLS does not need to expose admin profile IDs.

create or replace function public.notify_admins_on_customer_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_name text;
begin
  select c.name
    into v_customer_name
    from public.customers c
   where c.id = new.referrer_customer_id;

  begin
    insert into public.notifications (user_id, title, message, type)
    select
      p.id,
      'New Customer Referral',
      coalesce(v_customer_name, 'Customer') || ' referred ' ||
        coalesce(new.referred_name, 'a customer') || ' (' ||
        coalesce(new.referred_mobile, 'mobile not provided') || ').',
      'customer_referral'
    from public.profiles p
    where p.role = 'admin';
  exception when others then
    raise warning 'Customer referral saved, but admin notification failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_admins_on_customer_referral() from public, anon, authenticated;

drop trigger if exists referrals_notify_admins on public.referrals;

create trigger referrals_notify_admins
after insert on public.referrals
for each row
execute function public.notify_admins_on_customer_referral();
