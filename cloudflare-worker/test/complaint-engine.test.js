import test from "node:test";
import assert from "node:assert/strict";
import {
  complaintFinancialYear, formatNumberedTicket, allocateSequence, allocateComplaintNumbers,
  findLeastLoadedTechnician, buildStatusHistoryRows, recordComplaintStatusChange,
  normalizePhoneDigits, buildWhatsAppEvent,
} from "../src/complaint-engine.js";

test("financial year changes on 1 April using UTC date parts", () => {
  assert.equal(complaintFinancialYear("2026-03-31T23:59:59Z"), "2526");
  assert.equal(complaintFinancialYear("2026-04-01T00:00:00Z"), "2627");
});
test("ticket formats preserve live prefixes and zero padding", () => {
  assert.equal(formatNumberedTicket("complaint_ticket", 7, "2026-11-01"), "UM-2627/07");
  assert.equal(formatNumberedTicket("whatsapp_ticket", 8), "UMWA-08");
  assert.equal(formatNumberedTicket("complaint_no", 44), "C/NO-44");
  assert.equal(formatNumberedTicket("service_ticket", 11), "C/NO-11");
});
test("counter allocation uses one atomic UPDATE RETURNING", async () => {
  let capturedSql = "", capturedKey = "";
  const db = { prepare(sql) { capturedSql = sql; return { bind(key) { capturedKey = key; return { first: async () => ({ allocated: 17 }) }; } }; } };
  assert.equal(await allocateSequence(db, "complaint_ticket"), 17);
  assert.match(capturedSql, /UPDATE ticket_number_counters SET next_number = next_number \+ 1/);
  assert.match(capturedSql, /RETURNING next_number - 1 AS allocated/);
  assert.equal(capturedKey, "complaint_ticket");
});
test("unknown sequence names and unavailable counters fail closed", async () => {
  await assert.rejects(() => allocateSequence({}, "customer_id"), /Unsupported ticket sequence/);
  const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
  await assert.rejects(() => allocateSequence(db, "whatsapp_ticket"), /counter unavailable/);
});
test("normal complaint allocates UM and C/NO values", async () => {
  const keys = [];
  const db = { prepare() { return { bind(key) { keys.push(key); return { first: async () => ({ allocated: keys.length + 2 }) }; } }; } };
  const result = await allocateComplaintNumbers(db, { category: "CCTV", createdAt: "2026-11-01T00:00:00Z" });
  assert.deepEqual(keys, ["complaint_ticket", "complaint_no"]);
  assert.equal(result.ticketNo, "UM-2627/03");
  assert.equal(result.complaintNo, "C/NO-4");
});
test("WhatsApp complaint reuses UMWA ticket as complaint number", async () => {
  const keys = [];
  const db = { prepare() { return { bind(key) { keys.push(key); return { first: async () => ({ allocated: 12 }) }; } }; } };
  const result = await allocateComplaintNumbers(db, { category: "WhatsApp Service Request" });
  assert.deepEqual(keys, ["whatsapp_ticket"]);
  assert.equal(result.ticketNo, "UMWA-12");
  assert.equal(result.complaintNo, "UMWA-12");
});
test("auto-assignment only queries when status is open and technician is absent", async () => {
  let queried = false;
  const db = { prepare() { queried = true; return { first: async () => ({ id: "tech-1" }) }; } };
  assert.equal(await findLeastLoadedTechnician(db, { status: "New" }), null);
  assert.equal(await findLeastLoadedTechnician(db, { status: "open", technicianId: "tech-2" }), null);
  assert.equal(queried, false);
  assert.equal(await findLeastLoadedTechnician(db), "tech-1");
  assert.equal(queried, true);
});
test("status history builder mirrors both legacy history tables", () => {
  let id = 0;
  const rows = buildStatusHistoryRows({
    complaintId: "complaint-1", oldStatus: "open", newStatus: "assigned",
    actorId: "admin-1", remarks: "Assigned to technician", uuid: () => `uuid-${++id}`,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].table, "complaint_status_history");
  assert.deepEqual(rows[0].values, ["uuid-1", "complaint-1", "open", "assigned", "admin-1", "Assigned to technician"]);
  assert.equal(rows[1].table, "ticket_status_history");
  assert.deepEqual(rows[1].values, ["uuid-2", "complaint-1", "open", "assigned", null, "Assigned to technician"]);
  assert.deepEqual(buildStatusHistoryRows({ complaintId: "x", oldStatus: "open", newStatus: "open" }), []);
});
test("status history inserts both legacy records in one batch", async () => {
  let batchStatements = [];
  const db = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) { batchStatements = statements; return []; },
  };
  const result = await recordComplaintStatusChange(db, {
    complaintId: "complaint-1", oldStatus: "open", newStatus: "assigned", actorId: "admin-1",
    uuid: (() => { let i = 0; return () => `uuid-${++i}`; })(),
  });
  assert.deepEqual(result, { recorded: 2 });
  assert.equal(batchStatements.length, 2);
  assert.match(batchStatements[0].sql, /INSERT INTO complaint_status_history/);
  assert.match(batchStatements[1].sql, /INSERT INTO ticket_status_history/);
});
test("phone normalization strips all non-digits", () => {
  assert.equal(normalizePhoneDigits("+91 73500-60071"), "917350060071");
});
test("WhatsApp event builder rejects missing phone and normalizes recipients", () => {
  assert.equal(buildWhatsAppEvent({ complaintId: "c1", phone: "", eventType: "created", message: "hi" }), null);
  const event = buildWhatsAppEvent({
    id: "event-1", complaintId: "complaint-1", recipientUserId: "customer-1",
    phone: "+91 73500 60071", customerPhone: "07350060071", eventType: "created", message: "Complaint received",
  });
  assert.equal(event.phone, "917350060071");
  assert.equal(event.customer_phone, "07350060071");
  assert.equal(event.status, "pending");
});
