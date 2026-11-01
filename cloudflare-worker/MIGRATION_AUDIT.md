# Unique Market — Supabase to Cloudflare D1 staging audit

Date: 2026-11-01

## Scope and safety boundary

- Source inspected read-only: Supabase project `tfscvycomllamoubtlcf`.
- Target: Cloudflare D1 `unique-market-staging` (`a4840403-fcc2-4e94-8c27-a42cb84603a8`).
- Code work is isolated to Git branch `cloudflare-d1-staging`.
- No production Supabase DDL/DML, production routing, VPS/Render operation, WhatsApp auth/pairing, or customer data migration is part of this phase.

## Source inventory (live catalog)

| Item | Verified count |
|---|---:|
| Public tables | 52 |
| Public columns | 545 |
| Public functions | 40 |
| Distinct public trigger names | 26 |
| Trigger event rows | 35 |
| Public RLS policies | 148 |
| Tables with RLS policies | 45 |

The repository contains migrations and app code, but the live catalog is the authority for current database behavior. Do not blindly replay older repository migrations as a substitute for the live schema.

## Application architecture

- React web and Flutter clients currently use Supabase Auth and direct Supabase table access.
- The WhatsApp bot also uses Supabase service-role access for operational reads/writes.
- Replacing the database therefore requires a Worker API boundary and client migration; changing only the database binding is insufficient.
- Compatibility proposal: keep Supabase Auth as identity provider initially; Worker verifies the bearer token through Supabase Auth, then loads the matching profile/role from D1. The Worker must derive identity only from the verified Auth response and must never trust client-supplied role/user/customer/technician IDs.
- D1 has no Supabase Auth or PostgreSQL RLS. Authorization must be explicit in every Worker handler, with row ownership predicates in the SQL itself.

## Live trigger/function findings that affect porting

### Complaint creation and numbering
- Live complaint triggers include `complaints_assign_ticket_no`, `trg_generate_service_ticket_no`, and `trg_set_complaint_no`.
- The live `assign_complaint_ticket_no` function generates `UM-YYZZ/NN` for ordinary complaints and `UMWA-NN` for WhatsApp Service Request category.
- `generate_service_ticket_no` also writes `ticket_no` if blank, while `set_complaint_no` writes `complaint_no`. Trigger ordering and historical sequence behavior must be preserved intentionally, not inferred from one migration file.
- `auto_assign_complaint_to_technician` assigns the least-loaded technician only when status is exactly `open`; current web/Flutter complaint creation uses `New` in at least one flow. Do not normalize these status values without compatibility tests.
- Two separate status-history trigger paths exist: `complaints_status_history_trigger` and `trg_record_ticket_status_change`, writing to different history tables. Preserve the intended audit/history behavior and avoid accidental duplicate or missing events.

### WhatsApp notifications
- Live trigger `complaint_whatsapp_event_queue` invokes `queue_whatsapp_complaint_event` and writes event rows using `complaint_id`, `recipient_user_id`, `event_type`, `phone`, `customer_phone`, and `message`.
- The checked-in migration `20260925180000_whatsapp_notification_outbox.sql` describes a different event-key/status-oriented shape. The live table/function definition must win; reconcile both event models before porting.
- Preserve customer-only OTP routing, idempotency, and the current WhatsApp auth/persistent-volume safety boundary. Never route payment OTP to a staff number.

### Payments and challans
- Cash technician payment confirmation is guarded by `enforce_cash_payment_otp`; the existing Edge Function requests and verifies a customer WhatsApp OTP.
- `validate_challan_payment` enforces challan/customer matching, positive amounts, and remaining balance.
- Both `apply_confirmed_payment_to_challan` and `sync_challan_payment` are attached to payment writes and affect challan totals. Reconcile their order and semantics before porting to avoid double application or ledger drift.
- Payment status changes must remain server-side and atomic. No client-side direct confirmation endpoint is allowed.

### Stock and notifications
- `apply_stock_movement` updates product stock based on movement type; this needs atomicity and idempotency when moved to Worker/API.
- `notify_complaint_event` and `notify_payment_event` fan out role notifications. `create_role_notification` silently catches errors in the source implementation; Worker port should log safe operational diagnostics without leaking personal/payment data.
- Vault-backed secrets must become Cloudflare Worker secrets/bindings, never D1 rows or source-controlled constants.

## RLS migration strategy

148 policies across 45 tables are not 148 independent rules. Some tables have overlapping, legacy, or hardened policy variants, especially `complaints`, `profiles`, `service_visits`, `service_history`, `sites`, and `amc`. Policy names and SQL predicates must be consolidated into a reviewed role/action/ownership matrix before implementing endpoints. Do not mechanically translate each policy into a separate endpoint.

## Worker scaffold created on this branch

- `GET /health`: read-only D1 binding health check.
- `GET /v1/me`: Supabase Auth token verification followed by D1 profile/role lookup.
- CORS allowlist for the known Unique Market web origins and local Vite development.
- No business-data write routes or production routing.
- Node tests cover health, CORS, method restrictions, missing auth, verified identity-to-profile lookup, and invalid-role rejection.

## Implementation order

1. Finish auth/profile identity mapping and staging-only synthetic fixture tests.
2. Implement read-only profile, complaint, and assigned-technician views with explicit authorization.
3. Port complaint numbering, auto-assignment, and status-history behavior with atomic D1 operations.
4. Port notification and WhatsApp outbox with idempotency.
5. Port payment/challan workflows only after OTP, provider webhook, balance, and concurrency tests.
6. Port inventory/stock movement and AMC/business workflows.
7. Build the full authorization matrix from all 148 live policies and test every route by role and ownership.
8. Only then assess app migration, staging integration, backup/rollback, and deployment readiness.

## Current status

This is a staging code scaffold and source audit, not a completed application migration. The Worker has not been deployed, no app configuration points to it, and no user/customer/payment/WhatsApp data has been copied.


## Complaint Engine — staging implementation update (2026-11-01)

### Source behavior confirmed from live PostgreSQL
- Ordinary complaint ticket: `UM-YYZZ/NN`, with Indian financial year changing on 1 April.
- WhatsApp Service Request ticket: `UMWA-NN`; the same value is copied into `complaint_no`.
- Ordinary complaint `complaint_no`: `C/NO-N`.
- The live BEFORE INSERT trigger names sort so `complaints_assign_ticket_no` runs before `trg_generate_service_ticket_no` and `trg_set_complaint_no`. This means the generic service-ticket sequence is normally bypassed after the first trigger assigns `ticket_no`.
- Auto-assignment only runs when technician is absent and `COALESCE(status,'open')='open'`; least-loaded count uses statuses `assigned`, `in_progress`, `open`, then profile ID as tie-break.
- A status change writes both `complaint_status_history` (including verified actor ID) and `ticket_status_history` (legacy trigger leaves actor/remarks unset).

### Staging code added
- `src/complaint-engine.js`: FY formatter, exact ticket number formats, atomic counter allocation via SQLite `UPDATE ... RETURNING`, least-loaded technician selection, dual-history batch helper, phone normalization, and WhatsApp event builder.
- `migrations/0001_ticket_number_counters.sql`: creates one support table with four independent counters.
- `test/complaint-engine.test.js`: 11 unit tests.
- `.github/workflows/d1-staging-worker-tests.yml`: Node 22 test workflow.

### D1 staging application
- D1 now has 53 tables (the original 52 plus `ticket_number_counters`).
- Four staging-only sequence rows exist, each initialized to 1.
- Verified the D1 `UPDATE ... RETURNING` allocation syntax returned 1; the test counter was reset to 1 and re-read successfully.
- Current staging row counts: complaints 0, customers 0, profiles 0, WhatsApp notification events 0.
- These initial counters are only for an empty staging database. They must NOT be used for cutover. The live Supabase counter/sequence state must be reconciled during a separately approved data migration.

### Important scope limit
The helpers are not yet connected to a complaint write route. No complaint can be created through this Worker. The caller must implement and pass the complete RLS-derived authorization checks before using any helper. Complaint create, status update, WhatsApp enqueue, and technician assignment are not production-ready.


### Final verification for this phase
- D1 contains 53 application tables plus Cloudflare's internal `_cf_KV` table; 314 previously created constraint/FK triggers remain present.
- The four counter rows remain at 1 after the SQL allocation probe was reset and re-read.
- GitHub Actions run for the Worker code: 18 tests passed, 0 failed. The first run caught a syntax issue in the Worker auth URL normalization; this was corrected and the rerun passed.
- Latest staging branch includes this audit update; production `main` remains unchanged.

## Complaint creation API update (2026-11-01)

### Live source details verified
- BEFORE INSERT triggers execute alphabetically. complaints_assign_ticket_no sets ticket_no before trg_generate_service_ticket_no, so the generic C/NO- service-ticket generator is normally bypassed for ticket_no; trg_set_complaint_no then generates the separate ordinary complaint_no.
- Ordinary complaints use the live counter-backed UM-YYZZ/NN plus C/NO-N; WhatsApp Service Request uses UMWA-NN for both fields.
- Auto-assignment uses the least-loaded technician only for an unassigned open complaint. No eligible technician leaves the complaint open.
- Source INSERT notification behavior fans out to the linked customer, all admins, and all technicians; it also writes a pending customer WhatsApp event when a customer phone exists.
- The live complaint INSERT policies overlap. One legacy policy compares complaints.customer_id directly with auth.uid(), while the FK points to customers.id; another policy allows admin or matching auth ID. The Worker create route instead resolves a unique customer row from verified customers.user_id / profile_id for customer-role users, and requires an existing customer row for admin requests.
- Live production counters/sequences are not the staging counter values. Staging counters remain at 1; production values must be reconciled only during a separately approved cutover/data migration.

### Staging implementation
- Added src/complaint-create.js and authenticated POST /v1/complaints.
- Added migrations/0002_complaint_create_requests.sql and applied the schema-only idempotency ledger to D1 staging.
- Server controls ticket numbers, complaint numbers, initial status, technician assignment, and customer identity fields; client-supplied versions are ignored.
- Customer creation requires exactly one linked customer record. Admin creation requires an existing customerId. Technician creation is denied.
- Requires an actor-scoped Idempotency-Key; complaint, idempotency ledger, role notifications, and pending WhatsApp event are written in a single D1 batch. Ticket counter allocation is atomic but separate; failed requests may leave a harmless number gap.
- The WhatsApp event is queued only; no message is sent and no bot/session/auth state is touched.
- No status-update route, customer provisioning, or data copy was performed.

### Verification
- D1 staging now has 54 application tables; complaint_create_requests has 0 rows.
- D1 PRAGMA foreign_key_check returned no violations; all four staging counters remain at 1; no customer/complaint/profile rows were inserted.
- GitHub Actions run 41304722771: 31/31 Worker tests passed.
- Branch: cloudflare-d1-staging; no deployment and no production/main change.
## Complaint status update API update (2026-11-01)

### Source behavior and authorization
- Live RLS has overlapping complaint UPDATE policies. The effective intended technician rule is: update an assigned complaint only when technician_id equals auth.uid(), or claim an unassigned open complaint; the WITH CHECK requires the new technician_id to equal the authenticated technician or the actor to be admin.
- Admin and technician update policies overlap. Customer UPDATE policies compare customer_id to auth.uid() even though customer_id references customers.id; the Worker intentionally denies customer status changes.
- React app uses lower-case statuses including open, assigned, technician_on_way, in_progress, on_hold, resolved, closed, cancelled. Flutter also contains legacy labels New, Assigned, In Service, Completed. The Worker recognizes these legacy prior-state labels but writes canonical lower-case values.
- Source triggers write both complaint_status_history and ticket_status_history, fan out role notifications, enqueue WhatsApp events for assigned/technician_on_way/in_progress/resolved/closed, and append a Google review link to resolved/closed/completed status messages.
- closed is intentionally excluded from this endpoint because the product rule requires verified payment or customer WhatsApp OTP before closing. A separate payment-gated close flow remains unimplemented.

### Staging implementation
- Added src/complaint-status.js and PATCH /v1/complaints/:id/status.
- Added migrations/0003_complaint_status_update_requests.sql and applied schema-only ledger to D1 staging.
- Requires expectedStatus, allowed transition, authenticated admin/assigned technician, and actor-scoped Idempotency-Key.
- Technician may claim only unassigned open/New complaint; server sets technician_id, assigned_at, and scheduled_visit_date.
- Status update, both history rows, role notifications, admin audit log, and eligible pending customer WhatsApp event are batched together.
- No synthetic customer, complaint, or profile rows were inserted; no WhatsApp message was sent.

### Verification
- GitHub Actions run 41307179357: 45/45 tests passed, 0 failed.
- D1 EXPLAIN checks passed for the status ledger insert, complaint update, both history inserts, notifications, WhatsApp outbox, and admin activity audit SQL; all EXPLAIN probes wrote 0 rows.
- D1 status idempotency ledger contains 0 rows; complaints, profiles, notifications, WhatsApp events, and both history tables remain empty.
- D1 PRAGMA foreign_key_check returned no violations.
- Admin reopening to open clears technician_id, assigned_at, and scheduled_visit_date; the technician claim path sets them.
- No Worker deployment or production change.

## Complaint status update API update (2026-11-01)

- Live UPDATE RLS policies were inspected: admins can update; assigned technicians can update; technicians may claim unassigned open complaints. Customer-role status writes are denied.
- Live notification type constraint includes `complaint_status`; WhatsApp event types include `created`, `assigned`, and `status_changed`, with event state limited to pending/sent/failed.
- Added staging idempotency table `complaint_status_update_requests` (request_id primary key; actor + idempotency key unique).
- PATCH `/v1/complaints/:id/status` requires verified Supabase Auth identity, D1 role, an expected status, a supported next status, and an idempotency key.
- Technician status transitions are restricted to their assigned complaint; they may claim an unassigned open complaint. Admin transitions use an explicit allowlist.
- The endpoint refuses `closed` with `payment_verification_required_before_closing`; cash OTP/payment verification is not bypassed.
- Complaint row, both history tables, app notifications, pending WhatsApp outbox event, idempotency record, and (for admin actions only) admin activity log are committed through one D1 batch.
- Resolved status event uses the saved Unique Market review URL. WhatsApp remains queued only; this Worker does not send messages or touch WhatsApp pairing/auth.
- D1 idempotency ledger has 0 rows; no synthetic or customer complaint data was inserted.
- GitHub Actions run [41311418041](https://github.com/soham855/unique-market-service/actions/runs/41311418041): 45/45 tests passed.
- Branch `cloudflare-d1-staging`; no Worker deployment and no production/main change.


## Cash payment OTP / complaint closure audit (2026-11-01)

**Status: BLOCKED — do not implement payment confirmation or complaint closure until the live source inconsistencies below are resolved. No production writes were made.**

Live Supabase inspection found:

1. `payments_technician_insert_cash` permits technicians to INSERT `mode='Cash', source='technician', status='confirmed'`. The `payments_require_cash_otp` trigger is UPDATE-only and checks OTP only when an existing payment transitions to confirmed. Therefore the current insert policy can bypass OTP on direct cash-payment creation.
2. The existing `cash-payment-otp` Edge Function accepts only `status='pending'` payments, but the technician cash INSERT policy requires `status='confirmed'`. The supported policy and function workflow conflict.
3. The existing Edge Function queues OTP as `event_type='cash_payment_otp'` in `whatsapp_notification_events`, but the live table CHECK constraint permits only `created`, `assigned`, and `status_changed`. The OTP outbox insert will be rejected.
4. The active `process-whatsapp-queue` Edge Function reads from `public.whatsapp_queue`; live catalog confirms that table does not exist. The actual event table is `whatsapp_notification_events`. This queue worker cannot process the event table as written.
5. `cash_payment_otp_challenges` has RLS enabled and no table policies were returned, so access is service-role-only (appropriate for server-side OTP handling, but not a client write path).
6. Existing OTP verification increments attempts with a read-then-write sequence and performs challenge consumption and payment confirmation as separate HTTP writes. This needs a transactional, concurrency-safe operation before it can be treated as a reliable one-time verification flow.
7. Payment/challan ledger logic has two separate triggers (`apply_confirmed_payment_to_challan` and `sync_challan_payment`) which both update challan totals. Their combined semantics need explicit idempotency testing before porting.

**Safe migration requirements before implementation:**
- Make technician cash payments pending until OTP verification; remove the direct-confirm bypass and enforce OTP on every path that confirms technician cash.
- Ensure challenge creation, OTP attempt increment/consume, payment confirmation and ledger application are atomic or use a single server-side transaction/RPC with compare-and-set guards.
- Route OTP delivery through one verified queue contract; align event type constraints and the actual queue consumer. Do not broaden the outbox CHECK blindly.
- Use registered customer phone only; never return OTP to technician/admin; five-minute expiry, max five attempts, one-time use, resend invalidates prior challenge, rate-limit requests.
- Only after confirmed payment and all required amount/balance rules pass may a separate complaint closure operation transition to `closed`. Unpaid / partially paid / rejected payments must not close the complaint.
- Do not change production policies, triggers, Edge Functions, payment rows, OTP rows or WhatsApp sessions without explicit approval and backup/rollback review.

Staging D1 already has schema-only `payments` and `cash_payment_otp_challenges` tables. No test payment, customer, OTP challenge or complaint rows were inserted. No Worker deployment occurred.
