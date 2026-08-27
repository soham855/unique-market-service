create table if not exists public.sites (id uuid primary key default gen_random_uuid(), customer_id uuid references public.profiles(id) on delete set null, name text not null, address text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.devices (id uuid primary key default gen_random_uuid(), site_id uuid references public.sites(id) on delete cascade, serial_number text, device_type text, brand text, model text, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.amc_contracts (id uuid primary key default gen_random_uuid(), customer_id uuid references public.profiles(id) on delete set null, site_id uuid references public.sites(id) on delete set null, start_date date not null, end_date date not null, status text not null default 'active', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.service_history (id uuid primary key default gen_random_uuid(), complaint_id uuid references public.complaints(id) on delete set null, customer_id uuid references public.profiles(id) on delete set null, technician_id uuid references public.profiles(id) on delete set null, service_date timestamptz not null default now(), work_note text, status text not null default 'completed', created_at timestamptz not null default now());

alter table public.sites enable row level security;
alter table public.devices enable row level security;
alter table public.amc_contracts enable row level security;
alter table public.service_history enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin() or id=auth.uid()) with check (public.is_admin() or id=auth.uid());
drop policy if exists sites_admin_all on public.sites;
create policy sites_admin_all on public.sites for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists devices_admin_all on public.devices;
create policy devices_admin_all on public.devices for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists amc_admin_all on public.amc_contracts;
create policy amc_admin_all on public.amc_contracts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists history_admin_all on public.service_history;
create policy history_admin_all on public.service_history for all to authenticated using (public.is_admin()) with check (public.is_admin());
