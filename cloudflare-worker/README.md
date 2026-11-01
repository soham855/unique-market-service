# Unique Market — D1 staging API

This is an isolated staging Worker. It is not wired into the website, Flutter app, WhatsApp bot, or production Supabase traffic.

## Current scope

- `GET /health`: verifies the D1 binding with a read-only query.
- `GET /v1/me`: validates the caller's Supabase access token against Supabase Auth, then looks up the matching profile in the D1 staging database.
- `GET /v1/complaints` and `GET /v1/complaints/:id`: read-only complaint queries with role-based row scoping (admin, linked customer, assigned technician, or unassigned open technician queue). Supports bounded `limit`/`offset` and an optional exact `status` filter.
- CORS is restricted to the known Unique Market web origins and local Vite development.
- POST /v1/complaints: staging-only authenticated creation for linked customers and admins. Requires an Idempotency-Key; assigns server-generated ticket numbers, applies the live least-loaded technician rule, and atomically writes the complaint, idempotency record, role notifications, and customer WhatsApp outbox event in one D1 batch. No customer-data migration, payment actions, or WhatsApp sending operation is implemented.

Supabase Auth remains the identity provider during the compatibility phase. The Worker must treat the verified Auth user ID as an untrusted request identity until verification succeeds, then read role and ownership from D1. A client-supplied role, user ID, customer ID, or technician ID must never grant access.

## Configure

1. Install Wrangler in a local development environment.
2. Set the Worker secret `SUPABASE_PUBLISHABLE_KEY` to the project's publishable key.
3. Confirm the D1 binding in `wrangler.toml` points only to `unique-market-staging`.
4. Run `npm test`.
5. Use a staging-only Worker name and URL. Do not attach the Worker to production routes or app configuration.

## Important limitations

- The D1 staging database contains schema only; it has no copied profiles or customer records. Therefore /v1/me and complaint creation return 404/409 until a synthetic staging identity/profile and linked customer row are provisioned.
- The 9 Supabase Auth foreign keys and 148 RLS policies are not yet migrated. Only the specific read/create complaint authorization predicates are implemented in the Worker; the full role/action/ownership matrix remains incomplete.
- Secrets from Supabase Vault must be moved to Cloudflare Worker secrets/bindings, never into D1 or source control.
- D1 CHECK and public FK enforcement currently uses triggers. Complaint creation uses a single D1 batch for complaint + idempotency + notification/outbox inserts; sequence allocation is atomic but separate, so a failed create can leave a harmless ticket-number gap.
- This scaffold intentionally fails closed and has no fallback to Supabase table access.

## Next implementation gates

1. Add synthetic staging identity fixtures and verify role/ownership checks.
2. Implement read-only complaint/profile endpoints with explicit role and row-ownership predicates.
3. Complete staging fixture tests for complaint creation, duplicate idempotency races, and all customer/admin ownership paths.
4. Port complaint status updates and both history tables, then test technician assignment changes and WhatsApp status notifications.
5. Port payment state changes only after a verified provider webhook or the existing customer WhatsApp OTP flow.
6. Implement and test the full authorization matrix before enabling any writes.


## Complaint engine (staging only)

The complaint engine helpers are implemented in `src/complaint-engine.js`, with 11 Node unit tests in `test/complaint-engine.test.js`.

The D1 staging database has an additional `ticket_number_counters` support table. It contains four empty-stage counters initialized to 1. These are not production counter values and must not be used for cutover. Reconcile source PostgreSQL sequence/counter state only during an explicitly approved data migration.

The ticket helpers are wired to the staging-only POST /v1/complaints route. Complaint GET endpoints and the create route verify Supabase Auth identity, then derive role and customer ownership from D1. Create is limited to linked customers and admins; technicians are denied. It generates ticket numbers, auto-assigns only when an eligible technician exists, and batches the complaint, idempotency ledger, role notifications, and customer WhatsApp event. No status-update route or WhatsApp sender is present. The complete 148-policy RLS matrix still needs reconciliation.

## Complaint creation API (staging only)

Request:
```http
POST /v1/complaints
Authorization: Bearer <Supabase access token>
Idempotency-Key: <unique request key>
Content-Type: application/json
```

Example body:
```json
{
  "category": "CCTV Service",
  "title": "Camera offline",
  "description": "Camera 3 has no video",
  "serviceType": "CCTV Repair",
  "locationText": "Shop floor",
  "address": "Customer site address",
  "priority": "normal"
}
```

- Customer accounts are resolved only through a unique customers.user_id or customers.profile_id mapping; a client-supplied customer ID is ignored for customer-role requests.
- Admin requests must provide an existing customerId.
- Technician accounts cannot create complaints.
- Ticket number, complaint number, status, technician assignment, customer name, and customer phone are server-derived.
- Idempotency-Key is required and scoped to the authenticated actor. Replays return the original complaint.
- Complaint, idempotency row, app notifications, and (when a customer phone exists) a pending WhatsApp event are inserted in one D1 batch. The event is queued only; this API does not send WhatsApp messages.
- Attachment URLs must use HTTPS. Latitude/longitude are range-checked.
- The customer mapping must be provisioned in staging before testing; no production or customer data was copied.
- The live Supabase INSERT policy set contains overlapping rules, including a legacy customer_id = auth.uid() predicate even though complaints.customer_id references customers.id. The Worker uses the verified profile-to-customer mapping explicitly instead of trusting a request-supplied ID. This rule still needs formal consolidation in the 148-policy authorization matrix.