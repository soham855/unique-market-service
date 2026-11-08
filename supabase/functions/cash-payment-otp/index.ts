import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

const rpcHeaders = (serviceKey: string) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
});

async function callRpc<T>(
  url: string,
  serviceKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(serviceKey),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`${name} RPC failed:`, response.status, text);
    return { ok: false, status: response.status, error: text };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    console.error(`${name} RPC returned invalid JSON`);
    return { ok: false, status: 502, error: "Invalid RPC response" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server environment not configured" });

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "Sign in required" });
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(401, { error: "Sign in required" });
  const user = await userResponse.json();
  const userId = user?.id as string | undefined;
  if (!userId) return json(401, { error: "Sign in required" });

  const profileResponse = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=role`,
    { headers: rpcHeaders(serviceKey) },
  );
  if (!profileResponse.ok) return json(503, { error: "Could not verify technician access" });
  const profiles = await profileResponse.json();
  if (profiles?.[0]?.role !== "technician") {
    return json(403, { error: "Technician access required" });
  }

  let body: { action?: string; payment_id?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const paymentId = body.payment_id;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
    return json(400, { error: "Valid payment_id required" });
  }

  if (body.action === "request") {
    const challenge = await callRpc<{
      otp?: string;
      phone?: string;
      amount?: number | string;
      expires_at?: string;
    }>(url, serviceKey, "request_cash_payment_otp", {
      p_payment_id: paymentId,
      p_actor_id: userId,
    });
    if (!challenge.ok) {
      return json(409, {
        error: "Could not create OTP. Confirm the cash payment is pending, belongs to you, and the customer mobile is valid.",
      });
    }

    const otp = String(challenge.data?.otp || "");
    const phone = String(challenge.data?.phone || "");
    if (!/^\d{6}$/.test(otp) || !/^\d{10,12}$/.test(phone)) {
      await callRpc(url, serviceKey, "cancel_cash_payment_otp", {
        p_payment_id: paymentId,
        p_actor_id: userId,
      });
      return json(503, { error: "OTP challenge response was incomplete. Payment remains pending." });
    }

    const amount = Number(challenge.data.amount || 0);
    const event = {
      event_key: `cash-payment-otp:${paymentId}:${crypto.randomUUID()}`,
      event_type: "cash_payment_otp",
      phone,
      customer_phone: phone,
      message: `Unique Market payment verification: OTP ${otp}. Amount ₹${amount.toLocaleString("en-IN")}. Valid for 5 minutes. Do not share this code with anyone except to verify this cash payment.`,
      status: "pending",
    };
    const queueResponse = await fetch(`${url}/rest/v1/whatsapp_notification_events`, {
      method: "POST",
      headers: { ...rpcHeaders(serviceKey), Prefer: "return=minimal" },
      body: JSON.stringify(event),
    });
    if (!queueResponse.ok) {
      console.error("OTP WhatsApp outbox insert failed:", queueResponse.status, await queueResponse.text());
      await callRpc(url, serviceKey, "cancel_cash_payment_otp", {
        p_payment_id: paymentId,
        p_actor_id: userId,
      });
      return json(503, { error: "Could not queue OTP WhatsApp message. Payment remains pending." });
    }
    return json(200, {
      queued: true,
      expires_in_seconds: 300,
      message: "OTP queued to the customer's registered WhatsApp number. Payment remains pending until verified.",
    });
  }

  if (body.action === "verify") {
    const otp = String(body.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return json(400, { error: "Enter the 6-digit OTP" });

    const verification = await callRpc<{
      ok?: boolean;
      status?: string;
      reason?: string;
      attempts_remaining?: number;
    }>(url, serviceKey, "verify_cash_payment_otp", {
      p_payment_id: paymentId,
      p_actor_id: userId,
      p_otp: otp,
    });
    if (!verification.ok) {
      return json(503, { error: "Could not verify the OTP securely. Payment remains pending." });
    }
    if (verification.data?.ok !== true) {
      const failures: Record<string, { status: number; message: string }> = {
        invalid_input: { status: 400, message: "Enter the 6-digit OTP" },
        payment_not_owned_or_pending: { status: 409, message: "Payment is not pending or is not assigned to your account." },
        technician_required: { status: 403, message: "Technician access required." },
        challenge_not_found: { status: 404, message: "OTP not found. Request a new OTP." },
        already_used: { status: 409, message: "OTP was already used. Request a new OTP." },
        attempts_exceeded: { status: 429, message: "Too many incorrect attempts. Request a new OTP." },
        expired: { status: 410, message: "OTP expired. Request a new OTP." },
        amount_mismatch: { status: 409, message: "Payment amount changed. Request a new OTP." },
        incorrect: { status: 400, message: "Incorrect OTP." },
        challenge_already_consumed: { status: 409, message: "OTP was already consumed. Request a new OTP." },
      };
      const failure = failures[String(verification.data?.reason || "")] ||
        { status: 400, message: "OTP verification failed. Request a new OTP." };
      return json(failure.status, {
        error: failure.message,
        attempts_remaining: verification.data?.attempts_remaining,
      });
    }

    return json(200, {
      verified: true,
      status: "confirmed",
      message: "OTP verified. Cash payment confirmed.",
    });
  }

  return json(400, { error: "action must be request or verify" });
});
