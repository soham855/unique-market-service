# Unique Market — D1 staging API

This is an isolated staging Worker. It is not wired into the website, Flutter app, WhatsApp bot, or production Supabase traffic.

## Current scope

- `GET /health`: verifies the D1 binding with a read-only query.
- `GET /v1/me`: validates the caller's Supabase access token against Supabase Auth, then looks up the matching profile in the D1 staging database.
- CORS is restricted to the known Unique Market web origins and local Vite development.
- No write routes, customer-data migration, payment actions, or WhatsApp operations are implemented.

Supabase Auth remains the identity provider during the compatibility phase. The Worker must treat the verified Auth user ID as an untrusted request identity until verification succeeds, then read role and ownership from D1. A client-supplied role, user ID, customer ID, or technician ID must never grant access.

## Configure

1. Install Wrangler in a local development environment.
2. Set the Worker secret `SUPABASE_PUBLISHABLE_KEY` to the project's publishable key.
3. Confirm the D1 binding in `wrangler.toml` points only to `unique-market-staging`.
4. Run `npm test`.
5. Use a staging-only Worker name and URL. Do not attach the Worker to production routes or app configuration.

## Important limitations

- The D1 staging database contains schema only; it has no copied profiles or customer records. Therefore `/v1/me` will return 404 until a synthetic staging identity/profile is provisioned.
- The 9 Supabase Auth foreign keys and 148 RLS policies are not yet migrated. This Worker currently has no business-data endpoints.
- Secrets from Supabase Vault must be moved to Cloudflare Worker secrets/bindings, never into D1 or source control.
- D1 CHECK and public FK enforcement currently uses triggers. Validate delete/update semantics before any business writes are added.
- This scaffold intentionally fails closed and has no fallback to Supabase table access.

## Next implementation gates

1. Add synthetic staging identity fixtures and verify role/ownership checks.
2. Implement read-only complaint/profile endpoints with explicit role and row-ownership predicates.
3. Port complaint ticket numbering and status history in an atomic D1 transaction.
4. Port notification and WhatsApp outbox enqueueing with idempotency keys.
5. Port payment state changes only after a verified provider webhook or the existing customer WhatsApp OTP flow.
6. Implement and test the full authorization matrix before enabling any writes.


## Complaint engine (staging only)

The complaint engine helpers are implemented in `src/complaint-engine.js`, with 11 Node unit tests in `test/complaint-engine.test.js`.

The D1 staging database has an additional `ticket_number_counters` support table. It contains four empty-stage counters initialized to 1. These are not production counter values and must not be used for cutover. Reconcile source PostgreSQL sequence/counter state only during an explicitly approved data migration.

The helper module is not wired to any complaint write route. There is no complaint creation, assignment, status update, or WhatsApp enqueue endpoint yet. Authorization must be implemented from the complete RLS matrix before these helpers can be exposed.
