-- D1-only support table. These are empty-stage counters, not copied production sequence values.
-- Before any real cutover, reconcile counters from the live Supabase sequences/counter row.
CREATE TABLE IF NOT EXISTS ticket_number_counters (
  sequence_key TEXT PRIMARY KEY CHECK (
    sequence_key IN ('complaint_ticket', 'whatsapp_ticket', 'complaint_no', 'service_ticket')
  ),
  next_number INTEGER NOT NULL CHECK (next_number >= 1)
);

INSERT OR IGNORE INTO ticket_number_counters (sequence_key, next_number)
VALUES
  ('complaint_ticket', 1),
  ('whatsapp_ticket', 1),
  ('complaint_no', 1),
  ('service_ticket', 1);
