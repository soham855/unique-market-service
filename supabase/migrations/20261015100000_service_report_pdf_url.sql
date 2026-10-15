-- Store generated service-report PDFs in the existing service-reports storage bucket.
-- Additive only: existing service reports and photos are preserved.
ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMENT ON COLUMN public.service_reports.pdf_url IS
  'Public URL of the generated PDF service report/invoice stored in the service-reports bucket.';
