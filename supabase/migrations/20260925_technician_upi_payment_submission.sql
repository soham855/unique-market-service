drop policy if exists payments_technician_insert_upi on public.payments;
create policy payments_technician_insert_upi
  on public.payments
  for insert
  to authenticated
  with check (
    recorded_by = auth.uid()
    and mode = 'UPI'
    and status = 'pending'
    and source = 'technician'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'technician'
    )
  );
