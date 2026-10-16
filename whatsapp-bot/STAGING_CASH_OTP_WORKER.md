# Staging cash OTP worker (admin-only)

This worker is deliberately separate from `server.mjs` and `openwa-bridge.mjs`. It polls only `cash_payment_otp_*` events from the **staging** Supabase project and sends their contents to a configured admin test inbox. It never sends staging OTPs to `complaints.customer_phone`, and it never confirms a payment.

## Required environment

- `STAGING_SUPABASE_URL=https://hwfbcpxnntzrhbnveqtl.supabase.co`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging project's service-role key>`
- `WA_ADMIN_PHONE=<reachable admin test WhatsApp number>` (accepts a 10-digit Indian mobile number or 91 + 10 digits; a 10-digit number is normalized to country code 91)
- `OPENWA_URL=http://openwa-api:2785` (or the OpenWA API URL reachable from the worker)
- `OPENWA_DATA_KEY_FILE=/openwa-data/.api-key` or `OPENWA_API_KEY=<existing OpenWA API key>`
- `OPENWA_SESSION_NAME=unique-market-7350060071` or `OPENWA_SESSION_ID=<existing connected session id>`

The worker refuses to create or pair a WhatsApp session. It uses an already-connected OpenWA session and does not modify WhatsApp authentication files. Do not point `STAGING_SUPABASE_URL` at Production, and do not use the production service-role key here.

## Run safely

Run this as a separate, temporary Node.js process/container on the same Docker network as OpenWA, with only the environment above and the existing OpenWA API-key file mounted read-only if needed. Do not change the production bot's `SUPABASE_URL`, do not restart it, and do not mount or alter its WhatsApp auth volume.

The configured admin phone should be a reachable test inbox separate from the dummy customer number in `STG-CASH-OTP-001`. Once the worker is running, request an OTP from the staging test technician account; the OTP will arrive with a clear `STAGING TEST` warning in the admin inbox. Enter it while authenticated as the staging test customer to verify the confirmation flow. Do not use real customer or production complaints for this test.

The worker marks an event `sent` only after OpenWA accepts the send request. A successful send is not proof that the WhatsApp recipient read the message. The customer payment confirmation endpoint must still be tested separately; do not manually update payment status or execute settlement SQL.
