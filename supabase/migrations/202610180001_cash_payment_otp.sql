-- Cash collection requires a customer OTP; OTP hashes are never exposed to clients.
create table if not exists public.cash_payment_otp_challenges (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  used_at timestamptz,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.cash_payment_otp_challenges enable row level security;
revoke all on public.cash_payment_otp_challenges from anon, authenticated;

-- Enforce OTP verification even if a client/admin attempts to confirm directly.
create or replace function public.enforce_cash_payment_otp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
begin
  if new.mode = 'Cash'
     and new.source = 'technician'
     and new.status = 'confirmed'
     and old.status is distinct from new.status then
    select (used_at is not null and used_at <= expires_at)
      into v_verified
    from public.cash_payment_otp_challenges
    where payment_id = new.id;
    if coalesce(v_verified, false) is not true then
      raise exception 'Customer OTP verification is required before confirming technician cash payments';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cash_payment_otp() from public, anon, authenticated;
drop trigger if exists payments_require_cash_otp on public.payments;
create trigger payments_require_cash_otp
before update of status on public.payments
for each row execute function public.enforce_cash_payment_otp();
