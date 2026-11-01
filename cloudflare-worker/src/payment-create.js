export class CashPaymentCreateError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const validKey = value => typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);

export async function createPendingCashPayment(db, profile, actorId, input, idempotencyKey) {
  if (!profile?.id || !["admin", "technician"].includes(profile.role) || actorId !== profile.id) {
    throw new CashPaymentCreateError(403, "role_not_allowed");
  }
  if (!validKey(idempotencyKey)) throw new CashPaymentCreateError(400, "valid_idempotency_key_required");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CashPaymentCreateError(400, "invalid_json_body");
  const complaintId = input.complaintId;
  if (typeof complaintId !== "string" || !/^[0-9a-f-]{36}$/i.test(complaintId)) {
    throw new CashPaymentCreateError(400, "invalid_complaint_id");
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Math.round(amount * 100) !== amount * 100) {
    throw new CashPaymentCreateError(400, "invalid_payment_amount");
  }
  let notes = null;
  if (input.notes != null && input.notes !== "") {
    if (typeof input.notes !== "string" || input.notes.trim().length > 500) throw new CashPaymentCreateError(400, "invalid_notes");
    notes = input.notes.trim() || null;
  }

  const findReplay = () => db.prepare(
    "SELECT p.id,p.complaint_id,p.customer_id,p.amount,p.mode,p.status,p.payment_status,p.created_at FROM payment_create_requests r JOIN payments p ON p.id=r.payment_id WHERE r.actor_id=? AND r.idempotency_key=? LIMIT 1"
  ).bind(actorId, idempotencyKey).first();
  const previous = await findReplay();
  if (previous) return { payment: previous, replayed: true };

  const complaint = await db.prepare(
    "SELECT id,customer_id,technician_id FROM complaints WHERE id=? LIMIT 1"
  ).bind(complaintId).first();
  if (!complaint) throw new CashPaymentCreateError(404, "complaint_not_found");
  if (!complaint.customer_id) throw new CashPaymentCreateError(409, "complaint_customer_missing");
  if (profile.role === "technician" && complaint.technician_id !== actorId) {
    throw new CashPaymentCreateError(403, "technician_not_assigned_to_complaint");
  }

  const paymentId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const source = profile.role === "technician" ? "technician" : "admin";
  try {
    await db.batch([
      db.prepare("INSERT INTO payment_create_requests(request_id,actor_id,idempotency_key,payment_id,complaint_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM complaints c WHERE c.id=? AND c.customer_id=? AND (?='admin' OR c.technician_id=?))")
        .bind(requestId, actorId, idempotencyKey, paymentId, complaintId, createdAt, complaintId, complaint.customer_id, profile.role, actorId),
      db.prepare("INSERT INTO payments(id,customer_id,challan_id,payment_date,amount,mode,notes,created_at,recorded_by,status,source,payment_status,complaint_id,ledger_applied_at) SELECT ?,c.customer_id,NULL,?,?, 'Cash',?,?,?,'pending',?,'Pending',c.id,NULL FROM complaints c JOIN payment_create_requests r ON r.payment_id=? WHERE c.id=? AND c.customer_id=? AND (?='admin' OR c.technician_id=?)")
        .bind(paymentId, createdAt.slice(0, 10), amount, notes, createdAt, actorId, source, paymentId, complaintId, complaint.customer_id, profile.role, actorId),
    ]);
  } catch (error) {
    const replay = await findReplay().catch(() => null);
    if (replay) return { payment: replay, replayed: true };
    throw error;
  }

  const saved = await db.prepare(
    "SELECT id,complaint_id,customer_id,amount,mode,status,payment_status,created_at FROM payments WHERE id=? LIMIT 1"
  ).bind(paymentId).first();
  if (saved) return { payment: saved, replayed: false };
  const concurrent = await findReplay();
  if (concurrent) return { payment: concurrent, replayed: true };
  throw new CashPaymentCreateError(403, "payment_creation_not_authorized");
}
