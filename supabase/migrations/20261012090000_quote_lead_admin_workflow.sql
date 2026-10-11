-- Admin-only quotation workflow fields for WhatsApp/web CCTV quote leads.
alter table public.whatsapp_quote_leads
  add column if not exists admin_notes text,
  add column if not exists quoted_amount numeric(12,2),
  add column if not exists quotation_reference text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists quoted_at timestamptz,
  add column if not exists contacted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_quote_leads enable row level security;

drop policy if exists whatsapp_quote_leads_admin_manage
  on public.whatsapp_quote_leads;

create policy whatsapp_quote_leads_admin_manage
  on public.whatsapp_quote_leads
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

grant select, update on public.whatsapp_quote_leads to authenticated;
