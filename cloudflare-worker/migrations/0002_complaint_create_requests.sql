-- Staging-only idempotency ledger for the Worker complaint create API.
-- No customer data is copied; entries are written only when staging API is exercised.
CREATE TABLE IF NOT EXISTS complaint_create_requests (
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  complaint_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_id, idempotency_key),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);
