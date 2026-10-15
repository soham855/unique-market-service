# Secure payment settlement (additive)

## Important provider limitation
The current payment screen uses a static UPI QR and collects a UTR. A static UPI QR/direct bank transfer does not provide a trusted webhook to this app by itself. Customer-entered UTRs, screenshots, and technician statements must remain **Pending Verification**. Automatic online settlement requires a PSP/bank webhook integration with signature verification and idempotency.

## Cash confirmation
`cash-payment-confirmation` is a JWT-authenticated Edge Function:
- The assigned technician can request an OTP only for the saved service-report total.
- The OTP is queued through the existing `whatsapp_notification_events` outbox, stored only as a SHA-256 hash, expires after five minutes, and is limited to five attempts.
- Only the authenticated customer linked to the complaint can verify it.
- Successful verification calls `confirm_cash_payment_with_otp`, a service-role-only PostgreSQL RPC. OTP consumption, cash ledger insertion, `payment_status = 'paid'`, `closed_at`, and `status = 'closed'` occur in one transaction.
- The function never trusts a client-side `Paid` flag or a UTR as proof of online settlement.

## Rollout notes
This migration/function is intentionally additive and is not wired into technician/customer UI in this change. Wire the technician's "request cash OTP" action and the customer's authenticated "confirm cash payment" action before enabling the workflow in production. The final invoice PDF and rating URL are not emitted by this backend yet; they should be added only after a verified settlement and after confirming the existing invoice storage/feedback routes.

## Required pre-production checks
1. Apply the migration only to a non-production test database first.
2. Verify correct OTP records exactly one Cash payment and closes the complaint.
3. Verify wrong, expired, reused, and five-attempt OTPs cannot settle a payment.
4. Verify two simultaneous verification requests cannot create duplicate payment rows.
5. Verify UPI/UTR submissions remain Pending Verification until an Admin reconciliation or a signed provider webhook confirms settlement.
6. Do not deploy the Edge Function until technician/customer UI integration and these tests are complete.
