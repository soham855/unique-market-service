import { buildWhatsAppEvent, normalizePhoneDigits } from "./complaint-engine.js";

export class ComplaintCloseError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const validKey = value => typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
const REVIEW_URL = "https://maps.app.goo.gl/tV6TUsacb9CtqibY8?g_st=ac";

export async function closeComplaintAfterCashOtp(db, profile, actorId, complaintId, input, idempotencyKey) {
  if (!profile?.id || actorId !== profile.id || !["admin", "technician"].includes(profile.role)) {
    throw new ComplaintCloseError(403, "role_not_allowed_to_close_complaint");
  }
  if (!/^[0-9a-f-]{36}$/i.test(complaintId || "")) throw new ComplaintCloseError(400, "invalid_complaint_id");
  if (!validKey(idempotencyKey)) throw new ComplaintCloseError(400, "valid_idempotency_key_required");
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof input.paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.paymentId)) {
    throw new ComplaintCloseError(400, "valid_payment_id_required");
  }

  const previous = await db.prepare(
    "SELECT id,complaint_id,payment_id,created_at FROM complaint_close_request_ledger WHERE actor_id=? AND idempotency_key=? LIMIT 1"
  ).bind(actorId, idempotencyKey).first();
  if (previous) return { closure: previous, status: "closed", replayed: true };

  const complaint = await db.prepare(
    `SELECT c.id,c.ticket_no,c.title,c.status,c.technician_id,c.customer_id,c.customer_phone,
       COALESCE(cu.user_id,cu.profile_id) AS customer_user_id,
       COALESCE(NULLIF(c.customer_phone,''),cu.mobile) AS notification_phone
     FROM complaints c LEFT JOIN customers cu ON cu.id=c.customer_id
     WHERE c.id=? LIMIT 1`
  ).bind(complaintId).first();
  if (!complaint) throw new ComplaintCloseError(404, "complaint_not_found");
  if (profile.role === "technician" && complaint.technician_id !== actorId) {
    throw new ComplaintCloseError(403, "technician_not_assigned_to_complaint");
  }
  if (complaint.status !== "resolved") throw new ComplaintCloseError(409, "complaint_must_be_resolved_before_closing");

  const payment = await db.prepare(
    `SELECT p.id,p.customer_id,p.complaint_id,p.amount,p.mode,p.status,p.payment_status,p.challan_id,p.ledger_applied_at,
       otp.used_at
     FROM payments p LEFT JOIN cash_payment_otp_challenges otp ON otp.payment_id=p.id
     WHERE p.id=? LIMIT 1`
  ).bind(input.paymentId).first();
  if (!payment || payment.complaint_id !== complaintId || payment.customer_id !== complaint.customer_id ||
      payment.challan_id || payment.mode !== "Cash" || payment.status !== "confirmed" ||
      payment.payment_status !== "Confirmed" || !payment.ledger_applied_at ||
      !payment.used_at || !(Number(payment.amount) > 0)) {
    throw new ComplaintCloseError(409, "customer_cash_otp_verified_payment_required");
  }
  const pending = await db.prepare(
    "SELECT COUNT(*) AS count FROM payments WHERE complaint_id=? AND status='pending'"
  ).bind(complaintId).first();
  if (Number(pending?.count || 0) > 0) throw new ComplaintCloseError(409, "other_pending_payment_exists");

  const requestId = crypto.randomUUID();
  const changedAt = new Date().toISOString();
  const ticket = complaint.ticket_no || complaint.title || "Complaint";
  const recipients = await db.prepare(
    "SELECT id,role FROM profiles WHERE role='admin' OR id=? ORDER BY id"
  ).bind(complaint.technician_id || "").all();
  const recipientIds = [...new Set([
    ...(complaint.customer_user_id ? [complaint.customer_user_id] : []),
    ...((recipients?.results || []).map(row => row.id)),
  ])];

  const phone = normalizePhoneDigits(complaint.notification_phone);
  const waEvent = phone.length >= 10 && phone.length <= 15 ? buildWhatsAppEvent({
    complaintId, recipientUserId: complaint.customer_user_id, phone, customerPhone: phone,
    eventType: "status_changed",
    message: `Unique Market: Complaint "${complaint.title || ticket}" is now closed after customer cash payment verification. Thank you for choosing us.\n⭐ Google Review: ${REVIEW_URL}`,
    eventKey: `complaint-closed:${complaintId}:${requestId}`,
  }) : null;

  const statements = [
    db.prepare(`INSERT INTO complaint_close_request_ledger(id,complaint_id,actor_id,idempotency_key,payment_id,created_at)
      SELECT ?,c.id,?,?,p.id,? FROM complaints c JOIN payments p ON p.id=?
      JOIN cash_payment_otp_challenges otp ON otp.payment_id=p.id
      WHERE c.id=? AND c.status='resolved' AND p.complaint_id=c.id AND p.customer_id=c.customer_id
        AND p.challan_id IS NULL AND p.mode='Cash' AND p.status='confirmed'
        AND p.payment_status='Confirmed' AND p.ledger_applied_at IS NOT NULL
        AND otp.used_at IS NOT NULL AND p.amount>0
        AND NOT EXISTS(SELECT 1 FROM payments other WHERE other.complaint_id=c.id AND other.status='pending')
        AND (?='admin' OR c.technician_id=?)`)
      .bind(requestId, actorId, idempotencyKey, changedAt, input.paymentId, complaintId, profile.role, actorId),
    db.prepare(`UPDATE complaints SET status='closed',updated_at=?,completed_at=COALESCE(completed_at,?)
      WHERE id=? AND status='resolved' AND EXISTS(SELECT 1 FROM complaint_close_request_ledger WHERE id=? AND complaint_id=? AND actor_id=? AND payment_id=?)`)
      .bind(changedAt, changedAt, complaintId, requestId, complaintId, actorId, input.paymentId),
    db.prepare(`INSERT INTO complaint_status_history(id,complaint_id,old_status,new_status,changed_by,note,created_at)
      SELECT ?,complaint_id,'resolved','closed',?,'Closed after customer WhatsApp cash OTP verification',?
      FROM complaint_close_request_ledger WHERE id=? AND EXISTS(SELECT 1 FROM complaints WHERE id=? AND status='closed' AND updated_at=?)`)
      .bind(crypto.randomUUID(), actorId, changedAt, requestId, complaintId, changedAt),
    db.prepare(`INSERT INTO ticket_status_history(id,complaint_id,old_status,new_status,changed_by,remarks,created_at)
      SELECT ?,complaint_id,'resolved','closed',?,'Closed after customer WhatsApp cash OTP verification',?
      FROM complaint_close_request_ledger WHERE id=? AND EXISTS(SELECT 1 FROM complaints WHERE id=? AND status='closed' AND updated_at=?)`)
      .bind(crypto.randomUUID(), actorId, changedAt, requestId, complaintId, changedAt),
  ];

  for (const recipientId of recipientIds) {
    statements.push(db.prepare(`INSERT INTO notifications(id,user_id,type,title,message,complaint_id,created_at)
      SELECT ?,?,'complaint_status','Complaint Closed',?,c.id,?
      FROM complaints c JOIN complaint_close_request_ledger r ON r.complaint_id=c.id
      WHERE r.id=? AND c.status='closed' AND c.updated_at=?`)
      .bind(crypto.randomUUID(), recipientId, `${ticket} has been closed after payment verification.`, changedAt, requestId, changedAt));
  }
  if (waEvent) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO whatsapp_notification_events
      (id,complaint_id,recipient_user_id,phone,customer_phone,event_type,message,status,event_key,created_at)
      SELECT ?,c.id,?,?,?,'status_changed',?,'pending',?,?
      FROM complaints c JOIN complaint_close_request_ledger r ON r.complaint_id=c.id
      WHERE r.id=? AND c.status='closed' AND c.updated_at=?`)
      .bind(waEvent.id, waEvent.recipient_user_id, waEvent.phone, waEvent.customer_phone,
        waEvent.message, waEvent.event_key, changedAt, requestId, changedAt));
  }
  if (profile.role === "admin") {
    statements.push(db.prepare(`INSERT INTO admin_activity_log(id,admin_user_id,action,module,record_id,details,created_at)
      SELECT ?,?,'UPDATE','Complaints',c.id,?,?
      FROM complaints c JOIN complaint_close_request_ledger r ON r.complaint_id=c.id
      WHERE r.id=? AND c.status='closed' AND c.updated_at=?`)
      .bind(crypto.randomUUID(), actorId, JSON.stringify({ old_status: "resolved", status: "closed", payment_id: input.paymentId }), changedAt, requestId, changedAt));
  }

  try {
    const result = await db.batch(statements);
    if (result?.[0]?.meta?.changes !== 1 || result?.[1]?.meta?.changes !== 1) {
      throw new ComplaintCloseError(409, "complaint_close_state_conflict");
    }
  } catch (error) {
    if (error instanceof ComplaintCloseError) throw error;
    const replay = await db.prepare(
      "SELECT id,complaint_id,payment_id,created_at FROM complaint_close_request_ledger WHERE actor_id=? AND idempotency_key=? LIMIT 1"
    ).bind(actorId, idempotencyKey).first().catch(() => null);
    if (replay) return { closure: replay, status: "closed", replayed: true };
    throw error;
  }
  const saved = await db.prepare(
    "SELECT id,complaint_id,payment_id,created_at FROM complaint_close_request_ledger WHERE id=? LIMIT 1"
  ).bind(requestId).first();
  if (!saved) throw new ComplaintCloseError(503, "complaint_close_not_saved");
  return { closure: saved, status: "closed", replayed: false };
}
