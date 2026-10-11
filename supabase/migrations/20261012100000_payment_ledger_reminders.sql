-- Additive payment-ledger support. Existing challans and payments are preserved.
alter table public.challans
  add column if not exists due_date date,
  add column if not exists whatsapp_payment_reminder_last_sent_at timestamptz,
  add column if not exists whatsapp_payment_reminder_stage text;

alter table public.payments
  add column if not exists ledger_applied_at timestamptz;

create index if not exists idx_challans_due_date_unpaid
  on public.challans (due_date)
  where due_date is not null;

create or replace function public.apply_confirmed_payment_to_challan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_applied_amount numeric := 0;
  new_applied_amount numeric := 0;
  old_challan_id uuid := null;
  new_challan_id uuid := null;
begin
  if tg_op = 'UPDATE' then
    if old.ledger_applied_at is not null and old.status = 'confirmed' and old.challan_id is not null then
      old_applied_amount := greatest(0, coalesce(old.amount, 0));
      old_challan_id := old.challan_id;
    end if;
  end if;

  if new.status = 'confirmed'
     and new.challan_id is not null
     and coalesce(new.amount, 0) > 0
     and (
       tg_op = 'INSERT'
       or old.ledger_applied_at is not null
       or old.status is distinct from 'confirmed'
     ) then
    new_applied_amount := new.amount;
    new_challan_id := new.challan_id;
    new.ledger_applied_at := now();
  elsif tg_op = 'UPDATE' and old.ledger_applied_at is not null and new.status <> 'confirmed' then
    new.ledger_applied_at := null;
  end if;

  if old_applied_amount > 0 and old_challan_id is not null then
    update public.challans c
       set paid_amount = greatest(0, coalesce(c.paid_amount, 0) - old_applied_amount),
           payment_status = case
             when greatest(0, coalesce(c.paid_amount, 0) - old_applied_amount) >= coalesce(c.subtotal, 0)
                  and coalesce(c.subtotal, 0) > 0 then 'Paid'
             when greatest(0, coalesce(c.paid_amount, 0) - old_applied_amount) > 0 then 'Partial'
             else 'Pending'
           end,
           updated_at = now()
     where c.id = old_challan_id;
  end if;

  if new_applied_amount > 0 and new_challan_id is not null then
    update public.challans c
       set paid_amount = coalesce(c.paid_amount, 0) + new_applied_amount,
           payment_status = case
             when coalesce(c.paid_amount, 0) + new_applied_amount >= coalesce(c.subtotal, 0)
                  and coalesce(c.subtotal, 0) > 0 then 'Paid'
             when coalesce(c.paid_amount, 0) + new_applied_amount > 0 then 'Partial'
             else 'Pending'
           end,
           updated_at = now()
     where c.id = new_challan_id;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_apply_challan_insert on public.payments;
create trigger payments_apply_challan_insert
before insert on public.payments
for each row execute function public.apply_confirmed_payment_to_challan();

drop trigger if exists payments_apply_challan_update on public.payments;
create trigger payments_apply_challan_update
before update of status, amount, challan_id on public.payments
for each row execute function public.apply_confirmed_payment_to_challan();
