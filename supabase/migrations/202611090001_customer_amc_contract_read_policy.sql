-- Allow a signed-in customer to read only their own AMC contracts.
-- amc_contracts.customer_id references profiles.id, not customers.id.
grant select on table public.amc_contracts to authenticated;

drop policy if exists amc_contracts_customer_select_own on public.amc_contracts;

create policy amc_contracts_customer_select_own
on public.amc_contracts
for select
to authenticated
using (
  customer_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'customer'
  )
);
