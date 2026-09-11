-- Ensure authenticated technicians can use the Technician Portal -> Raise Request module.
-- RLS policies already restrict which rows technicians/admins can access.
grant usage on schema public to authenticated;
grant select, insert, update on table public.technician_requests to authenticated;

-- Refresh PostgREST's schema/privilege cache after deployment.
notify pgrst, 'reload schema';
