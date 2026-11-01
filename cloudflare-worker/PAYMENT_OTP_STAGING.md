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

This is schema groundwork only. No payment creation, OTP request/verify endpoint, OTP sender, payment confirmation, challan ledger update, or complaint close endpoint has been enabled. No production Supabase policies/triggers/Edge Functions were changed. No Worker was deployed.

## Required before the next implementation stage

1. Implement a server-only Worker flow that creates technician cash payments as `pending`, verifies the customer phone from the linked customer row, generates a cryptographically random six-digit OTP, stores only a salted/peppered hash, and writes an AES-GCM encrypted OTP payload to the dedicated outbox in one D1 batch.
2. Implement atomic OTP attempt increments and one-time consumption. Maximum five attempts; five-minute expiry; resend invalidates the previous challenge; request rate limits.
3. Implement payment confirmation and challan ledger application as one idempotent server-side operation. Reconcile source PostgreSQL trigger semantics before coding.
4. Implement complaint closure only when the required payment is confirmed and all payment/amount checks pass. The closure write, both history records, notifications, outbox and idempotency ledger must be atomic.
5. Add synthetic staging-only fixtures and integration tests only after explicit authorization to create test profiles/customers/payments/complaints. No such records exist now.
6. Before any production repair or cutover, take and verify a recoverable backup/export, document rollback steps, compare schema/function/policy compatibility, and obtain explicit approval.

