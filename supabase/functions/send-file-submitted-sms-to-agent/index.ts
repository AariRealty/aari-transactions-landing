// ============================================================================
// Aari Transactions · send-file-submitted-sms-to-agent
// ============================================================================
// Fires immediately on file insert · sends the agent a fast acknowledgment
// SMS so they know the system has the file. Mirrors the inline success card,
// but lands on their phone for when they leave the portal.
//
// Skips silently when agent has no phone, sms_opt_in=false, or required
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: { file_id?: string };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "Invalid JSON" }); }
  if (!body.file_id) return j(400, { ok: false, error: "file_id required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: f, error: fileErr } = await admin
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "File lookup failed: " + fileErr.message });
  if (!f) return j(404, { ok: false, error: "File not found" });

  const { data: agent } = await admin
    .from("agents")
    .select("id, first_name, phone, sms_opt_in")
    .eq("id", f.agent_id)
    .maybeSingle();
  if (!agent?.phone) return j(200, { ok: false, skipped: true, reason: "agent_no_phone" });
  if (agent.sms_opt_in === false) return j(200, { ok: false, skipped: true, reason: "agent_opted_out" });

  // Resolve assigned TC name if one was already picked (preferred-TC path).
  // If null (fast-path), use generic phrasing.
  let tcName = "a TC";
  if (f.assigned_tc_id) {
    const { data: tc } = await admin
      .from("agents")
      .select("first_name, last_name")
      .eq("id", f.assigned_tc_id)
      .maybeSingle();
    if (tc) tcName = `${tc.first_name ?? ""} ${tc.last_name ?? ""}`.trim() || tcName;
  }

  const fileShortId = String(f.id).slice(0, 4).toUpperCase();
  const propertyShort = (f.property_address || "your file").split(",")[0].trim();
  const message =
    `Aari · File ${fileShortId} (${propertyShort}) is in · routing to ${tcName}. ` +
    `We'll text you when they accept. Reply STOP to opt out.`;

  const result = await sendQuoSms({
    to: agent.phone,
    body: message,
    sourceContext: {
      file_id: f.id,
      agent_id: agent.id,
      reason: "file_submitted",
    },
  });

  if (!result.ok) {
    console.error("[send-file-submitted-sms-to-agent]", result.error);
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
