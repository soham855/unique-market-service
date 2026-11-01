import test from "node:test";
import assert from "node:assert/strict";
import { readComplaints } from "../src/complaint-api.js";

function fakeDb(rows = []) {
  let captured;
  return {
    get captured() { return captured; },
    prepare(sql) {
      return { bind(...values) { captured = { sql, values }; return { all: async () => ({ results: rows }) }; } };
    },
  };
}

test("admin complaint query is unscoped but bounded and parameterized", async () => {
  const db = fakeDb([{ id: "c1" }]);
  const rows = await readComplaints(db, { id: "admin-1", role: "admin" }, { status: "open", limit: 500, offset: -4 });
  assert.deepEqual(rows, [{ id: "c1" }]);
  assert.match(db.captured.sql, /WHERE c.status = \?/);
  assert.deepEqual(db.captured.values, ["open", 100, 0]);
});

test("customer query is limited to linked customer records", async () => {
  const db = fakeDb();
  await readComplaints(db, { id: "customer-1", role: "customer" });
  assert.match(db.captured.sql, /cu.user_id = \? OR cu.profile_id = \?/);
  assert.deepEqual(db.captured.values, ["customer-1", "customer-1", 50, 0]);
});

test("technician query sees assigned tickets and unassigned open tickets only", async () => {
  const db = fakeDb();
  await readComplaints(db, { id: "tech-1", role: "technician" });
  assert.match(db.captured.sql, /c.technician_id = \? OR \(c.technician_id IS NULL AND c.status = 'open'\)/);
  assert.deepEqual(db.captured.values, ["tech-1", 50, 0]);
});

test("unknown roles fail closed before querying D1", async () => {
  const db = fakeDb();
  await assert.rejects(() => readComplaints(db, { id: "u1", role: "super_admin" }), /Forbidden profile/);
  assert.equal(db.captured, undefined);
});

test("complaint IDs and status filters are bound values, not SQL fragments", async () => {
  const db = fakeDb();
  await readComplaints(db, { id: "tech-1", role: "technician" }, {
    complaintId: "x' OR 1=1 --", status: "open' OR 1=1 --",
  });
  assert.match(db.captured.sql, /c.id = \?/);
  assert.match(db.captured.sql, /c.status = \?/);
  assert.deepEqual(db.captured.values, ["x' OR 1=1 --", "tech-1", "open' OR 1=1 --", 50, 0]);
});
