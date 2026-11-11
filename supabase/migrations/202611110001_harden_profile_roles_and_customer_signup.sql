-- Public sign-up metadata must never grant an elevated application role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, phone, role, company_name, site_address, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.raw_user_meta_data ->> 'mobile', NEW.phone, ''),
    'customer',
    NULLIF(NEW.raw_user_meta_data ->> 'company_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'address', ''),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = CASE
      WHEN public.profiles.role IN ('admin', 'technician') THEN public.profiles.role
      ELSE 'customer'
    END,
    company_name = EXCLUDED.company_name,
    site_address = EXCLUDED.site_address,
    updated_at = now();
  RETURN NEW;
END;
$function$;

-- Technician OTP login may create its missing profile only when the verified
-- phone belongs to an operational technician record.
CREATE OR REPLACE FUNCTION public.is_registered_technician_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.technicians AS technician
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(technician.mobile, ''), '[^0-9]', '', 'g'), 10)
      = RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 10)
  );
$function$;

REVOKE ALL ON FUNCTION public.is_registered_technician_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registered_technician_phone(text) TO authenticated;

-- Restrict client-side profile edits to ordinary contact details. Elevated
-- role changes remain available to trusted server-side admin functions.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;
GRANT INSERT (id, full_name, phone, role, company_name, site_address, created_at, updated_at)
  ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, company_name, site_address, updated_at)
  ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (
      role = 'customer'
      OR (
        role = 'technician'
        AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
          = RIGHT(REGEXP_REPLACE(COALESCE(auth.jwt() ->> 'phone', ''), '[^0-9]', '', 'g'), 10)
        AND public.is_registered_technician_phone(phone)
      )
    )
  );
