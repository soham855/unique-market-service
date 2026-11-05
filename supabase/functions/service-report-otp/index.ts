import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server environment not configured" });

  const authorization = req.headers.get("Authorization") || "";
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(401, { error: "Sign in required" });
  const user = await userResponse.json();
  const userId = user?.id as string | undefined;
  if (!userId) return json(401, { error: "Sign in required" });

  let body: { action?: string; report_id?: string; otp?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const reportId = body.report_id;
  if (!reportId || !/^[0-9a-f-]{36}$/i.test(reportId)) return json(400, { error: "Valid report_id required" });

  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const profileResponse = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=role`, { headers: restHeaders });
  const profiles = profileResponse.ok ? await profileResponse.json() : [];
  const role = profiles?.[0]?.role;
  if (!["admin", "technician"].includes(role)) return json(403, { error: "Admin or technician access required" });

  const reportResponse = await fetch(`${url}/rest/v1/service_reports?id=eq.${reportId}&select=id,complaint_id,technician_id,customer_otp_verified`, { headers: restHeaders });
  const reports = reportResponse.ok ? await reportResponse.json() : [];
  const report = reports?.[0];
  if (!report) return json(404, { error: "Service report not found" });
  if (role !== "admin" && report.technician_id !== userId) return json(403, { error: "This report is not assigned to you" });
  if (report.customer_otp_verified === true) return json(409, { error: "Customer approval is already verified" });

  const complaintResponse = await fetch(`${url}/rest/v1/complaints?id=eq.${report.complaint_id}&select=id,technician_id,customer_phone,customer_id`, { headers: restHeaders });
  const complaints = complaintResponse.ok ? await complaintResponse.json() : [];
  const complaint = complaints?.[0];
  if (!complaint) return json(404, { error: "Linked service ticket not found" });
  if (role !== "admin" && complaint.technician_id !== userId) return json(403, { error: "This job is not assigned to you" });

  if (body.action === "request") {
    let phone = String(complaint.customer_phone || "").replace(/\D/g, "");
    if (phone.length < 10 && complaint.customer_id) {
      const customerResponse = await fetch(`${url}/rest/v1/customers?id=eq.${complaint.customer_id}&select=mobile`, { headers: restHeaders });
      const customers = customerResponse.ok ? await customerResponse.json() : [];
      phone = String(customers?.[0]?.mobile || "").replace(/\D/g, "");
    }
    if (phone.length < 10) return json(422, { error: "Customer registered mobile number is missing or invalid" });

    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const otp = String(random[0] % 1000000).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const challengeResponse = await fetch(`${url}/rest/v1/service_report_otp_challenges?on_conflict=service_report_id`, {
      method: "POST",
      headers: { ...restHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        service_report_id: reportId,
        otp_hash: await sha256(`${reportId}:${otp}:${serviceKey}`),
        expires_at: expiresAt,
        attempts: 0,
        used_at: null,
        requested_by: userId,
        created_at: new Date().toISOString(),
      }),
    });
    if (!challengeResponse.ok) return json(500, { error: "Could not create OTP challenge" });

    const event = {
      event_key: `service-report-otp:${reportId}:${Date.now()}`,
      event_type: "service_report_otp",
      phone,
      customer_phone: phone,
      message: `Unique Market service completion approval: OTP ${otp}. Valid for 5 minutes. Share it only with the technician after checking the completed work.`,
      status: "pending",
    };
    const queueResponse = await fetch(`${url}/rest/v1/whatsapp_notification_events`, {
      method: "POST",
      headers: { ...restHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(event),
    });
    if (!queueResponse.ok) {
      await fetch(`${url}/rest/v1/service_report_otp_challenges?service_report_id=eq.${reportId}`, { method: "DELETE", headers: restHeaders });
      console.error("Service OTP outbox insert failed", await queueResponse.text());
      return json(503, { error: "Could not queue customer OTP. No approval was recorded." });
    }
    return json(200, { queued: true, expires_in_seconds: 300, message: "OTP queued to the customer's registered WhatsApp number." });
  }

  if (body.action === "verify") {
    const otp = String(body.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return json(400, { error: "Enter the 6-digit OTP" });
    const challengeResponse = await fetch(`${url}/rest/v1/service_report_otp_challenges?service_report_id=eq.${reportId}&select=otp_hash,expires_at,attempts,used_at`, { headers: restHeaders });
    const challenges = challengeResponse.ok ? await challengeResponse.json() : [];
    const challenge = challenges?.[0];
    if (!challenge || challenge.used_at) return json(400, { error: "OTP not found or already used. Request a new OTP." });
    if (new Date(challenge.expires_at).getTime() < Date.now()) return json(400, { error: "OTP expired. Request a new OTP." });
    if (Number(challenge.attempts) >= 5) return json(429, { error: "Too many incorrect attempts. Request a new OTP." });

    if ((await sha256(`${reportId}:${otp}:${serviceKey}`)) !== challenge.otp_hash) {
      await fetch(`${url}/rest/v1/service_report_otp_challenges?service_report_id=eq.${reportId}&attempts=lt.5&used_at=is.null`, {
        method: "PATCH", headers: { ...restHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ attempts: Number(challenge.attempts) + 1 }),
      });
      return json(400, { error: "Incorrect OTP" });
    }

    const usedResponse = await fetch(`${url}/rest/v1/service_report_otp_challenges?service_report_id=eq.${reportId}&used_at=is.null&attempts=lt.5&expires_at=gt.${new Date().toISOString()}`, {
      method: "PATCH", headers: restHeaders,
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });
    const used = usedResponse.ok ? await usedResponse.json() : [];
    if (!used?.length) return json(409, { error: "OTP was already used, expired or locked. Request a new OTP." });

    const approvalResponse = await fetch(`${url}/rest/v1/service_reports?id=eq.${reportId}&customer_otp_verified=eq.false`, {
      method: "PATCH", headers: restHeaders,
      body: JSON.stringify({ customer_otp_verified: true, customer_approved_at: new Date().toISOString() }),
    });
    const approved = approvalResponse.ok ? await approvalResponse.json() : [];
    if (!approved?.length) return json(409, { error: "OTP verified but report approval could not be recorded. Contact Admin." });
    return json(200, { verified: true, message: "Customer approval verified." });
  }
  return json(400, { error: "action must be request or verify" });
});
