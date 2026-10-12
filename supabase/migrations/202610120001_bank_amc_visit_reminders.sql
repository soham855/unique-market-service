alter table public.sites
  add column if not exists contact_email text;

alter table public.amc_contracts
  add column if not exists contract_name text,
  add column if not exists visit_interval_months integer not null default 2,
  add column if not exists billing_interval_months integer not null default 3,
  add column if not exists next_billing_date date,
  add column if not exists billing_amount numeric(12,2),
  add column if not exists renewal_reminder_30d_sent_at timestamptz,
  add column if not exists renewal_reminder_15d_sent_at timestamptz,
  add column if not exists renewal_reminder_7d_sent_at timestamptz;

create table if not exists public.bank_amc_visits (
  id uuid primary key default gen_random_uuid(),
  amc_contract_id uuid not null references public.amc_contracts(id) on delete cascade,
  scheduled_at timestamptz not null,
  assigned_staff_id uuid references public.profiles(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled','overdue')),
  visit_type text not null default 'scheduled' check (visit_type in ('scheduled','breakdown','material_delivery','follow_up')),
  report_summary text,
  material_notes text,
  breakdown_notes text,
  completed_at timestamptz,
  next_visit_at timestamptz,
  whatsapp_reminder_2d_sent_at timestamptz,
  whatsapp_reminder_1d_sent_at timestamptz,
  whatsapp_reminder_day_sent_at timestamptz,
  email_reminder_2d_sent_at timestamptz,
  email_reminder_1d_sent_at timestamptz,
  email_reminder_day_sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_amc_visits_scheduled_at_idx on public.bank_amc_visits (scheduled_at, status);
create index if not exists bank_amc_visits_assigned_staff_idx on public.bank_amc_visits (assigned_staff_id, scheduled_at);
create index if not exists amc_contracts_next_billing_date_idx on public.amc_contracts (next_billing_date);
alter table public.bank_amc_visits enable row level security;

drop policy if exists "bank_amc_visits_select_admin_or_assigned" on public.bank_amc_visits;
create policy "bank_amc_visits_select_admin_or_assigned" on public.bank_amc_visits for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') or assigned_staff_id = (select auth.uid()));

drop policy if exists "bank_amc_visits_insert_admin" on public.bank_amc_visits;
create policy "bank_amc_visits_insert_admin" on public.bank_amc_visits for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "bank_amc_visits_update_admin_or_assigned" on public.bank_amc_visits;
create policy "bank_amc_visits_update_admin_or_assigned" on public.bank_amc_visits for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') or assigned_staff_id = (select auth.uid()))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') or assigned_staff_id = (select auth.uid()));

drop policy if exists "bank_amc_visits_delete_admin" on public.bank_amc_visits;
create policy "bank_amc_visits_delete_admin" on public.bank_amc_visits for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

grant select, insert, update, delete on public.bank_amc_visits to authenticated;
create index if not exists bank_amc_visits_contract_idx on public.bank_amc_visits (amc_contract_id);
