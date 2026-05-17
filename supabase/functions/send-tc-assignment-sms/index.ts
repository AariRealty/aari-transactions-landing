// ============================================================================
// Aari Transactions · send-tc-assignment-sms
// ============================================================================
// Fires when a file is assigned (or reassigned) to a TC. Sends an SMS asking
// the TC to reply Y/YES/ACCEPT to take the file, or N/PASS to decline. The
// inbound reply is handled by quo-incoming-webhook.
//
// Skips silently when the TC has no phone, sms_opt_in=false, or required
// secrets aren't set.
//
// Body: { file_id: uuid }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendQuoSms } from "../_shared/quo-sms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SERVICE_LABELS: Record<string, string> = {
  tc_one_side: "TC · One Side",
  tc_both_sides: "TC · Both Sides",
  lc: "Listing Coordinator",
  op_basic: "Offer Prep · Basic",
  op_complete: "Offer Prep · Complete",
  listing_docs: "Listing Docs",
  mls_setup: "MLS Setup",
  file_org: "File Organization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: { file_id?: string };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "Invalid JSON" }); }
  if (!body.file_id) return j(400, { ok: false, error: "file_id required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // File first · plain query (FK joins are fragile)
  const { data: f, error: fileErr } = await admin
    .from("files")
    .select("id, agent_id, assigned_tc_id, service_type, property_address, purchase_price_cents")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "File lookup failed: " + fileErr.message });
  if (!f) return j(404, { ok: false, error: "File not found" });
  if (!f.assigned_tc_id) return j(422, { ok: false, error: "File has no assigned TC" });

  // TC lookup
  const { data: tc } = await admin
    .from("agents")
    .select("id, first_name, phone, sms_opt_in")
    .eq("id", f.assigned_tc_id)
    .maybeSingle();
  if (!tc) return j(404, { ok: false, error: "TC not found" });
  if (!tc.phone) return j(200, { ok: false, skipped: true, reason: "tc_no_phone" });
  if (tc.sms_opt_in === false) return j(200, { ok: false, skipped: true, reason: "tc_opted_out" });

  // Agent name for context in the SMS
  const { data: agent } = await admin
    .from("agents")
    .select("first_name, last_name")
    .eq("id", f.agent_id)
    .maybeSingle();
  const agentName = `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim() || "an agent";

  const fileShortId = String(f.id).slice(0, 4).toUpperCase();
  const propertyShort = (f.property_address || "property").split(",")[0].trim();
  const serviceLabel = SERVICE_LABELS[f.service_type] || f.service_type || "service";
  const price = f.purchase_price_cents ? `$${Math.round(f.purchase_price_cents / 100000)}K` : "";

  const message =
    `Aari · New file ${fileShortId} from ${agentName} · ${propertyShort}${price ? " · " + price : ""} · ${serviceLabel}. ` +
    `Reply Y to accept, N to pass. Expires in 30 min.`;

  const result = await sendQuoSms({
    to: tc.phone,
    body: message,
    sourceContext: {
      file_id: f.id,
      tc_id: tc.id,
      agent_id: f.agent_id,
      reason: "tc_assignment",
    },
  });

  if (!result.ok) {
    console.error("[send-tc-assignment-sms]", result.error);
    return j(500, { ok: false, error: result.error });
  }
  return j(200, { ok: true, messageId: result.messageId });
});

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
