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
