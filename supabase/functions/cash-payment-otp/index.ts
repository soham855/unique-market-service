import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server environment not configured" });

  const auth = req.headers.get("Authorization") || "";
  const userResp = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: auth },
  });
  if (!userResp.ok) return json(401, { error: "Sign in required" });
  const user = await userResp.json();
  const userId = user?.id as string | undefined;
  if (!userId) return json(401, { error: "Sign in required" });

  const profileResp = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const profileRows = profileResp.ok ? await profileResp.json() : [];
  const role = profileRows?.[0]?.role;
  if (!["admin", "technician"].includes(role)) return json(403, { error: "Admin or technician access required" });

  let body: { action?: string; payment_id?: string; otp?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const paymentId = body.payment_id;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return json(400, { error: "Valid payment_id required" });

  const restHeaders = {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json", Prefer: "return=representation",
  };
  const paymentResp = await fetch(`${url}/rest/v1/payments?id=eq.${paymentId}&select=id,customer_id,recorded_by,mode,status,source,amount`, { headers: restHeaders });
  if (!paymentResp.ok) return json(500, { error: "Could not load payment" });
  const payments = await paymentResp.json();
  const payment = payments?.[0];
  if (!payment || payment.mode !== "Cash" || payment.source !== "technician") return json(404, { error: "Cash technician payment not found" });
  if (role !== "admin" && payment.recorded_by !== userId) return json(403, { error: "You cannot verify this payment" });
  if (payment.status === "confirmed") return json(409, { error: "Payment already confirmed" });
  if (payment.status !== "pending") return json(409, { error: "Payment is not pending OTP verification" });

  if (body.action === "request") {
    const customerResp = await fetch(`${url}/rest/v1/customers?id=eq.${payment.customer_id}&select=mobile,name`, { headers: restHeaders });
    const customers = customerResp.ok ? await customerResp.json() : [];
    const customer = customers?.[0];
    const phone = String(customer?.mobile || "").replace(/\D/g, "");
    if (phone.length < 10) return json(422, { error: "Customer registered mobile number is missing or invalid" });

    const otpArray = new Uint32Array(1);
    crypto.getRandomValues(otpArray);
    const otp = String(otpArray[0] % 1000000).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const challengeResp = await fetch(`${url}/rest/v1/cash_payment_otp_challenges?on_conflict=payment_id`, {
      method: "POST",
      headers: { ...restHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ payment_id: paymentId, otp_hash: await sha256(paymentId + ":" + otp), expires_at: expiresAt, attempts: 0, used_at: null, requested_by: userId, created_at: new Date().toISOString() }),
    });
    if (!challengeResp.ok) return json(500, { error: "Could not create OTP challenge" });

    const event = {
      event_key: `cash-payment-otp:${paymentId}:${Date.now()}`,
      event_type: "cash_payment_otp",
      phone,
      customer_phone: phone,
      message: `Unique Market payment verification: OTP ${otp}. Amount ₹${Number(payment.amount || 0).toLocaleString("en-IN")}. Valid for 5 minutes. Do not share this code with anyone except to verify this cash payment.`,
      status: "pending",
    };
    const queueResp = await fetch(`${url}/rest/v1/whatsapp_notification_events`, {
      method: "POST", headers: { ...restHeaders, Prefer: "return=minimal" }, body: JSON.stringify(event),
    });
    if (!queueResp.ok) {
      await fetch(`${url}/rest/v1/cash_payment_otp_challenges?payment_id=eq.${paymentId}`, { method: "DELETE", headers: restHeaders });
      console.error("OTP WhatsApp outbox insert failed", await queueResp.text());
      return json(503, { error: "Could not queue OTP WhatsApp message. Payment remains pending." });
    }
    return json(200, { queued: true, expires_in_seconds: 300, message: "OTP queued to the customer's registered WhatsApp number. Wait for delivery before verifying." });
  }

  if (body.action === "verify") {
    const otp = String(body.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return json(400, { error: "Enter the 6-digit OTP" });
    const challengeResp = await fetch(`${url}/rest/v1/cash_payment_otp_challenges?payment_id=eq.${paymentId}&select=otp_hash,expires_at,attempts,used_at`, { headers: restHeaders });
    const challenges = challengeResp.ok ? await challengeResp.json() : [];
    const challenge = challenges?.[0];
    if (!challenge || challenge.used_at) return json(400, { error: "OTP not found or already used. Request a new OTP." });
    if (new Date(challenge.expires_at).getTime() < Date.now()) return json(400, { error: "OTP expired. Request a new OTP." });
    if (Number(challenge.attempts) >= 5) return json(429, { error: "Too many incorrect attempts. Request a new OTP." });
    const matches = (await sha256(paymentId + ":" + otp)) === challenge.otp_hash;
    if (!matches) {
      await fetch(`${url}/rest/v1/cash_payment_otp_challenges?payment_id=eq.${paymentId}`, {
        method: "PATCH", headers: { ...restHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ attempts: Number(challenge.attempts) + 1 }),
      });
      return json(400, { error: "Incorrect OTP" });
    }
    const usedResp = await fetch(`${url}/rest/v1/cash_payment_otp_challenges?payment_id=eq.${paymentId}&used_at=is.null&attempts=lt.5`, {
      method: "PATCH", headers: { ...restHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });
    const usedRows = usedResp.ok ? await usedResp.json() : [];
    if (!usedRows?.length) return json(409, { error: "OTP was already used or locked. Request a new OTP." });
    const confirmResp = await fetch(`${url}/rest/v1/payments?id=eq.${paymentId}&status=eq.pending`, {
      method: "PATCH", headers: { ...restHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ status: "confirmed", payment_status: "Confirmed" }),
    });
    const confirmed = confirmResp.ok ? await confirmResp.json() : [];
    if (!confirmed?.length) return json(409, { error: "OTP verified, but payment status could not be updated. Contact Admin." });
    return json(200, { verified: true, status: "confirmed", message: "OTP verified. Cash payment confirmed." });
  }
  return json(400, { error: "action must be request or verify" });
});
