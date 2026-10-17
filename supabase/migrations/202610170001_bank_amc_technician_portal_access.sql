-- Allow assigned technicians to read only the Bank AMC contract and site details needed for their own visits.
-- Admin policies remain unchanged; all tables keep RLS enabled.
drop policy if exists bank_amc_contracts_assigned_staff_select on public.amc_contracts;
create policy bank_amc_contracts_assigned_staff_select
on public.amc_contracts for select to authenticated
using (
  exists (
    select 1 from public.bank_amc_visits v
    where v.amc_contract_id = amc_contracts.id
      and v.assigned_staff_id = (select auth.uid())
  )
);

drop policy if exists bank_amc_sites_assigned_staff_select on public.sites;
create policy bank_amc_sites_assigned_staff_select
on public.sites for select to authenticated
using (
  exists (
    select 1
    from public.amc_contracts c
    join public.bank_amc_visits v on v.amc_contract_id = c.id
    where c.site_id = sites.id
      and v.assigned_staff_id = (select auth.uid())
  )
);
