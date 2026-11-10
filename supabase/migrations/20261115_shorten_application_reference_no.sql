-- Migration: 20261115_shorten_application_reference_no.sql
-- Shorten Service Application Reference Number to NA-XXXXXX (NA + 6 alphanumeric characters)
-- Example: IW-NSA-8FCA2FFDF818 becomes NA-8FCA2F

BEGIN;

-- 1. Update column default for new service applications
ALTER TABLE public.service_applications
  ALTER COLUMN reference_no SET DEFAULT ('NA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));

-- 2. Backfill existing applications with 'IW-NSA-' prefix to 'NA-' + 6 chars
UPDATE public.service_applications
SET reference_no = 'NA-' || upper(substr(replace(reference_no, 'IW-NSA-', ''), 1, 6)),
    updated_at = now()
WHERE reference_no LIKE 'IW-NSA-%';

-- 3. Update public tracking function to seamlessly accept both NA-XXXXXX and legacy IW-NSA- references
CREATE OR REPLACE FUNCTION public.track_public_request(p_reference text, p_token uuid)
RETURNS TABLE(request_type text, current_status text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ref text := upper(trim(coalesce(p_reference, '')));
  v_alt_ref text;
BEGIN
  IF v_ref LIKE 'IW-NSA-%' THEN
    v_alt_ref := 'NA-' || substr(replace(v_ref, 'IW-NSA-', ''), 1, 6);
  ELSIF v_ref LIKE 'NA-%' THEN
    v_alt_ref := 'IW-NSA-' || substr(v_ref, 4) || '%';
  END IF;

  RETURN QUERY
  SELECT 'application'::text, a.status, a.updated_at
  FROM public.service_applications a
  WHERE (a.reference_no = v_ref OR (v_alt_ref IS NOT NULL AND (a.reference_no = v_alt_ref OR a.reference_no LIKE v_alt_ref)))
    AND a.tracking_token = p_token
  UNION ALL
  SELECT 'concern'::text, c.status, c.updated_at
  FROM public.service_cases c
  WHERE c.reference_no = v_ref
    AND c.tracking_token = p_token;
END;
$$;

COMMIT;
