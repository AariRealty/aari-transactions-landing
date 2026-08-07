// Aari Transactions · validate-promo-code (v1)
// ============================================================================
// Public endpoint (verify_jwt: false) called by submit.html when the intake
// page loads with ?promo=CODE in the URL. Returns whether the code is valid,
// what discount it carries, and who sent it, so the UI can show the green
// banner + $50-off pill on the eligible service.
//
// Response never leaks the sender's TC email or any other file data — just
// the sender's first name (for the "Milennys sent you..." banner) and the
// closing property street (for context).
//
// Body: { code: string }  ·  Response: 200 { valid, amount_cents, scope,
//   sent_by_first, from_property, agent_first_name } or { valid: false, reason }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { valid: false, reason: "method_not_allowed" });

  let body: { code?: string };
  try { body = await req.json(); } catch { return j(400, { valid: false, reason: "invalid_json" }); }
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return j(400, { valid: false, reason: "code_required" });
  // Shape check · avoid a DB round-trip for obviously bad strings.
  if (!/^[A-Z]{2,15}-TC-[A-Z0-9]{3,8}$/.test(code)) return j(200, { valid: false, reason: "not_recognized" });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: row, error } = await admin
    .from("at_promo_codes")
    .select("code, amount_cents, service_scope, agent_first_name, redeemed_at, sent_by_tc_id, file_id")
    .eq("code", code)
    .maybeSingle();
  if (error) return j(500, { valid: false, reason: "lookup_failed" });
  if (!row) return j(200, { valid: false, reason: "not_found" });
  if (row.redeemed_at) return j(200, { valid: false, reason: "already_used" });

  // Look up the sender's first name and the source property for the banner.
  // Both are best-effort: failure just means a less-personalized message.
  let sentByFirst = "";
  if (row.sent_by_tc_id) {
    const { data: tc } = await admin.from("agents").select("first_name").eq("id", row.sent_by_tc_id).maybeSingle();
    sentByFirst = String(tc?.first_name || "").trim();
  }
  let fromProperty = "";
  if (row.file_id) {
    const { data: f } = await admin.from("files").select("property_address").eq("id", row.file_id).maybeSingle();
    fromProperty = String(f?.property_address || "").split(",")[0].trim();
  }

  return j(200, {
    valid: true,
    code: row.code,
    amount_cents: row.amount_cents,
    scope: row.service_scope,
    agent_first_name: row.agent_first_name || "",
    sent_by_first: sentByFirst,
    from_property: fromProperty,
  });
});
