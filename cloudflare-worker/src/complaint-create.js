import { allocateComplaintNumbers, findLeastLoadedTechnician, buildWhatsAppEvent } from "./complaint-engine.js";

export class ComplaintCreateError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const textField = (value, max, field, required = false) => {
  if (value == null || value === "") {
    if (required) throw new ComplaintCreateError(400, `invalid_${field}`);
    return null;
  }
  if (typeof value !== "string" || value.trim().length > max) throw new ComplaintCreateError(400, `invalid_${field}`);
  const result = value.trim();
  if (required && !result) throw new ComplaintCreateError(400, `invalid_${field}`);
  return result || null;
};
const numericField = (value, min, max, field) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ComplaintCreateError(400, `invalid_${field}`);
  return n;
};
const urlField = (value, field) => {
  const v = textField(value, 2048, field);
  if (!v) return null;
  let u;
  try { u = new URL(v); } catch { throw new ComplaintCreateError(400, `invalid_${field}`); }
  if (u.protocol !== "https:") throw new ComplaintCreateError(400, `invalid_${field}`);
  return v;
};

async function resolveCustomer(db, profile, input) {
  if (profile.role === "customer") {
    const result = await db.prepare(
      "SELECT id, name, mobile, company_name, address, user_id, profile_id FROM customers WHERE user_id = ? OR profile_id = ? ORDER BY created_at, id LIMIT 2"
    ).bind(profile.id, profile.id).all();
    const rows = result?.results || [];
    if (rows.length !== 1) throw new ComplaintCreateError(rows.length ? 409 : 409, rows.length ? "customer_mapping_ambiguous" : "customer_profile_not_linked");
    return rows[0];
  }
  if (profile.role === "admin") {
    const customerId = textField(input.customerId, 64, "customer_id", true);
    const customer = await db.prepare(
      "SELECT id, name, mobile, company_name, address, user_id, profile_id FROM customers WHERE id = ? LIMIT 1"
    ).bind(customerId).first();
    if (!customer) throw new ComplaintCreateError(404, "customer_not_found");
    return customer;
  }
  throw new ComplaintCreateError(403, "role_not_allowed_to_create_complaint");
}

export async function createComplaint(db, profile, input, actorId, idempotencyKey) {
  if (!profile || !profile.id || !["admin", "customer"].includes(profile.role)) {
    throw new ComplaintCreateError(403, "role_not_allowed_to_create_complaint");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ComplaintCreateError(400, "invalid_json_body");
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new ComplaintCreateError(400, "valid_idempotency_key_required");
  }

  const previous = await db.prepare(
    "SELECT c.id, c.ticket_no, c.complaint_no, c.status, c.created_at FROM complaint_create_requests r JOIN complaints c ON c.id = r.complaint_id WHERE r.actor_id = ? AND r.idempotency_key = ? LIMIT 1"
  ).bind(actorId, idempotencyKey).first();
  if (previous) return { complaint: previous, replayed: true };

  const customer = await resolveCustomer(db, profile, input);
  const category = textField(input.category, 100, "category", true);
  const title = textField(input.title, 160, "title") || "Service Request";
  const description = textField(input.description, 4000, "description");
  const serviceType = textField(input.serviceType, 100, "service_type");
  const locationText = textField(input.locationText, 500, "location_text");
  const address = textField(input.address, 500, "address") || customer.address || null;
  const priority = textField(input.priority, 20, "priority") || "normal";
  const latitude = numericField(input.latitude, -90, 90, "latitude");
  const longitude = numericField(input.longitude, -180, 180, "longitude");
  const voiceUrl = urlField(input.voiceUrl, "voice_url");
  const photoUrl = urlField(input.photoUrl, "photo_url");
  const videoUrl = urlField(input.videoUrl, "video_url");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const technicianId = await findLeastLoadedTechnician(db, { status: "open", technicianId: null });
  const status = technicianId ? "assigned" : "open";
  const assignedAt = technicianId ? createdAt : null;
  const scheduledVisitDate = technicianId ? createdAt.slice(0, 10) : null;
  const numbers = await allocateComplaintNumbers(db, { category, createdAt });
  const customerPhone = String(customer.mobile || "").replace(/[^0-9]/g, "") || null;
  const complaint = {
    id, ticketNo: numbers.ticketNo, complaintNo: numbers.complaintNo,
    customerId: customer.id, category, title, description, priority, status,
    technicianId, createdAt, assignedAt, scheduledVisitDate, serviceType,
    locationText, latitude, longitude, voiceUrl, photoUrl, videoUrl,
    address, customerName: customer.name, customerPhone, companyName: customer.company_name || null,
  };

  const statements = [
    db.prepare(`INSERT INTO complaints
      (id,ticket_no,customer_id,category,description,voice_url,photo_url,priority,status,technician_id,created_at,
       service_type,location_text,latitude,longitude,video_url,assigned_at,title,address,customer_name,customer_phone,
       company_name,complaint_no,scheduled_visit_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, numbers.ticketNo, customer.id, category, description, voiceUrl, photoUrl, priority, status, technicianId,
      createdAt, serviceType, locationText, latitude, longitude, videoUrl, assignedAt, title, address,
      customer.name, customerPhone, customer.company_name || null, numbers.complaintNo, scheduledVisitDate
    ),
    db.prepare("INSERT INTO complaint_create_requests (actor_id,idempotency_key,complaint_id,created_at) VALUES (?,?,?,?)")
      .bind(actorId, idempotencyKey, id, createdAt),
  ];

  const customerUserId = customer.user_id || customer.profile_id || null;
  const recipients = await db.prepare("SELECT id, role FROM profiles WHERE role IN ('admin','technician') ORDER BY id").all();
  const recipientRows = recipients?.results || [];
  const notificationRecipients = [];
  if (customerUserId) notificationRecipients.push({ id: customerUserId, type: "complaint_raised", title: "New Complaint Raised", message: `Your complaint ${numbers.ticketNo} has been raised successfully.` });
  for (const recipient of recipientRows) {
    if (recipient.role === "admin") notificationRecipients.push({ id: recipient.id, type: "complaint_raised", title: "New Complaint Received", message: `${numbers.ticketNo} has been raised by ${customer.name || "customer"}.` });
    if (recipient.role === "technician") notificationRecipients.push({ id: recipient.id, type: "complaint_raised", title: "New Complaint Available", message: `${numbers.ticketNo} has been raised and needs service attention.` });
  }
  if (technicianId) notificationRecipients.push({ id: technicianId, type: "complaint_assigned", title: "Complaint Assigned", message: `${numbers.ticketNo} has been assigned to you.` });
  for (const recipient of notificationRecipients) {
    statements.push(db.prepare("INSERT INTO notifications (id,user_id,type,title,message,complaint_id,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), recipient.id, recipient.type, recipient.title, recipient.message, id, createdAt));
  }

  const waEvent = customerPhone ? buildWhatsAppEvent({
    complaintId: id, recipientUserId: customerUserId, phone: customerPhone, customerPhone,
    eventType: "created", message: `Unique Market: Your complaint "${title}" has been received.`,
    eventKey: `complaint-created:${id}`,
  }) : null;
  if (waEvent) {
    statements.push(db.prepare("INSERT INTO whatsapp_notification_events (id,complaint_id,recipient_user_id,phone,customer_phone,event_type,message,status,event_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(waEvent.id, waEvent.complaint_id, waEvent.recipient_user_id, waEvent.phone, waEvent.customer_phone,
        waEvent.event_type, waEvent.message, waEvent.status, waEvent.event_key, createdAt));
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const replay = await db.prepare(
      "SELECT c.id, c.ticket_no, c.complaint_no, c.status, c.created_at FROM complaint_create_requests r JOIN complaints c ON c.id = r.complaint_id WHERE r.actor_id = ? AND r.idempotency_key = ? LIMIT 1"
    ).bind(actorId, idempotencyKey).first().catch(() => null);
    if (replay) return { complaint: replay, replayed: true };
    throw error;
  }
  return { complaint: { id, ticket_no: numbers.ticketNo, complaint_no: numbers.complaintNo, status, created_at: createdAt }, replayed: false };
}
