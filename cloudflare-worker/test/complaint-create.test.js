import test from "node:test";
import assert from "node:assert/strict";
import { createComplaint, ComplaintCreateError } from "../src/complaint-create.js";

function fakeDb({ customer = { id:"cust-1", name:"Test Customer", mobile:"+91 9000000000", address:"Test address", user_id:"user-1" }, technicians = [], previous = null } = {}) {
  const calls = [];
  const counters = { complaint_ticket:1, whatsapp_ticket:1, complaint_no:1, service_ticket:1 };
  return {
    calls,
    prepare(sql) {
      return {
        first: async () => {
          calls.push({ kind:"first-unbound", sql, values:[] });
          if (sql.includes("SELECT p.id FROM profiles p")) return technicians[0] ? { id:technicians[0].id } : null;
          return null;
        },
        all: async () => {
          calls.push({ kind:"all-unbound", sql, values:[] });
          if (sql.includes("FROM profiles WHERE role")) return { results:technicians };
          return { results:[] };
        },
        bind(...values) {
          return {
            first: async () => {
              calls.push({ kind:"first", sql, values });
              if (sql.includes("complaint_create_requests")) return previous;
              if (sql.includes("UPDATE ticket_number_counters")) {
                const key = values[0];
                const allocated = counters[key];
                counters[key] += 1;
                return { allocated };
              }
              if (sql.includes("FROM customers WHERE id")) return customer;
              return null;
            },
            all: async () => {
              calls.push({ kind:"all", sql, values });
              if (sql.includes("FROM customers WHERE user_id")) return { results:customer ? [customer] : [] };
              if (sql.includes("FROM profiles WHERE role")) return { results:technicians };
              return { results:[] };
            },
            run: async () => ({ success:true }),
          };
        },
      };
    },
    async batch(statements) {
      calls.push({ kind:"batch", count:statements.length });
      return statements.map(() => ({ success:true }));
    },
  };
}

test("customer create is owner-bound, assigns a ticket and writes notifications/outbox in one batch", async () => {
  const db = fakeDb({ technicians:[{ id:"tech-1", role:"technician" }] });
  const result = await createComplaint(db, { id:"user-1", role:"customer" }, { category:"CCTV Service", title:"Camera offline", description:"No video" }, "user-1", "request-0001");
  assert.equal(result.replayed, false);
  assert.match(result.complaint.ticket_no, /^UM-\d{4}\/\d{2}$/);
  assert.equal(result.complaint.status, "assigned");
  assert.equal(db.calls.filter(x => x.kind === "batch").length, 1);
  assert.ok(db.calls.find(x => x.kind === "batch").count >= 4);
});

test("customer without a linked customer row is rejected", async () => {
  const db = fakeDb({ customer:null });
  await assert.rejects(() => createComplaint(db, { id:"user-1", role:"customer" }, { category:"CCTV" }, "user-1", "request-0002"), e => e instanceof ComplaintCreateError && e.status === 409);
  assert.equal(db.calls.some(x => x.kind === "batch"), false);
});

test("technicians cannot create complaints", async () => {
  const db = fakeDb();
  await assert.rejects(() => createComplaint(db, { id:"tech-1", role:"technician" }, { category:"CCTV" }, "tech-1", "request-0003"), e => e.status === 403);
});

test("idempotent replay returns the existing complaint without allocating or writing", async () => {
  const previous = { id:"c-existing", ticket_no:"UM-2627/01", complaint_no:"C/NO-1", status:"open", created_at:"2026-11-01T00:00:00.000Z" };
  const db = fakeDb({ previous });
  const result = await createComplaint(db, { id:"user-1", role:"customer" }, { category:"CCTV" }, "user-1", "request-0004");
  assert.equal(result.replayed, true);
  assert.deepEqual(result.complaint, previous);
  assert.equal(db.calls.some(x => x.kind === "batch"), false);
});

test("client cannot inject ticket numbers, status, or technician assignment", async () => {
  const db = fakeDb();
  const result = await createComplaint(db, { id:"user-1", role:"customer" }, { category:"CCTV", ticketNo:"FORGED", status:"closed", technicianId:"evil" }, "user-1", "request-0005");
  assert.notEqual(result.complaint.ticket_no, "FORGED");
  assert.equal(result.complaint.status, "open");
});

test("invalid attachment URLs are rejected before batch", async () => {
  const db = fakeDb();
  await assert.rejects(() => createComplaint(db, { id:"user-1", role:"customer" }, { category:"CCTV", photoUrl:"http://unsafe.test/x" }, "user-1", "request-0006"), /invalid_photo_url/);
  assert.equal(db.calls.some(x => x.kind === "batch"), false);
});
