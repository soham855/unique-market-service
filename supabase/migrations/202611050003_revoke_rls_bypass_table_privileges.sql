-- Row Level Security does not apply to TRUNCATE. Remove powerful table
-- privileges from API roles while preserving normal CRUD grants controlled by RLS.
revoke truncate, trigger, references
on all tables in schema public
from anon, authenticated;
