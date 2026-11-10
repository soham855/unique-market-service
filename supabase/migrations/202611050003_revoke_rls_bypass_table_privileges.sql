-- Remove powerful table privileges from existing API-role grants.
-- PostgreSQL 17 MAINTAIN is included alongside TRUNCATE, TRIGGER and REFERENCES.
revoke truncate, trigger, references, maintain
on all tables in schema public
from anon, authenticated;

-- Keep the same restrictions on future public tables. Supabase creates tables
-- under either postgres or supabase_admin, and both roles currently have
-- default grants for these privileges.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;
