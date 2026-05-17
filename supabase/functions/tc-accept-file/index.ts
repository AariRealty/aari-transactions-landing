// ============================================================================
// Aari Transactions · tc-accept-file edge function
// ============================================================================
// Called when a TC clicks Accept in the cockpit. Sets tc_accepted_at,
// tc_expected_start_at, and flips file status to tc_engaged. The trigger
// on the files table handles the audit log entry automatically.
//
// Auth: requires the caller's bearer token (Supabase auth). The function
// verifies the caller IS the file's assigned TC OR the broker — no one else
// can accept on their behalf.
//
// Body:
//   {
//     file_id: uuid,
//     expected_start_at: ISO timestamp · the TC's committed start time
//   }
//
// Response:
//   { ok: true, file_id, expected_start_at }
//   { ok: false, error: string }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  let body: { file_id?: string; expected_start_at?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (!body.file_id) return json(400, { ok: false, error: "file_id required" });
  if (!body.expected_start_at) return json(400, { ok: false, error: "expected_start_at required" });

  // Pull the caller's auth token to verify identity. The TC OR broker only.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "Missing bearer token" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { ok: false, error: "Invalid session" });
  }
  const callerId = userData.user.id;

  // Admin client (service role) — bypasses RLS for the actual update + audit.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load the file + verify caller is the assigned TC or the broker.
  const { data: file, error: fileErr } = await admin
    .from("files")
    .select("id, assigned_tc_id, status, tc_accepted_at")
    .eq("id", body.file_id)
    .single();
  if (fileErr || !file) {
    return json(404, { ok: false, error: "File not found" });
  }

  if (file.tc_accepted_at) {
    return json(409, { ok: false, error: "File already accepted" });
  }

  // Caller authorization: must be assigned_tc OR a broker.
  let isBroker = false;
  try {
    const { data: brokerCheck } = await admin
      .from("agents")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();
    isBroker = brokerCheck?.role === "broker";
  } catch (_) { /* default false */ }

  if (file.assigned_tc_id !== callerId && !isBroker) {
    return json(403, { ok: false, error: "You are not assigned to this file" });
  }

  // Sanity-check the start time: must be in the future, within 30 days.
  const startAt = new Date(body.expected_start_at);
  if (isNaN(startAt.getTime())) {
    return json(400, { ok: false, error: "expected_start_at must be a valid ISO timestamp" });
  }
  const now = Date.now();
  const maxFuture = now + 30 * 24 * 60 * 60 * 1000;
  if (startAt.getTime() < now - 60_000 || startAt.getTime() > maxFuture) {
    return json(400, { ok: false, error: "expected_start_at must be within 30 days from now" });
  }

  // Update the file · trigger logs the 'accepted' event to file_tc_history.
  const { error: updErr } = await admin
    .from("files")
    .update({
      tc_accepted_at: new Date().toISOString(),
      tc_expected_start_at: startAt.toISOString(),
      status: "tc_engaged",
    })
    .eq("id", body.file_id);

  if (updErr) {
    console.error("[tc-accept-file] update failed:", updErr);
    return json(500, { ok: false, error: "Failed to update file: " + updErr.message });
  }

  // Fire the agent confirmation email + SMS in parallel · both best-effort.
  // Email goes to every agent (their main contact channel). SMS only if they
  // have a phone on file AND sms_opt_in is true.
  Promise.all([
    admin.functions.invoke("send-tc-acceptance-to-agent", {
      body: { file_id: body.file_id },
    }).catch(() => {}),
    admin.functions.invoke("send-tc-acceptance-sms", {
      body: { file_id: body.file_id },
    }).catch(() => {}),
  ]).catch(() => {});
  // Don't await · the file is already accepted, notifications are async.

  return json(200, {
    ok: true,
    file_id: body.file_id,
    expected_start_at: startAt.toISOString(),
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
