import { readComplaints } from "./complaint-api.js";
import { createComplaint, ComplaintCreateError } from "./complaint-create.js";
import { updateComplaintStatus, ComplaintStatusError } from "./complaint-status.js";
import { requestCashPaymentOtp, verifyCashPaymentOtp, CashPaymentOtpError } from "./cash-payment-otp.js";
import { createPendingCashPayment, CashPaymentCreateError } from "./payment-create.js";

const ALLOWED_ORIGINS = new Set([
  "https://salesuniquemarket.com",
  "https://www.salesuniquemarket.com",
  "https://unique-market-service.vercel.app",
  "http://localhost:5173",
]);

function json(body, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Idempotency-Key";
    headers["Access-Control-Max-Age"] = "600";
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function requestOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return origin && !ALLOWED_ORIGINS.has(origin) ? null : origin;
}

async function getAuthenticatedUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { response: json({ error: "Sign in required" }, 401, requestOrigin(request) || "") };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { response: json({ error: "Identity provider is not configured" }, 503, requestOrigin(request) || "") };
  }

  let response;
  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
    });
  } catch {
    return { response: json({ error: "Identity provider unavailable" }, 503, requestOrigin(request) || "") };
  }
  if (response.status === 401 || response.status === 403) {
    return { response: json({ error: "Invalid or expired session" }, 401, requestOrigin(request) || "") };
  }
  if (!response.ok) {
    return { response: json({ error: "Identity verification failed" }, 503, requestOrigin(request) || "") };
  }

  const user = await response.json().catch(() => null);
  if (!user || typeof user.id !== "string" || !user.id) {
    return { response: json({ error: "Invalid identity response" }, 401, requestOrigin(request) || "") };
  }
  return { user };
}

export default {
  async fetch(request, env) {
    const origin = requestOrigin(request);
    if (origin === null) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") {
      return origin
        ? json({}, 204, origin)
        : json({ error: "Origin required" }, 403);
    }

    const url = new URL(request.url);
    const isComplaintCollection = url.pathname === "/v1/complaints";
    const statusUpdateMatch = url.pathname.match(/^\/v1\/complaints\/([^/]+)\/status$/);
    const cashPaymentCreateMatch = url.pathname === "/v1/payments/cash";
    const cashOtpRequestMatch = url.pathname.match(/^\/v1\/payments\/([^/]+)\/cash-otp\/request$/);
    const cashOtpVerifyMatch = url.pathname.match(/^\/v1\/payments\/([^/]+)\/cash-otp\/verify$/);
    if (request.method !== "GET" &&
        !(request.method === "POST" && isComplaintCollection) &&
        !(request.method === "PATCH" && statusUpdateMatch) &&
        !(request.method === "POST" && (cashPaymentCreateMatch || cashOtpRequestMatch || cashOtpVerifyMatch))) {
      return json({ error: "Method not allowed" }, 405, origin || "");
    }
    if (url.pathname === "/health") {
      try {
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        if (row?.ok !== 1) throw new Error("D1 health query failed");
        return json({ ok: true, service: "unique-market-d1-staging-worker", database: "connected" }, 200, origin || "");
      } catch {
        return json({ ok: false, service: "unique-market-d1-staging-worker", database: "unavailable" }, 503, origin || "");
      }
    }

    if (request.method === "POST" && cashPaymentCreateMatch) {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare("SELECT id, role FROM profiles WHERE id = ? LIMIT 1")
          .bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        const body = await request.json().catch(() => null);
        const result = await createPendingCashPayment(
          env.DB, profile, identity.user.id, body, request.headers.get("Idempotency-Key"),
        );
        return json(result, result.replayed ? 200 : 201, origin || "");
      } catch (error) {
        if (error instanceof CashPaymentCreateError) return json({ error: error.code }, error.status, origin || "");
        return json({ error: "Cash payment creation failed" }, 503, origin || "");
      }
    }

    if (request.method === "POST" && isComplaintCollection) {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare("SELECT id, role FROM profiles WHERE id = ? LIMIT 1").bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        const body = await request.json().catch(() => null);
        const result = await createComplaint(env.DB, profile, body, identity.user.id, request.headers.get("Idempotency-Key"));
        return json(result, result.replayed ? 200 : 201, origin || "");
      } catch (error) {
        if (error instanceof ComplaintCreateError) return json({ error: error.code }, error.status, origin || "");
        return json({ error: "Complaint creation failed" }, 503, origin || "");
      }
    }

    if (request.method === "PATCH" && statusUpdateMatch) {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare("SELECT id, role FROM profiles WHERE id = ? LIMIT 1")
          .bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        let complaintId;
        try { complaintId = decodeURIComponent(statusUpdateMatch[1]); }
        catch { return json({ error: "Invalid complaint ID" }, 400, origin || ""); }
        const body = await request.json().catch(() => null);
        const result = await updateComplaintStatus(
          env.DB, profile, identity.user.id, complaintId, body,
          request.headers.get("Idempotency-Key"),
        );
        return json(result, result.replayed ? 200 : 200, origin || "");
      } catch (error) {
        if (error instanceof ComplaintStatusError) return json({ error: error.code }, error.status, origin || "");
        return json({ error: "Complaint status update failed" }, 503, origin || "");
      }
    }

    if (request.method === "POST" && (cashOtpRequestMatch || cashOtpVerifyMatch)) {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare("SELECT id, role FROM profiles WHERE id = ? LIMIT 1").bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        let paymentId;
        try { paymentId = decodeURIComponent((cashOtpRequestMatch || cashOtpVerifyMatch)[1]); }
        catch { return json({ error: "Invalid payment ID" }, 400, origin || ""); }
        const body = await request.json().catch(() => null);
        const result = cashOtpRequestMatch
          ? await requestCashPaymentOtp(env.DB, profile, identity.user.id, paymentId, request.headers.get("Idempotency-Key"), env)
          : await verifyCashPaymentOtp(env.DB, profile, identity.user.id, paymentId, body, env);
        return json(result, 200, origin || "");
      } catch (error) {
        if (error instanceof CashPaymentOtpError) return json({ error: error.code }, error.status, origin || "");
        return json({ error: "Cash payment OTP operation failed" }, 503, origin || "");
      }
    }

    const complaintMatch = url.pathname.match(/^\/v1\/complaints(?:\/([^/]+))?$/);
    if (complaintMatch) {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare(
          "SELECT id, role FROM profiles WHERE id = ? LIMIT 1"
        ).bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        if (!["admin", "technician", "customer"].includes(profile.role)) {
          return json({ error: "Profile role is invalid" }, 403, origin || "");
        }
        let complaintId = null;
        if (complaintMatch[1]) {
          try { complaintId = decodeURIComponent(complaintMatch[1]); }
          catch { return json({ error: "Invalid complaint ID" }, 400, origin || ""); }
          if (!complaintId || complaintId.length > 128) {
            return json({ error: "Invalid complaint ID" }, 400, origin || "");
          }
        }
        const rawLimit = Number(url.searchParams.get("limit") || 50);
        const rawOffset = Number(url.searchParams.get("offset") || 0);
        const rows = await readComplaints(env.DB, profile, {
          complaintId,
          status: url.searchParams.get("status"),
          limit: Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 50,
          offset: Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0,
        });
        return json({ complaints: rows, count: rows.length }, 200, origin || "");
      } catch (error) {
        if (error?.message === "Forbidden profile") return json({ error: "Forbidden" }, 403, origin || "");
        return json({ error: "Complaint lookup failed" }, 503, origin || "");
      }
    }

    if (url.pathname === "/v1/me") {
      const identity = await getAuthenticatedUser(request, env);
      if (identity.response) return identity.response;
      try {
        const profile = await env.DB.prepare(
          "SELECT id, full_name, phone, role FROM profiles WHERE id = ? LIMIT 1"
        ).bind(identity.user.id).first();
        if (!profile) return json({ error: "Profile is not provisioned in staging" }, 404, origin || "");
        if (!["admin", "technician", "customer"].includes(profile.role)) {
          return json({ error: "Profile role is invalid" }, 403, origin || "");
        }
        return json({
          user: { id: identity.user.id, email: identity.user.email || null },
          profile,
        }, 200, origin || "");
      } catch {
        return json({ error: "Profile lookup failed" }, 503, origin || "");
      }
    }

    return json({ error: "Not found" }, 404, origin || "");
  },
};
