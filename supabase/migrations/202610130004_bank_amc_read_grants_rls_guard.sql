-- These read grants prevent PostgreSQL table-permission errors when the client
-- makes an initial unauthenticated request. Row-level security remains enabled
-- on all three tables and there are deliberately no anon policies, so anon
-- requests cannot read any rows. Authenticated admin/assigned-staff access
-- continues to be controlled by the existing RLS policies.
grant select on table public.amc_contracts, public.bank_amc_visits, public.sites to anon;
