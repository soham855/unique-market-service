-- Server-side OTP challenges for technician service completion.
create table if not exists public.service_report_otp_challenges (
  service_report_id uuid primary key references public.service_reports(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  used_at timestamptz,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.service_report_otp_challenges enable row level security;
revoke all on public.service_report_otp_challenges from anon, authenticated;

-- Invalidate legacy OTPs that were generated in the technician app and stored in plaintext.
update public.service_reports set customer_otp = null where customer_otp is not null;
update public.service_reports r
set customer_otp_verified = false, customer_approved_at = null
from public.complaints c
where c.id = r.complaint_id and c.status <> 'Completed'
  and (r.customer_otp_verified is distinct from false or r.customer_approved_at is not null);

-- Client-side updates must never mark a service report as customer-approved.
create or replace function public.guard_service_report_customer_approval()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
begin
  if (
       new.customer_otp is distinct from old.customer_otp
       or new.customer_otp_verified is distinct from old.customer_otp_verified
       or new.customer_approved_at is distinct from old.customer_approved_at
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Customer approval can only be recorded by the trusted server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_service_report_customer_approval()
  from public, anon, authenticated;
drop trigger if exists service_reports_guard_customer_approval on public.service_reports;
create trigger service_reports_guard_customer_approval
before update of customer_otp_verified, customer_approved_at on public.service_reports
for each row execute function public.guard_service_report_customer_approval();

-- Even direct API updates cannot complete a complaint without a verified report
-- and the required before/after evidence and customer signature.
create or replace function public.require_verified_service_report_for_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if lower(coalesce(new.status, '')) = 'completed' and lower(coalesce(old.status, '')) <> 'completed' then
    if not exists (
      select 1
      from public.service_reports r
      where r.complaint_id = new.id
        and r.customer_otp_verified is true
        and nullif(btrim(r.before_photo_url), '') is not null
        and nullif(btrim(r.after_photo_url), '') is not null
        and nullif(btrim(r.customer_signature), '') is not null
    ) then
      raise exception 'Verified customer OTP, before/after photos and signature are required'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.require_verified_service_report_for_completion()
  from public, anon, authenticated;
drop trigger if exists complaints_require_verified_service_report on public.complaints;
create trigger complaints_require_verified_service_report
before update of status on public.complaints
for each row execute function public.require_verified_service_report_for_completion();
