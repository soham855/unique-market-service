-- Staging-only support schema for a future atomic cash OTP workflow.
-- OTP payload must be AES-GCM encrypted by the Worker before insertion.
-- This migration creates no customer/payment/OTP rows and does not change the legacy WhatsApp outbox.

CREATE TABLE IF NOT EXISTS cash_payment_otp_request_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cash_payment_otp_request_payment
  ON cash_payment_otp_request_ledger(payment_id, created_at);

CREATE TABLE IF NOT EXISTS cash_payment_otp_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  recipient_phone TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  last_error TEXT,
  CHECK(status IN ('pending','sent','failed')),
  CHECK(attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cash_payment_otp_outbox_pending
  ON cash_payment_otp_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS complaint_close_request_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  complaint_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_complaint_close_request_complaint
  ON complaint_close_request_ledger(complaint_id, created_at);
