-- Prevent authenticated users from promoting their own profile (or another
-- profile) by changing the role column. Existing admins retain role-management
-- access through public.is_admin(); trusted service-role/database migrations
-- remain able to manage roles.
create or replace function public.prevent_unauthorized_profile_role_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'Only an administrator may change profile roles'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_unauthorized_profile_role_change()
  from public, anon, authenticated;

drop trigger if exists profiles_prevent_unauthorized_role_change on public.profiles;
create trigger profiles_prevent_unauthorized_role_change
before update of role on public.profiles
for each row
execute function public.prevent_unauthorized_profile_role_change();

-- Keep the profile self-service policy for name/phone updates. The trigger above
-- independently protects the privileged role column.
