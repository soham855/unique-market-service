const SEQUENCE_KEYS = new Set(["complaint_ticket","whatsapp_ticket","complaint_no","service_ticket"]);
function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid complaint creation date");
  return date;
}
export function complaintFinancialYear(value) {
  const date = validDate(value);
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1;
  return String(startYear % 100).padStart(2, "0") + String((startYear + 1) % 100).padStart(2, "0");
}
export function formatNumberedTicket(sequence, number, createdAt = new Date()) {
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError("Ticket number must be a positive safe integer");
  const suffix = String(number).padStart(2, "0");
  if (sequence === "whatsapp_ticket") return `UMWA-${suffix}`;
  if (sequence === "complaint_ticket") return `UM-${complaintFinancialYear(createdAt)}/${suffix}`;
  if (sequence === "service_ticket" || sequence === "complaint_no") return `C/NO-${number}`;
  throw new TypeError("Unsupported ticket sequence");
}
export async function allocateSequence(db, sequenceKey) {
  if (!SEQUENCE_KEYS.has(sequenceKey)) throw new TypeError("Unsupported ticket sequence");
  const row = await db.prepare(
    "UPDATE ticket_number_counters SET next_number = next_number + 1 WHERE sequence_key = ? RETURNING next_number - 1 AS allocated"
  ).bind(sequenceKey).first();
  const allocated = Number(row?.allocated);
  if (!Number.isSafeInteger(allocated) || allocated < 1) throw new Error(`Ticket counter unavailable: ${sequenceKey}`);
  return allocated;
}
/** Mirrors live BEFORE INSERT trigger order; WhatsApp requests reuse UMWA ticket_no as complaint_no. */
export async function allocateComplaintNumbers(db, { category, createdAt = new Date() }) {
  if (category === "WhatsApp Service Request") {
    const number = await allocateSequence(db, "whatsapp_ticket");
    const ticketNo = formatNumberedTicket("whatsapp_ticket", number);
    return { ticketNo, complaintNo: ticketNo, sequence: "whatsapp_ticket" };
  }
  const ticketNumber = await allocateSequence(db, "complaint_ticket");
  const complaintNumber = await allocateSequence(db, "complaint_no");
  return {
    ticketNo: formatNumberedTicket("complaint_ticket", ticketNumber, createdAt),
    complaintNo: formatNumberedTicket("complaint_no", complaintNumber),
    sequence: "complaint_ticket",
  };
}
/** Mirrors live auto-assignment: only status=open and no existing technician. */
export async function findLeastLoadedTechnician(db, { status = "open", technicianId = null } = {}) {
  if (technicianId || status !== "open") return null;
  const row = await db.prepare(
    `SELECT p.id FROM profiles p WHERE p.role = 'technician'
      ORDER BY (SELECT COUNT(*) FROM complaints c WHERE c.technician_id = p.id
        AND c.status IN ('assigned', 'in_progress', 'open')), p.id LIMIT 1`
  ).first();
  return row?.id || null;
}
export function buildStatusHistoryRows({ complaintId, oldStatus, newStatus, actorId = null, remarks = null, uuid = () => crypto.randomUUID() }) {
  if (!complaintId || !newStatus || oldStatus === newStatus) return [];
  return [
    { table: "complaint_status_history", values: [uuid(), complaintId, oldStatus ?? null, newStatus, actorId, remarks] },
    { table: "ticket_status_history", values: [uuid(), complaintId, oldStatus ?? null, newStatus, null, remarks] },
  ];
}
/** Caller must authenticate and authorize before invoking. Both legacy histories are inserted in one D1 batch. */
export async function recordComplaintStatusChange(db, change) {
  const rows = buildStatusHistoryRows(change);
  if (!rows.length) return { recorded: 0 };
  await db.batch(rows.map((row) => db.prepare(
    row.table === "complaint_status_history"
      ? "INSERT INTO complaint_status_history (id, complaint_id, old_status, new_status, changed_by, note) VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO ticket_status_history (id, complaint_id, old_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(...row.values)));
  return { recorded: rows.length };
}
export function normalizePhoneDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}
export function buildWhatsAppEvent({ id = crypto.randomUUID(), complaintId, recipientUserId = null, phone, customerPhone = null, eventType, message, eventKey = null }) {
  const normalizedPhone = normalizePhoneDigits(phone);
  if (!complaintId || !eventType || !message || !normalizedPhone) return null;
  return {
    id, complaint_id: complaintId, recipient_user_id: recipientUserId,
    phone: normalizedPhone, customer_phone: customerPhone ? normalizePhoneDigits(customerPhone) : null,
    event_type: eventType, message, status: "pending", event_key: eventKey,
  };
}
