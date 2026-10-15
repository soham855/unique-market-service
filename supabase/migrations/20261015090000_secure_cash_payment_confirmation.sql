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


-- Complete cash settlement in one database transaction. This prevents a verified OTP
-- from being consumed without recording payment, or payment being recorded without closure.
CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_otp(
  p_challenge_id uuid,
  p_customer_profile_id uuid,
  p_supplied_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.cash_payment_otp_challenges%ROWTYPE;
  v_complaint public.complaints%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge
  FROM public.cash_payment_otp_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTP challenge not found';
  END IF;
  IF v_challenge.customer_profile_id <> p_customer_profile_id THEN
    RAISE EXCEPTION 'Customer mismatch';
  END IF;
  IF v_challenge.verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'OTP already used';
  END IF;
  IF v_challenge.attempts >= 5 THEN
    RAISE EXCEPTION 'OTP attempt limit reached';
  END IF;
  IF v_challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'OTP expired';
  END IF;
  IF v_challenge.otp_hash <> p_supplied_hash THEN
    UPDATE public.cash_payment_otp_challenges
      SET attempts = LEAST(attempts + 1, 5)
      WHERE id = p_challenge_id;
    RAISE EXCEPTION 'Incorrect OTP';
  END IF;

  SELECT * INTO v_complaint
  FROM public.complaints
  WHERE id = v_challenge.complaint_id
  FOR UPDATE;

  IF NOT FOUND OR v_complaint.payment_status <> 'cash_otp_pending'
     OR v_complaint.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Complaint is not awaiting cash settlement';
  END IF;
  IF v_complaint.customer_id IS NULL THEN
    RAISE EXCEPTION 'Complaint has no linked customer';
  END IF;

  UPDATE public.cash_payment_otp_challenges
    SET verified_at = now(), attempts = LEAST(attempts + 1, 5)
    WHERE id = p_challenge_id AND verified_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTP already used';
  END IF;

  INSERT INTO public.payments (
    customer_id, complaint_id, amount, mode, payment_date, status,
    payment_status, source, recorded_by, notes
  ) VALUES (
    v_complaint.customer_id, v_complaint.id, v_challenge.amount, 'Cash',
    CURRENT_DATE, 'confirmed', 'Confirmed', 'cash_customer_otp',
    v_challenge.technician_id, 'Cash settlement confirmed by customer OTP'
  );

  UPDATE public.complaints
    SET payment_status = 'paid', closed_at = now()
    WHERE id = v_complaint.id
      AND payment_status = 'cash_otp_pending'
      AND closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint settlement state changed; transaction cancelled';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint.id,
    'customer_id', v_complaint.customer_id,
    'amount', v_challenge.amount,
    'technician_id', v_challenge.technician_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_otp(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_otp(uuid, uuid, text) TO service_role;
