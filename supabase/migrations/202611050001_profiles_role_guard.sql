-- Prevent authenticated users from promoting their own profile (or another
-- profile) by changing the role column. Existing admins retain role-management
-- access through public.is_admin(); trusted service-role/database migrations
-- remain able to manage roles.
create or replace function public.prevent_unauthorized_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  is_service boolean := coalesce(auth.role(), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin');
  is_existing_admin boolean := coalesce(public.is_admin(), false);
  profile_phone text;
begin
  if tg_op = 'INSERT' then
    if new.role = 'admin' and not is_service and not is_existing_admin then
      raise exception 'Only an existing administrator may create an admin profile'
        using errcode = '42501';
    end if;

    if new.role = 'technician' and not is_service and not is_existing_admin then
      profile_phone := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
      if length(profile_phone) <> 10 or not exists (
        select 1
        from public.technicians t
        where right(regexp_replace(coalesce(t.mobile, ''), '\D', '', 'g'), 10) = profile_phone
          and lower(coalesce(t.status, 'active')) in ('active', 'online', 'available')
      ) then
        raise exception 'Technician profile requires an active registered technician mobile'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.role is distinct from old.role and not is_service and not is_existing_admin then
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
before insert or update of role on public.profiles
for each row
execute function public.prevent_unauthorized_profile_role_change();

-- Keep the profile self-service policy for name/phone updates. The trigger above
-- independently protects the privileged role column.
