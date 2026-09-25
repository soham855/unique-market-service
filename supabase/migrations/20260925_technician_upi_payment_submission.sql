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


alter table public.payments add column if not exists complaint_id uuid references public.complaints(id) on delete set null;
create index if not exists payments_complaint_id_idx on public.payments(complaint_id);

create or replace function public.sync_payment_rejection_to_complaint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' and new.complaint_id is not null then
    update public.complaints
      set status = 'resolved', updated_at = now()
    where id = new.complaint_id and status = 'closed';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_payment_rejection_to_complaint() from public;

drop trigger if exists payments_rejection_complaint_sync on public.payments;
create trigger payments_rejection_complaint_sync
after update of status on public.payments
for each row execute function public.sync_payment_rejection_to_complaint();
