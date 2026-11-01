# Cash payment OTP staging schema

Date: 2026-11-01  
Branch: `cloudflare-d1-staging`  
Target: Cloudflare D1 `unique-market-staging`

## Added in migration 0004

- `cash_payment_otp_request_ledger`: actor-scoped idempotency for OTP requests.
- `cash_payment_otp_outbox`: dedicated OTP delivery queue, separate from the legacy complaint WhatsApp event table. The payload column is `encrypted_payload`; the Worker must AES-GCM encrypt the OTP message with a Cloudflare secret before writing it. Never store plaintext OTPs in D1.
- `complaint_close_request_ledger`: actor-scoped idempotency for a future payment-gated closure endpoint.

## Applied and verified on D1 staging

- All three tables exist.
- All three tables contain zero rows.
- `payments`, `cash_payment_otp_challenges`, and `complaints` still contain zero rows.
- `PRAGMA foreign_key_check` returned no violations.
- No customer/payment/complaint data was copied or created.

## Not implemented yet

Staging-only Worker functions and routes now exist for requesting and verifying a cash OTP on an already-existing pending cash payment. The OTP is PBKDF2-hashed and the WhatsApp payload is AES-GCM encrypted before being placed in the dedicated D1 outbox. Requests are limited to three per payment/actor per hour; OTPs expire after five minutes and allow at most five attempts. The verify endpoint is customer-only and checks the customer-to-payment relationship. A confirmed request is replay-safe. Challan-linked payments are deliberately rejected until the original dual-trigger challan ledger semantics are ported. The outbox has no sender/dispatcher yet, so no WhatsApp message is sent. No production Supabase policies/triggers/Edge Functions were changed. No Worker was deployed.

## Required before the next implementation stage

1. Implement a server-only Worker flow that creates technician cash payments as `pending`; this is not yet implemented. The OTP request endpoint only accepts a pre-existing pending Cash payment and verifies the linked customer phone.
2. Harden and integration-test atomic OTP attempt increments and one-time consumption. Current staging code uses a five-attempt limit, five-minute expiry, resend invalidation and a three-requests/hour payment+actor limit; live D1 race tests are still required.
3. Implement payment confirmation and challan ledger application as one idempotent server-side operation. Current OTP verify intentionally rejects challan-linked payments until source PostgreSQL dual-trigger semantics are reconciled and ported.
4. Implement complaint closure only when the required payment is confirmed and all payment/amount checks pass. The closure write, both history records, notifications, outbox and idempotency ledger must be atomic.
5. Add synthetic staging-only fixtures and integration tests only after explicit authorization to create test profiles/customers/payments/complaints. No such records exist now.
6. Before any production repair or cutover, take and verify a recoverable backup/export, document rollback steps, compare schema/function/policy compatibility, and obtain explicit approval.


## Worker routes (staging code only)

- `POST /v1/payments/:id/cash-otp/request` — admin or payment-recording assigned technician; requires `Idempotency-Key`, `OTP_HASH_SECRET`, and base64 AES key `OTP_ENCRYPTION_KEY`. It queues encrypted payload only; no sender exists yet.
- `POST /v1/payments/:id/cash-otp/verify` — linked customer only; body `{ "otp": "123456" }`. Confirms only a non-challan pending cash payment. Does not close the complaint.

These routes are not deployed. Secrets have not been set. No OTP was sent and no payment/customer test data was created.
