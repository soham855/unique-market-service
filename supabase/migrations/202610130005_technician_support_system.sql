-- Technician Support System: verified KB, private manuals, and SOS escalation.
create table if not exists public.technician_kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  keywords text[] not null default '{}',
  category text not null default 'CCTV',
  problem text not null,
  solution text not null,
  language text not null default 'both' check (language in ('mr','en','both')),
  verified boolean not null default false,
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists technician_kb_articles_search_idx
  on public.technician_kb_articles using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(problem,'') || ' ' || array_to_string(keywords,' ')));

create table if not exists public.tech_manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  model text,
  category text not null default 'CCTV',
  description text,
  file_path text,
  external_url text,
  published boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tech_manuals_has_resource check (nullif(file_path,'') is not null or nullif(external_url,'') is not null)
);
create index if not exists tech_manuals_search_idx
  on public.tech_manuals using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' || coalesce(category,'')));

create table if not exists public.technician_sos_alerts (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.profiles(id) on delete cascade,
  complaint_id uuid references public.complaints(id) on delete set null,
  customer_name text,
  location_text text,
  latitude double precision,
  longitude double precision,
  notes text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','cancelled')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  notification_sent_at timestamptz,
  admin_notification_sent_at timestamptz,
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists technician_sos_alerts_open_idx
  on public.technician_sos_alerts (status, created_at desc);

alter table public.technician_kb_articles enable row level security;
alter table public.tech_manuals enable row level security;
alter table public.technician_sos_alerts enable row level security;

drop policy if exists "Technicians read published KB" on public.technician_kb_articles;
create policy "Technicians read published KB" on public.technician_kb_articles
  for select to authenticated using (
    published = true and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','technician'))
  );
drop policy if exists "Admins manage KB" on public.technician_kb_articles;
create policy "Admins manage KB" on public.technician_kb_articles
  for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Technicians read published manuals" on public.tech_manuals;
create policy "Technicians read published manuals" on public.tech_manuals
  for select to authenticated using (
    published = true and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','technician'))
  );
drop policy if exists "Admins manage manuals" on public.tech_manuals;
create policy "Admins manage manuals" on public.tech_manuals
  for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Technicians create own SOS" on public.technician_sos_alerts;
create policy "Technicians create own SOS" on public.technician_sos_alerts
  for insert to authenticated with check (
    technician_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'technician')
  );
drop policy if exists "Staff read SOS alerts" on public.technician_sos_alerts;
create policy "Staff read SOS alerts" on public.technician_sos_alerts
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'admin' or (p.role = 'technician' and technician_id = auth.uid())))
  );
drop policy if exists "Admins update SOS alerts" on public.technician_sos_alerts;
create policy "Admins update SOS alerts" on public.technician_sos_alerts
  for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tech-manuals', 'tech-manuals', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

drop policy if exists "Technicians read published manual files" on storage.objects;
create policy "Technicians read published manual files" on storage.objects
  for select to authenticated using (
    bucket_id = 'tech-manuals' and exists (
      select 1 from public.tech_manuals m
      join public.profiles p on p.id = auth.uid()
      where p.role in ('admin','technician') and m.file_path = name and (m.published = true or p.role = 'admin')
    )
  );
drop policy if exists "Admins upload manual files" on storage.objects;
create policy "Admins upload manual files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'tech-manuals' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
drop policy if exists "Admins update manual files" on storage.objects;
create policy "Admins update manual files" on storage.objects
  for update to authenticated using (
    bucket_id = 'tech-manuals' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    bucket_id = 'tech-manuals' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
drop policy if exists "Admins delete manual files" on storage.objects;
create policy "Admins delete manual files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'tech-manuals' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

grant select, insert, update, delete on public.technician_kb_articles to authenticated;
grant select, insert, update, delete on public.tech_manuals to authenticated;
grant select, insert, update on public.technician_sos_alerts to authenticated;
