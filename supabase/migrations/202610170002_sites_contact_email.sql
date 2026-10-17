-- Store a branch-specific email recipient for Bank AMC reminders.
-- Additive and safe for existing site records; does not rewrite or delete data.
alter table public.sites
  add column if not exists contact_email text;

comment on column public.sites.contact_email is
  'Optional branch-specific email recipient used by Bank AMC reminder workflows';
