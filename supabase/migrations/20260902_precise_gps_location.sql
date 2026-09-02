alter table public.complaints
  add column if not exists gps_accuracy_m double precision;

alter table public.complaints
  add column if not exists location_captured_at timestamptz;
