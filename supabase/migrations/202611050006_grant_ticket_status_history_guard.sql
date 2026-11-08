-- Allow signed-in web and Android clients to evaluate technician/admin
-- ticket-status-history insert authorization. The function itself enforces
-- admin or assigned-technician access; do not grant this to anon/PUBLIC.
GRANT EXECUTE ON FUNCTION public.can_insert_ticket_status_history(uuid) TO authenticated;
