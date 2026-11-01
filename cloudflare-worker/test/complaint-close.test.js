import test from "node:test";
import assert from "node:assert/strict";
import { closeComplaintAfterCashOtp, ComplaintCloseError } from "../src/complaint-close.js";

const complaintId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const tech = { id: "tech-1", role: "technician" };

function mockDb({ complaint = {}, payment = {}, pending = 0 } = {}) {
  const calls = [];
  let saved = null;
  return {
    calls,
    prepare(sql) {
      return {
        sql,
        bind(...values) {
          return {
            sql, values,
            async first() {
              calls.push({ sql, values });
              if (sql.includes("complaint_close_request_ledger WHERE actor_id")) return null;
              if (sql.includes("FROM complaints c LEFT JOIN customers")) return complaint;
              if (sql.includes("FROM payments p LEFT JOIN cash_payment_otp_challenges")) return payment;
              if (sql.includes("COUNT(*) AS count FROM payments")) return { count: pending };
              if (sql.includes("complaint_close_request_ledger WHERE id=?")) return saved;
              return null;
            },
            async all() {
              calls.push({ sql, values });
              return { results: [{ id: "admin-1", role: "admin" }, { id: "tech-1", role: "technician" }] };
            },
          };
        },
      };
    },
    async batch(statements) {
      calls.push({ batch: statements });
      const first = statements[0].values;
      saved = { id: first[0], complaint_id: complaintId, payment_id: paymentId, created_at: first[3] };
      return statements.map((_, index) => ({ success: true, meta: { changes: index < 2 ? 1 : 0 } }));
    },
  };
}

const validComplaint = {
  id: complaintId, ticket_no: "UM-2627/01", title: "CCTV Service", status: "resolved",
  technician_id: "tech-1", customer_id: "customer-1", customer_user_id: "customer-user",
  notification_phone: "9876543210",
};
const validPayment = {
  id: paymentId, customer_id: "customer-1", complaint_id: complaintId, amount: 500,
  mode: "Cash", status: "confirmed", payment_status: "Confirmed", challan_id: null,
  ledger_applied_at: "2026-11-01T10:00:00.000Z", used_at: "2026-11-01T10:00:00.000Z",
};

test("closes a resolved complaint only after customer cash OTP verification", async () => {
  const db = mockDb({ complaint: validComplaint, payment: validPayment });
  const result = await closeComplaintAfterCashOtp(db, tech, tech.id, complaintId,
    { paymentId }, "complaint-close-001");
  assert.equal(result.status, "closed");
  assert.equal(result.replayed, false);
  const statements = db.calls.find(call => call.batch).batch;
  assert.match(statements[0].sql, /otp.used_at IS NOT NULL/);
  assert.match(statements[1].sql, /status='closed'/);
  assert.ok(statements.some(statement => statement.sql.includes("whatsapp_notification_events")));
});

test("rejects an unverified or non-cash payment before writes", async () => {
  const db = mockDb({ complaint: validComplaint, payment: { ...validPayment, used_at: null } });
  await assert.rejects(
    () => closeComplaintAfterCashOtp(db, tech, tech.id, complaintId, { paymentId }, "complaint-close-002"),
    error => error instanceof ComplaintCloseError && error.code === "customer_cash_otp_verified_payment_required",
  );
  assert.equal(db.calls.some(call => call.batch), false);
});

test("rejects a technician who is not assigned", async () => {
  const db = mockDb({ complaint: { ...validComplaint, technician_id: "tech-2" }, payment: validPayment });
  await assert.rejects(
    () => closeComplaintAfterCashOtp(db, tech, tech.id, complaintId, { paymentId }, "complaint-close-003"),
    error => error.code === "technician_not_assigned_to_complaint",
  );
  assert.equal(db.calls.some(call => call.batch), false);
});

test("requires resolved complaint and no other pending payment", async () => {
  const notResolved = mockDb({ complaint: { ...validComplaint, status: "in_progress" }, payment: validPayment });
  await assert.rejects(
    () => closeComplaintAfterCashOtp(notResolved, tech, tech.id, complaintId, { paymentId }, "complaint-close-004"),
    error => error.code === "complaint_must_be_resolved_before_closing",
  );
  const pending = mockDb({ complaint: validComplaint, payment: validPayment, pending: 1 });
  await assert.rejects(
    () => closeComplaintAfterCashOtp(pending, tech, tech.id, complaintId, { paymentId }, "complaint-close-005"),
    error => error.code === "other_pending_payment_exists",
  );
  assert.equal(pending.calls.some(call => call.batch), false);
});

test("rejects invalid idempotency key and customer actor", async () => {
  await assert.rejects(
    () => closeComplaintAfterCashOtp(mockDb(), tech, tech.id, complaintId, { paymentId }, "short"),
    error => error.code === "valid_idempotency_key_required",
  );
  await assert.rejects(
    () => closeComplaintAfterCashOtp(mockDb(), { id: "customer-user", role: "customer" }, "customer-user",
      complaintId, { paymentId }, "complaint-close-006"),
    error => error.code === "role_not_allowed_to_close_complaint",
  );
});
