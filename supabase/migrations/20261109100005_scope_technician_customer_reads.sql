-- Prevent every technician from reading every customer record.
-- Technicians may read only customers attached to tickets assigned to their
-- authenticated profile. Customer self-read and admin access remain governed
-- by the existing customer policies.
drop policy if exists customers_technician_select on public.customers;

create policy customers_assigned_technician_select
  on public.customers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.complaints c
      where c.customer_id = customers.id
        and c.technician_id = auth.uid()
    )
  );
