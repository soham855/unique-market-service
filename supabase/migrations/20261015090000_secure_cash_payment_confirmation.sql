-- Additive payment settlement support. Existing complaint/payment rows are preserved.
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.complaints
  DROP CONSTRAINT IF EXISTS complaints_payment_status_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_payment_status_check
  CHECK (payment_status = ANY (ARRAY[
    'not_required','pending','cash_otp_pending','paid','verification_pending','failed'
  ]));

CREATE TABLE IF NOT EXISTS public.cash_payment_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE RESTRICT,
  technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_payment_otp_active_idx
  ON public.cash_payment_otp_challenges (complaint_id, created_at DESC)
  WHERE verified_at IS NULL;

ALTER TABLE public.cash_payment_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_payment_otp_challenges FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_payment_otp_challenges TO service_role;

COMMENT ON TABLE public.cash_payment_otp_challenges IS
  'Server-only cash payment OTP challenges; OTP is stored as a SHA-256 hash, expires, and has a five-attempt limit.';
COMMENT ON COLUMN public.complaints.payment_status IS
  'Additive payment settlement state; does not overwrite existing complaint status values.';
COMMENT ON COLUMN public.complaints.closed_at IS
  'Timestamp set only after verified payment settlement.';
