// ============================================================================
// Aari Transactions · agent-request-tc-reassign edge function
// ============================================================================
// Called when the agent clicks "Request another TC" on their file. Enforces
// the 3-swap cap server-side and logs the event. The actual reassignment
// uses the same logic as the timeout sweep: pick next eligible TC, or
// escalate to broker if exhausted.
//
// Auth: caller must be the file's agent (no one else can reassign).
//
// Body: { file_id: uuid }
//
// Response:
//   { ok: true, file_id, next_tc_id, outcome: 'reassigned' | 'escalated_to_broker' }
//   { ok: false, error: string }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return j(401, { ok: false, error: "Missing bearer token" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return j(401, { ok: false, error: "Invalid session" });
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load the file · caller must be agent_id, file must not be accepted, swap cap not hit
  const { data: file, error: fileErr } = await admin
    .from("files")
    .select("id, agent_id, assigned_tc_id, status, tc_accepted_at, tc_reassign_count, service_type")
    .eq("id", body.file_id)
    .single();
  if (fileErr || !file) return j(404, { ok: false, error: "File not found" });
  if (file.agent_id !== callerId) return j(403, { ok: false, error: "Only the file's agent can request a reassign" });
  if (file.tc_accepted_at) return j(409, { ok: false, error: "TC has already accepted this file — too late to swap" });
  if ((file.tc_reassign_count ?? 0) >= 3) {
    return j(429, { ok: false, error: "Reassign limit reached (3). Keep the current TC or wait until tomorrow." });
  }

  // Log the agent-driven reassign event for the current TC
  if (file.assigned_tc_id) {
    await admin.from("file_tc_history").insert({
      file_id: file.id,
      tc_id: file.assigned_tc_id,
      event_type: "agent_reassigned",
      metadata: { reason: "agent_requested_swap" },
    });
  }

  // Pick next eligible TC · same logic as sweep function (active TC, not in history)
  const { data: nextTcRow } = await admin
    .from("agents")
    .select("id")
    .eq("role", "tc")
    .eq("is_active", true)
    .not("id", "in", `(${await getTriedTcIds(admin, file.id)})`)
    .limit(1)
    .maybeSingle();

  if (!nextTcRow) {
    // All TCs exhausted · escalate to broker
    await admin.from("files").update({
      status: "awaiting_broker_review",
      assigned_tc_id: null,
      tc_reassign_count: (file.tc_reassign_count ?? 0) + 1,
    }).eq("id", file.id);
    await admin.from("file_tc_history").insert({
      file_id: file.id,
      tc_id: null,
      event_type: "broker_escalated",
      metadata: { reason: "all_tcs_exhausted_via_agent_swap" },
    });
    return j(200, { ok: true, file_id: file.id, next_tc_id: null, outcome: "escalated_to_broker" });
  }

  // Reassign · trigger on files logs the 'assigned' event automatically
  await admin.from("files").update({
    assigned_tc_id: nextTcRow.id,
    status: "awaiting_tc_acceptance",
    tc_reassign_count: (file.tc_reassign_count ?? 0) + 1,
  }).eq("id", file.id);

  return j(200, { ok: true, file_id: file.id, next_tc_id: nextTcRow.id, outcome: "reassigned" });
});

async function getTriedTcIds(admin: ReturnType<typeof createClient>, fileId: string): Promise<string> {
  const { data } = await admin
    .from("file_tc_history")
    .select("tc_id")
    .eq("file_id", fileId)
    .not("tc_id", "is", null);
  const ids = (data ?? []).map((r: { tc_id: string }) => `'${r.tc_id}'`);
  return ids.length ? ids.join(",") : `'00000000-0000-0000-0000-000000000000'`;
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
