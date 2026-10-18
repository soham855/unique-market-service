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
