create table if not exists public.challans (id uuid primary key default gen_random_uuid(), challan_no text unique not null, customer_id uuid references public.profiles(id) on delete set null, site_id uuid references public.sites(id) on delete set null, challan_date date not null default current_date, items jsonb not null default '[]'::jsonb, subtotal numeric(12,2) not null default 0, notes text, status text not null default 'issued', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.payments (id uuid primary key default gen_random_uuid(), customer_id uuid references public.profiles(id) on delete set null, challan_id uuid references public.challans(id) on delete set null, payment_date date not null default current_date, amount numeric(12,2) not null default 0, mode text, reference_no text, notes text, created_at timestamptz not null default now());
alter table public.challans enable row level security;
alter table public.payments enable row level security;
drop policy if exists challans_admin_all on public.challans;
create policy challans_admin_all on public.challans for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
