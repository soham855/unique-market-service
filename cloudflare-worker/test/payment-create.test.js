import test from "node:test";
import assert from "node:assert/strict";
import { createPendingCashPayment, CashPaymentCreateError } from "../src/payment-create.js";

const complaintId = "11111111-1111-4111-8111-111111111111";
const admin = { id: "admin-1", role: "admin" };
const technician = { id: "tech-1", role: "technician" };

function mockDb(complaint = { id: complaintId, customer_id: "customer-1", technician_id: "tech-1" }) {
  const calls = [];
  let payment = null;
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
              if (sql.includes("FROM complaints WHERE")) return complaint;
              if (sql.includes("FROM payments WHERE id")) return payment;
              return null;
            },
          };
        },
      };
    },
    async batch(statements) {
      calls.push({ batch: statements });
      const insert = statements[1];
      payment = {
        id: insert.values[0], complaint_id: insert.values[8], customer_id: insert.values[9],
        amount: insert.values[2], mode: "Cash", status: "pending", payment_status: "Pending",
      };
      return [{ success: true }, { success: true }];
    },
  };
}

test("creates a pending Cash payment linked to the complaint customer", async () => {
  const db = mockDb();
  const result = await createPendingCashPayment(db, technician, technician.id,
    { complaintId, amount: 1250, notes: "Labour" }, "payment-create-001");
  assert.equal(result.replayed, false);
  assert.equal(result.payment.status, "pending");
  assert.equal(result.payment.mode, "Cash");
  assert.equal(result.payment.customer_id, "customer-1");
  const statements = db.calls.find(call => call.batch).batch;
  assert.match(statements[1].sql, /challan_id/);
  assert.match(statements[1].sql, /NULL/);
  assert.match(statements[1].sql, /'pending'/);
});

test("blocks a technician not assigned to the complaint", async () => {
  const db = mockDb({ id: complaintId, customer_id: "customer-1", technician_id: "tech-2" });
  await assert.rejects(
    () => createPendingCashPayment(db, technician, technician.id,
      { complaintId, amount: 100 }, "payment-create-002"),
    error => error instanceof CashPaymentCreateError && error.code === "technician_not_assigned_to_complaint",
  );
  assert.equal(db.calls.some(call => call.batch), false);
});

test("rejects invalid amounts before any write", async () => {
  for (const amount of [0, -1, 10000001, 1.001]) {
    const db = mockDb();
    await assert.rejects(
      () => createPendingCashPayment(db, admin, admin.id,
        { complaintId, amount }, "payment-create-003"),
      error => error.code === "invalid_payment_amount",
    );
    assert.equal(db.calls.some(call => call.batch), false);
  }
});

test("requires a valid idempotency key", async () => {
  const db = mockDb();
  await assert.rejects(
    () => createPendingCashPayment(db, admin, admin.id, { complaintId, amount: 100 }, "short"),
    error => error.code === "valid_idempotency_key_required",
  );
  assert.equal(db.calls.some(call => call.batch), false);
});

test("rejects customer and other roles", async () => {
  await assert.rejects(
    () => createPendingCashPayment(mockDb(), { id: "customer-1", role: "customer" },
      "customer-1", { complaintId, amount: 100 }, "payment-create-004"),
    error => error.code === "role_not_allowed",
  );
});
