-- Atomically increment failed customer OTP attempts.
-- Only the trusted Edge Function (service_role) may call this RPC.
create or replace function public.increment_service_report_otp_attempt(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_attempts integer;
begin
  update public.service_report_otp_challenges
     set attempts = attempts + 1
   where service_report_id = p_report_id
     and used_at is null
     and expires_at > now()
     and attempts < 5
  returning attempts into new_attempts;

  return new_attempts;
end;
$$;

revoke all on function public.increment_service_report_otp_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_service_report_otp_attempt(uuid)
  to service_role;
