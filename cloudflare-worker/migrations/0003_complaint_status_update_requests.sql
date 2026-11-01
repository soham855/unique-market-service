-- Staging-only idempotency ledger for complaint status updates.
CREATE TABLE IF NOT EXISTS complaint_status_update_requests (
  request_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (actor_id, idempotency_key),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_complaint_status_update_requests_complaint
  ON complaint_status_update_requests(complaint_id, created_at);
