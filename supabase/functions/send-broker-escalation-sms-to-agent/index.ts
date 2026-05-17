// ============================================================================
// Aari Transactions · send-broker-escalation-sms-to-agent
// ============================================================================
// Fires when a file's status flips to 'awaiting_broker_review' (all TCs
// exhausted via timeout, decline, or agent reassign). Sends the agent ONE
// SMS so they know the routing landed at the broker.
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

  const { data: f } = await admin
    .from("files")
    .select("id, agent_id, property_address")
    .eq("id", body.file_id)
    .maybeSingle();
  if (!f) return j(404, { ok: false, error: "File not found" });

  const { data: agent } = await admin
    .from("agents")
    .select("first_name, phone, sms_opt_in")
    .eq("id", f.agent_id)
    .maybeSingle();
  if (!agent?.phone) return j(200, { ok: false, skipped: true, reason: "agent_no_phone" });
  if (agent.sms_opt_in === false) return j(200, { ok: false, skipped: true, reason: "agent_opted_out" });

  const fileShortId = String(f.id).slice(0, 4).toUpperCase();
  const propertyShort = (f.property_address || "your file").split(",")[0].trim();
  const message =
    `Aari · File ${fileShortId} (${propertyShort}) is going directly to the broker — ` +
    `Marlenyi is taking it personally. No further action needed from you.`;

  const result = await sendQuoSms({
    to: agent.phone,
    body: message,
    sourceContext: {
      file_id: f.id,
      agent_id: f.agent_id,
      reason: "broker_escalation",
    },
  });

  if (!result.ok) {
    console.error("[send-broker-escalation-sms-to-agent]", result.error);
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
