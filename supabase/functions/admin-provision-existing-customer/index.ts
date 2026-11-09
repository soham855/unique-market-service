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

  let createdUserId: string | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = req.headers.get("Authorization") || "";
    if (!url || !anon || !service) throw new Error("Supabase server configuration is incomplete");
    if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user: adminUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !adminUser) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: adminProfile, error: roleError } = await admin.from("profiles")
      .select("role").eq("id", adminUser.id).maybeSingle();
    if (roleError) throw roleError;
    if (adminProfile?.role !== "admin") return json({ ok: false, error: "Admin access required" }, 403);

    const body = await req.json();
    const customerId = String(body.customer_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      return json({ ok: false, error: "A valid customer_id is required" }, 400);
    }

    const { data: customer, error: customerError } = await admin.from("customers")
      .select("id,name,mobile,email,company_name,address,user_id,profile_id")
      .eq("id", customerId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return json({ ok: false, error: "Customer record not found" }, 404);
    if (customer.user_id || customer.profile_id) {
      return json({ ok: false, error: "Customer record is already linked; no changes made" }, 409);
    }

    const digits = String(customer.mobile || "").replace(/\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    if (local.length !== 10) return json({ ok: false, error: "Customer mobile number is invalid" }, 400);
    const phone = `+91${local}`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: false,
      user_metadata: { role: "customer", name: customer.name, mobile: phone },
    });
    if (createError) {
      const message = createError.message || "Unable to provision customer login";
      if (/already.*(registered|exists)|phone.*(taken|exists)/i.test(message)) {
        return json({ ok: false, error: "An Auth account already exists for this mobile. Use account recovery or admin review; no customer data changed." }, 409);
      }
      throw createError;
    }
    createdUserId = created.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: createdUserId,
      full_name: customer.name,
      phone,
      role: "customer",
      company_name: customer.company_name,
      site_address: customer.address,
    });
    if (profileError) throw profileError;

    const { data: linkedRows, error: linkError } = await admin.from("customers").update({
      user_id: createdUserId,
      profile_id: createdUserId,
    }).eq("id", customer.id).is("user_id", null).is("profile_id", null)
      .select("id,user_id,profile_id");
    if (linkError) throw linkError;
    if (!linkedRows || linkedRows.length !== 1 ||
        linkedRows[0].user_id !== createdUserId || linkedRows[0].profile_id !== createdUserId) {
      throw new Error("Customer record changed during provisioning; rollback performed");
    }

    return json({
      ok: true,
      role: "customer",
      customer_id: customer.id,
      phone,
      phone_verified: false,
      message: "Customer login provisioned. The customer must complete SMS OTP verification before signing in.",
    });
  } catch (error) {
    if (createdUserId) {
      const url = Deno.env.get("SUPABASE_URL")!;
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(url, service);
      try {
        await admin.from("customers").update({ user_id: null, profile_id: null })
          .eq("user_id", createdUserId).eq("profile_id", createdUserId);
        await admin.from("profiles").delete().eq("id", createdUserId);
        await admin.auth.admin.deleteUser(createdUserId);
      } catch (_) { /* best-effort rollback; never delete the original customer row */ }
    }
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to provision customer login" }, 400);
  }
});
