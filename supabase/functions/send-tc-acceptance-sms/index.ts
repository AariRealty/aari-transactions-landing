// ============================================================================
// Aari Transactions · send-tc-acceptance-sms
// ============================================================================
// Fires alongside send-tc-acceptance-to-agent when a TC accepts a file. Sends
// a short transactional SMS via Quo (formerly OpenPhone) from the Aari Realty
// business number.
//
// Skips silently when:
//   - agent.sms_opt_in is false
//   - agent.phone is missing
//   - QUO_API_KEY or QUO_FROM_NUMBER env vars are unset
//
// Body: { file_id: uuid }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendQuoSms } from "../_shared/quo-sms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("AARI_PORTAL_URL") ?? "https://aaritransactions.com/portal.html";

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

  // Pull the file first · plain query, no joins (FK relationship names vary
  // by project and the embedded-select syntax is fragile across migrations).
  const { data: f, error: fileErr } = await admin
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address, tc_expected_start_at")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "File lookup failed: " + fileErr.message });
  if (!f) return j(404, { ok: false, error: "File not found · id=" + body.file_id });

  // Pull the agent + TC separately
  const { data: agent } = await admin
    .from("agents")
    .select("id, first_name, phone, sms_opt_in")
    .eq("id", f.agent_id)
    .maybeSingle();
  if (!agent) return j(404, { ok: false, error: "Agent not found for file" });

  if (!agent.phone) {
    return j(200, { ok: false, skipped: true, reason: "agent_no_phone" });
  }
  if (agent.sms_opt_in === false) {
    return j(200, { ok: false, skipped: true, reason: "agent_opted_out" });
  }

  let tc: { id: string; first_name?: string; last_name?: string } | null = null;
  if (f.assigned_tc_id) {
    const { data: tcRow } = await admin
      .from("agents")
      .select("id, first_name, last_name")
      .eq("id", f.assigned_tc_id)
      .maybeSingle();
    tc = tcRow;
  }

  const tcName = `${tc?.first_name ?? ""} ${tc?.last_name ?? ""}`.trim() || "Your TC";
  const startStr = formatStartTime(f.tc_expected_start_at);
  const propertyShort = (f.property_address || "your file").split(",")[0].trim();
  const fileShortId = String(f.id).slice(0, 8).toUpperCase();

  const message =
    `Aari Transactions · ${tcName} accepted your file ${fileShortId} (${propertyShort}) and starts at ${startStr}. ` +
    `View: ${PORTAL_URL}\n\nReply STOP to opt out.`;

  const result = await sendQuoSms({
    to: agent.phone,
    body: message,
    sourceContext: {
      file_id: f.id,
      agent_id: agent.id,
      tc_id: tc?.id ?? null,
      reason: "tc_accepted",
    },
  });

  if (!result.ok) {
    console.error("[send-tc-acceptance-sms]", result.error);
    return j(500, { ok: false, error: result.error });
  }
  return j(200, { ok: true, messageId: result.messageId, status: result.status });
});

function formatStartTime(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (d.toDateString() === today.toDateString()) return `${time} today`;
  if (d.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
