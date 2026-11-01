const BASE_COLUMNS = `id, ticket_no, customer_id, category, description, priority, status,
  technician_id, created_at, completed_at, service_type, location_text, latitude, longitude,
  assigned_at, started_at, resolution_notes, title, address, updated_at, customer_name,
  customer_phone, company_name, complaint_no, scheduled_visit_date, scheduled_visit_at`;

function scopedQuery(profile, complaintId, status, limit, offset) {
  const where = [];
  const values = [];
  if (complaintId) { where.push("c.id = ?"); values.push(complaintId); }
  if (profile.role === "customer") {
    where.push(`EXISTS (
      SELECT 1 FROM customers cu
      WHERE cu.id = c.customer_id AND (cu.user_id = ? OR cu.profile_id = ?)
    )`);
    values.push(profile.id, profile.id);
  } else if (profile.role === "technician") {
    where.push("(c.technician_id = ? OR (c.technician_id IS NULL AND c.status = 'open'))");
    values.push(profile.id);
  } else if (profile.role !== "admin") {
    throw new Error("Forbidden profile role");
  }
  if (status) { where.push("c.status = ?"); values.push(status); }
  return {
    sql: `SELECT ${BASE_COLUMNS} FROM complaints c WHERE ${where.length ? where.join(" AND ") : "1 = 1"}
      ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
    values: [...values, limit, offset],
  };
}

export async function readComplaints(db, profile, { complaintId = null, status = null, limit = 50, offset = 0 } = {}) {
  if (!profile || !["admin", "technician", "customer"].includes(profile.role) || !profile.id) {
    throw new Error("Forbidden profile");
  }
  const safeLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50));
  const safeOffset = Math.min(10000, Math.max(0, Number.isInteger(offset) ? offset : 0));
  const safeStatus = typeof status === "string" && status.length > 0 && status.length <= 40 ? status : null;
  const query = scopedQuery(profile, complaintId, safeStatus, safeLimit, safeOffset);
  const result = await db.prepare(query.sql).bind(...query.values).all();
  return result?.results || [];
}
