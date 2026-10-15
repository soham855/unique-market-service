-- Serialize failed OTP attempts so concurrent wrong guesses cannot bypass the five-attempt limit.
CREATE OR REPLACE FUNCTION public.record_cash_payment_otp_failure(
  p_challenge_id uuid,
  p_customer_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.cash_payment_otp_challenges%ROWTYPE;
  v_attempts integer;
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
  IF v_challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'OTP expired';
  END IF;

  UPDATE public.cash_payment_otp_challenges
    SET attempts = LEAST(attempts + 1, 5)
    WHERE id = p_challenge_id
    RETURNING attempts INTO v_attempts;

  RETURN v_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_payment_otp_failure(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_payment_otp_failure(uuid, uuid) TO service_role;
