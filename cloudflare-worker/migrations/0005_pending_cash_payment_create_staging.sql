-- Staging-only idempotency ledger for pending cash payment creation.
-- No existing payment or customer rows are modified.
CREATE TABLE IF NOT EXISTS payment_create_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payment_create_requests_complaint
  ON payment_create_requests(complaint_id, created_at);
