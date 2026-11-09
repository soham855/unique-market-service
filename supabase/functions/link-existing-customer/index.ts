import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = req.headers.get("Authorization") || "";
    if (!url || !anon || !service) throw new Error("Supabase server configuration is incomplete");
    if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);
    if (!user.phone || !user.phone_confirmed_at) {
      return json({ ok: false, error: "A verified mobile OTP session is required" }, 403);
    }

    const digits = user.phone.replace(/\\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    if (local.length !== 10) return json({ ok: false, error: "Verified mobile number is invalid" }, 400);
    const candidates = [...new Set([digits, local, `+${digits}`])];

    const admin = createClient(url, service);
    const { data: matches, error: lookupError } = await admin
      .from("customers")
      .select("id,name,mobile,email,company_name,address,user_id,profile_id")
      .in("mobile", candidates)
      .limit(2);
    if (lookupError) throw lookupError;
    if (!matches || matches.length === 0) {
      return json({ ok: false, error: "No existing customer account matches this verified mobile number" }, 404);
    }
    if (matches.length !== 1) {
      return json({ ok: false, error: "Multiple customer records match this mobile number; admin review is required" }, 409);
    }

    const customer = matches[0];
    if ((customer.user_id && customer.user_id !== user.id) ||
        (customer.profile_id && customer.profile_id !== user.id)) {
      return json({ ok: false, error: "This customer account is already linked to another login" }, 409);
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileLookupError) throw profileLookupError;
    if (existingProfile && existingProfile.role !== "customer") {
      return json({ ok: false, error: "This login is not a customer account" }, 403);
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      full_name: customer.name,
      phone: user.phone,
      role: "customer",
      company_name: customer.company_name,
      site_address: customer.address,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: linkError } = await admin.from("customers").update({
      user_id: user.id,
      profile_id: user.id,
      email: customer.email || user.email || null,
    }).eq("id", customer.id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .or(`profile_id.is.null,profile_id.eq.${user.id}`);
    if (linkError) throw linkError;

    const { data: linked, error: verifyError } = await admin.from("customers")
      .select("user_id,profile_id").eq("id", customer.id).single();
    if (verifyError) throw verifyError;
    if (linked.user_id !== user.id || linked.profile_id !== user.id) {
      return json({ ok: false, error: "Customer account link could not be verified; contact admin" }, 409);
    }
    return json({ ok: true, role: "customer", customer_id: customer.id });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to link customer account" }, 400);
  }
});
