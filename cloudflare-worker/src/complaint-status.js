import { buildWhatsAppEvent, normalizePhoneDigits } from "./complaint-engine.js";

export class ComplaintStatusError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

const ALLOWED_STATUSES = new Set([
  "open", "assigned", "technician_on_way", "in_progress", "on_hold", "resolved", "cancelled",
]);
const TECHNICIAN_TRANSITIONS = {
  open: ["assigned"],
  assigned: ["technician_on_way", "in_progress", "on_hold", "resolved"],
  technician_on_way: ["in_progress", "on_hold", "resolved"],
  in_progress: ["on_hold", "resolved"],
  on_hold: ["in_progress", "resolved"],
};
const ADMIN_TRANSITIONS = {
  open: ["cancelled"],
  assigned: ["open", "technician_on_way", "in_progress", "on_hold", "resolved", "cancelled"],
  technician_on_way: ["assigned", "in_progress", "on_hold", "resolved", "cancelled"],
  in_progress: ["assigned", "on_hold", "resolved", "cancelled"],
  on_hold: ["assigned", "technician_on_way", "in_progress", "resolved", "cancelled"],
  resolved: ["assigned", "in_progress", "cancelled"],
  cancelled: ["open"],
};

const cleanText = (value, max, field) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new ComplaintStatusError(400, `invalid_${field}`);
  }
  return value.trim() || null;
};

function normalizeStatus(status) {
  const aliases = { "New":"open", "Assigned":"assigned", "In Service":"in_progress", "Completed":"resolved", "technician on way":"technician_on_way", "in progress":"in_progress", "on hold":"on_hold" };
  return aliases[status] || status;
}

function transitionAllowed(role, oldStatus, newStatus, assignedToActor) {
  oldStatus = normalizeStatus(oldStatus);
  if (!ALLOWED_STATUSES.has(newStatus)) return false;
  if (role === "admin") return (ADMIN_TRANSITIONS[oldStatus] || []).includes(newStatus);
  if (role === "technician") {
    if (oldStatus === "open" && newStatus === "assigned") return true;
    return assignedToActor && (TECHNICIAN_TRANSITIONS[oldStatus] || []).includes(newStatus);
  }
  return false;
}

export async function updateComplaintStatus(db, profile, actorId, complaintId, input, idempotencyKey) {
  if (!profile?.id || !actorId || !["admin", "technician"].includes(profile.role)) {
    throw new ComplaintStatusError(403, "role_not_allowed_to_update_status");
  }
  if (!/^[0-9a-f-]{36}$/i.test(complaintId || "")) {
    throw new ComplaintStatusError(400, "invalid_complaint_id");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ComplaintStatusError(400, "invalid_json_body");
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new ComplaintStatusError(400, "valid_idempotency_key_required");
  }
  const newStatus = cleanText(input.status, 40, "status");
  const expectedStatus = cleanText(input.expectedStatus, 40, "expected_status");
  const note = cleanText(input.note, 1000, "note");
  if (!newStatus || !expectedStatus) throw new ComplaintStatusError(400, "status_and_expected_status_required");
  if (newStatus === "closed") throw new ComplaintStatusError(409, "payment_verification_required_before_closing");
  if (!ALLOWED_STATUSES.has(newStatus)) throw new ComplaintStatusError(400, "unsupported_status");

  const previous = await db.prepare(
    "SELECT request_id, complaint_id, old_status, new_status, created_at FROM complaint_status_update_requests WHERE actor_id = ? AND idempotency_key = ? LIMIT 1"
  ).bind(actorId, idempotencyKey).first();
  if (previous) return { update: previous, replayed: true };

  const current = await db.prepare(
    `SELECT c.id, c.ticket_no, c.title, c.status, c.priority, c.technician_id, c.customer_id,
       c.customer_phone, c.customer_name, cu.user_id AS customer_user_id,
       cu.profile_id AS customer_profile_id,
       COALESCE(NULLIF(c.customer_phone,''), p.phone) AS notification_phone
     FROM complaints c
     LEFT JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN profiles p ON p.id = COALESCE(cu.user_id, cu.profile_id)
     WHERE c.id = ? LIMIT 1`
  ).bind(complaintId).first();
  if (!current) throw new ComplaintStatusError(404, "complaint_not_found");
  if (current.status !== expectedStatus) throw new ComplaintStatusError(409, "complaint_status_conflict");
  const isAssignedTechnician = profile.role === "technician" && current.technician_id === actorId;
  const isClaimingOpen = profile.role === "technician" && current.status === "open" && !current.technician_id && newStatus === "assigned";
  if (profile.role === "technician" && !isAssignedTechnician && !isClaimingOpen) {
    throw new ComplaintStatusError(403, "technician_not_assigned_to_complaint");
  }
  if (!transitionAllowed(profile.role, current.status, newStatus, isAssignedTechnician || isClaimingOpen)) {
    throw new ComplaintStatusError(409, "invalid_status_transition");
  }
  if (profile.role === "admin" && normalizedCurrentStatus === "open" && newStatus === "assigned" && !current.technician_id) {
    throw new ComplaintStatusError(409, "assign_technician_before_marking_assigned");
  }

  const requestId = crypto.randomUUID();
  const changedAt = new Date().toISOString();
  const claim = isClaimingOpen ? 1 : 0;
  const technicianId = isClaimingOpen ? actorId : current.technician_id;
  const customerUserId = current.customer_user_id || current.customer_profile_id || null;
  const recipients = await db.prepare(
    "SELECT id FROM profiles WHERE role = 'admin' OR id = ? ORDER BY id"
  ).bind(technicianId || "").all();
  const notificationIds = [...new Set([
    ...(customerUserId ? [customerUserId] : []),
    ...((recipients?.results || []).map((r) => r.id)),
  ])];
  const displayTicket = current.ticket_no || current.title || "Complaint";
  const statusLabel = newStatus.replaceAll("_", " ");
  const notificationMessage = `${displayTicket} status changed to ${statusLabel}.`;
  const normalizedPhone = normalizePhoneDigits(current.notification_phone);
  let waEvent = null;
  if (normalizedPhone && ["assigned", "technician_on_way", "in_progress", "resolved"].includes(newStatus)) {
    let message = `Unique Market: Complaint "${current.title || "Service Request"}" status is now ${statusLabel}.`;
    if (["resolved"].includes(newStatus)) {
      message += "\n⭐ Google Review: https://g.page/r/CWY_3B12wn32EBI/review";
    }
    waEvent = buildWhatsAppEvent({
      complaintId, recipientUserId: customerUserId, phone: normalizedPhone,
      customerPhone: normalizedPhone, eventType: "status_changed", message,
      eventKey: `complaint-status:${complaintId}:${requestId}`,
    });
  }

  const statements = [
    db.prepare(`INSERT OR IGNORE INTO complaint_status_update_requests
      (request_id, actor_id, idempotency_key, complaint_id, old_status, new_status, note, created_at)
      SELECT ?, ?, ?, c.id, c.status, ?, ?, ?
      FROM complaints c
      WHERE c.id = ? AND c.status = ?
        AND (? = 'admin' OR c.technician_id = ? OR
          (? = 'technician' AND c.technician_id IS NULL AND c.status = ? AND ? = 'assigned'))`)
      .bind(requestId, actorId, idempotencyKey, newStatus, note, changedAt, complaintId, expectedStatus,
        profile.role, actorId, profile.role, expectedStatus, newStatus),
    db.prepare(`UPDATE complaints
      SET status = ?, updated_at = ?,
          technician_id = CASE WHEN ? = 1 THEN ? ELSE technician_id END,
          assigned_at = CASE WHEN ? = 1 THEN COALESCE(assigned_at, ?) ELSE assigned_at END,
          scheduled_visit_date = CASE WHEN ? = 1 THEN COALESCE(scheduled_visit_date, substr(?,1,10)) ELSE scheduled_visit_date END,
          started_at = CASE WHEN ? = 'in_progress' THEN COALESCE(started_at, ?) ELSE started_at END,
          completed_at = CASE WHEN ? = 'resolved' THEN COALESCE(completed_at, ?) ELSE completed_at END,
          resolution_notes = CASE WHEN ? IS NULL THEN resolution_notes ELSE ? END
      WHERE id = ? AND status = ?
        AND EXISTS (SELECT 1 FROM complaint_status_update_requests WHERE request_id = ? AND complaint_id = ?)`)
      .bind(newStatus, changedAt, claim, technicianId, claim, changedAt, claim, changedAt,
        newStatus, changedAt, newStatus, changedAt, note, note, complaintId, expectedStatus, requestId, complaintId),
    db.prepare(`INSERT INTO complaint_status_history
      (id, complaint_id, old_status, new_status, changed_by, note, created_at)
      SELECT ?, c.id, r.old_status, r.new_status, r.actor_id, r.note, r.created_at
      FROM complaint_status_update_requests r JOIN complaints c ON c.id = r.complaint_id
      WHERE r.request_id = ? AND c.status = ? AND c.updated_at = ?`)
      .bind(crypto.randomUUID(), requestId, newStatus, changedAt),
    db.prepare(`INSERT INTO ticket_status_history
      (id, complaint_id, old_status, new_status, changed_by, remarks, created_at)
      SELECT ?, c.id, r.old_status, r.new_status, r.actor_id, r.note, r.created_at
      FROM complaint_status_update_requests r JOIN complaints c ON c.id = r.complaint_id
      WHERE r.request_id = ? AND c.status = ? AND c.updated_at = ?`)
      .bind(crypto.randomUUID(), requestId, newStatus, changedAt),
  ];

  for (const recipientId of notificationIds) {
    statements.push(db.prepare(`INSERT INTO notifications
      (id, user_id, type, title, message, complaint_id, created_at)
      SELECT ?, ?, 'complaint_status', 'Complaint Status Updated', ?, c.id, ?
      FROM complaints c JOIN complaint_status_update_requests r ON r.complaint_id = c.id
      WHERE r.request_id = ? AND c.status = ? AND c.updated_at = ?`)
      .bind(crypto.randomUUID(), recipientId, notificationMessage, changedAt, requestId, newStatus, changedAt));
  }

  if (waEvent) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO whatsapp_notification_events
      (id, complaint_id, recipient_user_id, phone, customer_phone, event_type, message, status, event_key, created_at)
      SELECT ?, c.id, ?, ?, ?, 'status_changed', ?, 'pending', ?, ?
      FROM complaints c JOIN complaint_status_update_requests r ON r.complaint_id = c.id
      WHERE r.request_id = ? AND c.status = ? AND c.updated_at = ?`)
      .bind(waEvent.id, waEvent.recipient_user_id, waEvent.phone, waEvent.customer_phone,
        waEvent.message, waEvent.event_key, changedAt, requestId, newStatus, changedAt));
  }

  statements.push(db.prepare(`INSERT INTO admin_activity_log
    (id, admin_user_id, action, module, record_id, details, created_at)
    SELECT ?, ?, 'UPDATE', 'Complaints', c.id, ?, ?
    FROM complaints c JOIN complaint_status_update_requests r ON r.complaint_id = c.id
    WHERE r.request_id = ? AND c.status = ? AND c.updated_at = ?`)
    .bind(crypto.randomUUID(), actorId, JSON.stringify({ old_status: current.status, status: newStatus, priority: current.priority }), changedAt, requestId, newStatus, changedAt));

  try {
    await db.batch(statements);
  } catch (error) {
    const replay = await db.prepare(
      "SELECT request_id, complaint_id, old_status, new_status, created_at FROM complaint_status_update_requests WHERE actor_id = ? AND idempotency_key = ? LIMIT 1"
    ).bind(actorId, idempotencyKey).first().catch(() => null);
    if (replay) return { update: replay, replayed: true };
    throw error;
  }

  const saved = await db.prepare(
    "SELECT request_id, complaint_id, old_status, new_status, created_at FROM complaint_status_update_requests WHERE request_id = ? LIMIT 1"
  ).bind(requestId).first();
  if (!saved) {
    const now = await db.prepare("SELECT status FROM complaints WHERE id = ? LIMIT 1").bind(complaintId).first();
    if (now?.status !== expectedStatus) throw new ComplaintStatusError(409, "complaint_status_conflict");
    throw new ComplaintStatusError(403, "complaint_update_not_authorized");
  }
  return { update: saved, replayed: false };
}
