// ============================================================================
// Aari Transactions · send-tc-pool-broadcast
// ============================================================================
// Texts EVERY opted-in TC when a file lands in the open claim pool (no TC
// assigned). First TC to claim it in the cockpit wins; the others just ignore
// the text. Sends via Quo (formerly OpenPhone) from the Aari Realty number.
//
// Call this when a file is created or returned to the pool with no TC:
//   POST { file_id: uuid }
// Wire it to a DB webhook on files INSERT/UPDATE where assigned_tc_id IS NULL,
// or invoke it from the submission flow when no TC is selected.
//
// Skips silently when:
//   - the file is already claimed (assigned_tc_id is set)
//   - a TC has sms_opt_in = false, or no phone
//   - QUO_API_KEY or QUO_FROM_NUMBER env vars are unset (handled in sendQuoSms)
//
// NOTE: this assumes TCs are marked agents.role = 'tc'. If you mark TCs
// differently, change the .eq("role", "tc") filter below.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendQuoSms } from "../_shared/quo-sms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FILES_URL = Deno.env.get("AARI_FILES_URL") ?? "https://aaritransactions.com/files.html";

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

  // 1) Load the file. Bail if it's already claimed — no point texting the pool.
  const { data: f, error: fileErr } = await admin
    .from("files")
    .select("id, assigned_tc_id, property_address, file_type")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "File lookup failed: " + fileErr.message });
  if (!f) return j(404, { ok: false, error: "File not found · id=" + body.file_id });
  if (f.assigned_tc_id) return j(200, { ok: true, skipped: true, reason: "already_claimed" });

  // 2) Pull every TC who can take an SMS.
  const { data: tcs, error: tcErr } = await admin
    .from("agents")
    .select("id, first_name, phone, sms_opt_in")
    .eq("role", "tc");
  if (tcErr) return j(500, { ok: false, error: "TC lookup failed: " + tcErr.message });

  const reachable = (tcs ?? []).filter((t) => t.phone && t.sms_opt_in !== false);
  if (reachable.length === 0) return j(200, { ok: true, sent: 0, skipped: true, reason: "no_reachable_tcs" });

  // 3) Build the broadcast and fan it out.
  const propertyShort = (f.property_address || "a new file").split(",")[0].trim();
  const fileShortId = String(f.id).slice(0, 8).toUpperCase();
  const message =
    `Aari Transactions · New file open for the taking: ${propertyShort} (${fileShortId}). ` +
    `First TC to claim it gets it. Claim here: ${FILES_URL}`;

  const results = await Promise.all(reachable.map(async (t) => {
    const r = await sendQuoSms({
      to: t.phone as string,
      body: message,
      sourceContext: { file_id: f.id, tc_id: t.id, reason: "pool_broadcast" },
    });
    if (!r.ok) console.error("[send-tc-pool-broadcast]", t.id, r.error);
    return { tc_id: t.id, ok: r.ok, error: r.error ?? null };
  }));

  const sent = results.filter((r) => r.ok).length;
  return j(200, { ok: sent > 0, sent, attempted: reachable.length, results });
});

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
