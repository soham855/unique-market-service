import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json({ error: "Invalid session" }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const complaintId = String(body.complaint_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(complaintId)) return json({ error: "Valid complaint_id required" }, 400);

    const { data: complaint, error: complaintError } = await db.from("complaints")
      .select("id,ticket_no,status,technician_id,customer_id,customer_phone,customer_name")
      .eq("id", complaintId).maybeSingle();
    if (complaintError) throw complaintError;
    if (!complaint) return json({ error: "Complaint not found" }, 404);
    const { data: customer } = await db.from("customers").select("id,profile_id,mobile")
      .eq("id", complaint.customer_id).maybeSingle();
    if (!customer?.profile_id) return json({ error: "Customer login is not linked to this complaint" }, 409);

    if (action === "request_cash_otp") {
      if (complaint.technician_id !== user.id) return json({ error: "Only the assigned technician can request cash confirmation" }, 403);
      if (!["Completed", "completed", "resolved", "Awaiting Payment", "awaiting_payment"].includes(String(complaint.status))) {
        return json({ error: "Complete the service report before requesting cash confirmation" }, 409);
      }
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role !== "technician") return json({ error: "Technician role required" }, 403);

      const { data: report } = await db.from("service_reports").select("labour_amount,other_amount,parts_used")
        .eq("complaint_id", complaintId).eq("technician_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const partsTotal = Array.isArray(report?.parts_used) ? report.parts_used.reduce((sum, part) => sum + Number(part.amount || 0), 0) : 0;
      const expectedAmount = Number(report?.labour_amount || 0) + Number(report?.other_amount || 0) + partsTotal;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - expectedAmount) > 0.009) {
        return json({ error: "Payment amount must match the saved service report total" }, 400);
      }
      const phone = String(complaint.customer_phone || customer.mobile || "").replace(/[^0-9]/g, "");
      if (phone.length < 10) return json({ error: "Customer mobile number is missing or invalid" }, 409);

      const { data: recent } = await db.from("cash_payment_otp_challenges").select("created_at,attempts,verified_at")
        .eq("complaint_id", complaintId).is("verified_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
        return json({ error: "Please wait one minute before requesting another OTP" }, 429);
      }
      const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      const otpHash = await sha256(complaintId + ":" + user.id + ":" + otp);
      const { error: insertError } = await db.from("cash_payment_otp_challenges").insert({
        complaint_id: complaintId, technician_id: user.id, customer_profile_id: customer.profile_id,
        amount, otp_hash: otpHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      if (insertError) throw insertError;
      const { error: stateError } = await db.from("complaints").update({ payment_status: "cash_otp_pending" }).eq("id", complaintId);
      if (stateError) throw stateError;
      const { error: queueError } = await db.from("whatsapp_notification_events").insert({
        complaint_id: complaintId, recipient_user_id: customer.profile_id, phone,
        customer_phone: phone, event_type: "cash_payment_otp_" + crypto.randomUUID(),
        message: "UNIQUE MARKET — Cash payment confirmation for ticket " + (complaint.ticket_no || complaintId) +
          ". OTP: " + otp + ". Valid for 5 minutes. Share it only to confirm the cash amount ₹" +
          amount.toFixed(2) + ". If you did not request this, contact Unique Market.",
      });
      if (queueError) throw queueError;
      return json({ ok: true, message: "Cash confirmation OTP queued for the customer's WhatsApp. Valid for 5 minutes." });
    }

    if (action === "verify_cash_otp") {
      if (customer.profile_id !== user.id) return json({ error: "Only the authenticated customer can confirm this cash payment" }, 403);
      const otp = String(body.otp || "").trim();
      if (!/^\d{6}$/.test(otp)) return json({ error: "Enter the six-digit OTP" }, 400);
      const { data: challenge, error: challengeError } = await db.from("cash_payment_otp_challenges")
        .select("*").eq("complaint_id", complaintId).eq("customer_profile_id", user.id)
        .is("verified_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (challengeError) throw challengeError;
      if (!challenge) return json({ error: "No active cash confirmation OTP. Ask the technician to request a new one." }, 409);
      if (challenge.attempts >= 5) return json({ error: "OTP attempt limit reached. Request admin assistance." }, 429);
      if (new Date(challenge.expires_at).getTime() <= Date.now()) return json({ error: "OTP expired. Ask the technician to request a new one." }, 410);

      const suppliedHash = await sha256(complaintId + ":" + challenge.technician_id + ":" + otp);
      if (suppliedHash !== challenge.otp_hash) {
        const { data: attempts, error: attemptError } = await db.rpc("record_cash_payment_otp_failure", {
          p_challenge_id: challenge.id,
          p_customer_profile_id: user.id,
        });
        if (attemptError) {
          const message = attemptError.message || "";
          if (/expired/i.test(message)) return json({ error: "OTP expired. Ask the technician to request a new one." }, 410);
          if (/already used/i.test(message)) return json({ error: "OTP already used." }, 409);
          console.error("Atomic OTP attempt update failed:", message);
          return json({ error: "Could not verify OTP. Please retry or contact Admin." }, 409);
        }
        if (Number(attempts) >= 5) return json({ error: "OTP attempt limit reached. Request admin assistance." }, 429);
        return json({ error: "Incorrect OTP" }, 400);
      }

      // OTP verification, payment ledger insert, challenge consumption, and complaint closure
      // are committed by one PostgreSQL transaction to avoid partial settlement.
      const { data: settlement, error: settlementError } = await db.rpc("confirm_cash_payment_with_otp", {
        p_challenge_id: challenge.id,
        p_customer_profile_id: user.id,
        p_supplied_hash: suppliedHash,
      });
      if (settlementError) {
        const message = settlementError.message || "";
        if (/expired/i.test(message)) return json({ error: "OTP expired. Ask the technician to request a new one." }, 410);
        if (/already used|awaiting cash settlement|state changed/i.test(message)) return json({ error: "OTP already used or complaint is no longer awaiting cash settlement" }, 409);
        if (/attempt limit/i.test(message)) return json({ error: "OTP attempt limit reached. Request admin assistance." }, 429);
        console.error("Atomic cash settlement failed:", message);
        return json({ error: "Cash settlement could not be completed. No payment was recorded; contact Admin." }, 409);
      }

      const phone = String(complaint.customer_phone || customer.mobile || "").replace(/[^0-9]/g, "");
      if (phone.length >= 10) {
        const { data: savedReport } = await db.from("service_reports").select("pdf_url")
          .eq("complaint_id", complaintId).eq("technician_id", challenge.technician_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://salesuniquemarket.com").replace(/\/$/, "");
        const pdfUrl = typeof savedReport?.pdf_url === "string" && /^https:\/\//i.test(savedReport.pdf_url)
          ? savedReport.pdf_url : "";
        const pdfMarker = pdfUrl ? "\n[[PDF_URL=" + pdfUrl + "]]" : "";
        const invoiceNotice = pdfUrl
          ? " Your service report PDF is attached."
          : " Your service report PDF is not available yet; please contact our office.";
        const { error: notifyError } = await db.from("whatsapp_notification_events").insert({
          complaint_id: complaintId, recipient_user_id: customer.profile_id, phone,
          customer_phone: phone, event_type: "cash_payment_confirmed_" + crypto.randomUUID(),
          message: "UNIQUE MARKET — Cash payment of ₹" + Number(challenge.amount).toFixed(2) +
            " confirmed for ticket " + (complaint.ticket_no || complaintId) + "." + invoiceNotice +
            "\nRate your service (1–5 stars; sign in to your customer account if prompted): " + siteUrl + "/feedback" + pdfMarker,
        });
        if (notifyError) console.error("Cash confirmation WhatsApp enqueue failed:", notifyError.message);
      }
      return json({ ok: true, message: "Cash payment confirmed by customer OTP." });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("cash-payment-confirmation error:", error instanceof Error ? error.message : error);
    return json({ error: "Unable to process payment confirmation. Please retry or contact Admin." }, 500);
  }
});
