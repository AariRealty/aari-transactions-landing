// ============================================================================
// Aari Transactions · quo-incoming-webhook
// ============================================================================
// Quo POSTs every inbound SMS to this endpoint. We parse the sender's phone,
// match it to a TC in the agents table, find their most recent unaccepted
// file assignment, and:
//   - Reply matches Y/YES/ACCEPT/OK  → call tc-accept-file with ASAP start
//   - Reply matches N/NO/PASS/DECLINE → log decline + auto-reassign
//   - Anything else → confirmation SMS asking for Y/N
//   - "STOP" / "UNSUBSCRIBE"          → set sms_opt_in = false, send opt-out confirm
//
// Register this URL in Quo Dashboard → Settings → Webhooks → "Create new
// webhook for messages" with event type message.received:
//   https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/quo-incoming-webhook
//
// Quo webhook payload (per their docs):
//   {
//     id: "evt_...",
//     type: "message.received",
//     data: {
//       object: {
//         id: "AC...",
//         from: "+15555550100",
//         to: ["+12396881770"],
//         text: "Y",
//         direction: "incoming",
//         createdAt: "2026-05-17T..."
//       }
//     }
//   }
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

const ACCEPT_REPLIES = new Set(["Y", "YES", "ACCEPT", "OK", "ACK", "GO"]);
const DECLINE_REPLIES = new Set(["N", "NO", "PASS", "DECLINE", "SKIP"]);
const OPTOUT_REPLIES = new Set(["STOP", "UNSUBSCRIBE", "UNSUB", "QUIT", "END", "CANCEL"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return j(400, { ok: false, error: "Invalid JSON" }); }

  // Pull what we need from Quo's payload · defensive against shape changes
  const fromPhone = pickPath<string>(payload, ["data", "object", "from"])
                 ?? pickPath<string>(payload, ["data", "from"])
                 ?? pickPath<string>(payload, ["from"]);
  const text = pickPath<string>(payload, ["data", "object", "text"])
            ?? pickPath<string>(payload, ["data", "text"])
            ?? pickPath<string>(payload, ["text"]);
  const direction = pickPath<string>(payload, ["data", "object", "direction"])
                 ?? pickPath<string>(payload, ["data", "direction"]);

  // Only care about inbound messages
  if (direction && direction !== "incoming") {
    return j(200, { ok: true, ignored: "non-incoming direction: " + direction });
  }

  if (!fromPhone) return j(400, { ok: false, error: "Missing sender phone in payload" });
  if (!text) return j(400, { ok: false, error: "Missing message text in payload" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Log every inbound to sms_log for audit
  await admin.from("sms_log").insert({
    provider: "quo",
    to_phone: fromPhone,            // for inbound, "to_phone" stores the sender
    body: text,
    status: "sent",                 // co-opting status field for "received"
    metadata: { direction: "incoming", raw_event_id: pickPath<string>(payload, ["id"]) ?? null },
  }).then(() => {}).catch(() => {});

  // Match phone to a TC in the agents table · use normalized matching
  const tc = await findTcByPhone(admin, fromPhone);
  if (!tc) {
    // Inbound from someone who isn't a TC (could be an agent/client) · ignore quietly
    return j(200, { ok: true, ignored: "no_tc_match" });
  }

  // Normalize the reply: uppercase, trim, take first word
  const cleaned = text.trim().toUpperCase().split(/\s+/)[0] ?? "";

  // Opt-out · regardless of context
  if (OPTOUT_REPLIES.has(cleaned)) {
    await admin.from("agents").update({ sms_opt_in: false }).eq("id", tc.id);
    await sendQuoSms({
      to: fromPhone,
      body: "You're unsubscribed from Aari SMS.\n\nYou'll still get email.\n\nReply START to re-enable texts.\n\n",
      sourceContext: { tc_id: tc.id, reason: "opt_out_confirm" },
    });
    return j(200, { ok: true, action: "opted_out" });
  }

  // Find the TC's most recent unaccepted file assignment (where THEY are the
  // assigned_tc and tc_accepted_at is null and status is in the accept window).
  const { data: pendingFile } = await admin
    .from("files")
    .select("id, status, agent_id, tc_accepted_at, created_at")
    .eq("assigned_tc_id", tc.id)
    .is("tc_accepted_at", null)
    .in("status", ["intake_received", "awaiting_tc_acceptance"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendingFile) {
    await sendQuoSms({
      to: fromPhone,
      body: "Aari · No pending files to accept right now.\n\nIf you meant to act on a specific file, do it from the cockpit.\n\n",
      sourceContext: { tc_id: tc.id, reason: "no_pending_file" },
    });
    return j(200, { ok: true, action: "no_pending" });
  }

  const fileShortId = String(pendingFile.id).slice(0, 4).toUpperCase();

  // ── ACCEPT ───────────────────────────────────────────────────────────────
  if (ACCEPT_REPLIES.has(cleaned)) {
    const startAt = new Date(Date.now() + 60 * 60 * 1000); // default ASAP = 1h from now
    const startStr = startAt.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
    });

    // Update directly · matches what tc-accept-file would do (avoids the
    // round-trip through that function and lets us skip its auth path since
    // we've already verified the TC identity by their phone number).
    await admin.from("files").update({
      tc_accepted_at: new Date().toISOString(),
      tc_expected_start_at: startAt.toISOString(),
      status: "tc_engaged",
    }).eq("id", pendingFile.id);

    // Fire the agent-facing email + SMS in parallel
    Promise.all([
      admin.functions.invoke("send-tc-acceptance-to-agent", { body: { file_id: pendingFile.id } }).catch(() => {}),
      admin.functions.invoke("send-tc-acceptance-sms", { body: { file_id: pendingFile.id } }).catch(() => {}),
    ]).catch(() => {});

    // Confirmation back to the TC
    await sendQuoSms({
      to: fromPhone,
      body: `Got it. File ${fileShortId} is yours.\n\nDefault start: ${startStr}.\n\nAdjust in your cockpit if needed.\n\n`,
      sourceContext: { tc_id: tc.id, file_id: pendingFile.id, reason: "accept_confirm" },
    });
    return j(200, { ok: true, action: "accepted", file_id: pendingFile.id });
  }

  // ── DECLINE ──────────────────────────────────────────────────────────────
  if (DECLINE_REPLIES.has(cleaned)) {
    // Log decline event
    await admin.from("file_tc_history").insert({
      file_id: pendingFile.id,
      tc_id: tc.id,
      event_type: "declined",
      decline_reason: "tc_replied_pass_via_sms",
      metadata: { source: "sms_reply", reply: text },
    });
    // Pick next eligible TC (same logic as the sweep function)
    const { data: nextTc } = await admin.rpc("sweep_unaccepted_files");
    // The RPC sweeps ALL unaccepted past-30-min files. For an immediate
    // decline, we want to reassign THIS file right now regardless of age.
    // Easiest: clear assigned_tc_id and let the sweep eventually pick it up,
    // OR pick a new TC manually here. Manual pick is more responsive:
    const { data: nextEligible } = await admin
      .from("agents")
      .select("id")
      .eq("role", "tc")
      .eq("is_active", true)
      .not("id", "in", `(${await getTriedTcIds(admin, pendingFile.id)})`)
      .limit(1)
      .maybeSingle();

    if (nextEligible) {
      await admin.from("files").update({
        assigned_tc_id: nextEligible.id,
        status: "awaiting_tc_acceptance",
      }).eq("id", pendingFile.id);
      // Fire SMS to the new TC
      admin.functions.invoke("send-tc-assignment-sms", { body: { file_id: pendingFile.id } }).catch(() => {});
    } else {
      // All TCs exhausted · escalate to broker
      await admin.from("files").update({
        status: "awaiting_broker_review",
        assigned_tc_id: null,
      }).eq("id", pendingFile.id);
      await admin.from("file_tc_history").insert({
        file_id: pendingFile.id, tc_id: null, event_type: "broker_escalated",
        metadata: { reason: "all_tcs_exhausted_via_sms_decline" },
      });
    }

    await sendQuoSms({
      to: fromPhone,
      body: `Okay — file ${fileShortId} routed to another TC.\n\nThanks for the fast reply.\n\n`,
      sourceContext: { tc_id: tc.id, file_id: pendingFile.id, reason: "decline_confirm" },
    });
    return j(200, { ok: true, action: "declined", file_id: pendingFile.id });
  }

  // ── UNCLEAR REPLY ────────────────────────────────────────────────────────
  await sendQuoSms({
    to: fromPhone,
    body: `Didn't catch that.\n\nReply Y to accept file ${fileShortId} or N to pass.\n\n`,
    sourceContext: { tc_id: tc.id, file_id: pendingFile.id, reason: "unclear_reply" },
  });
  return j(200, { ok: true, action: "unclear", file_id: pendingFile.id });
});

// ============================================================================
// Helpers
// ============================================================================

// deno-lint-ignore no-explicit-any
function pickPath<T>(obj: any, path: string[]): T | undefined {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur as T | undefined;
}

// Match an incoming phone to an agent (TC). Handles both E.164 (+12395550100)
// and 11-digit (12395550100) formats since the DB may store either.
async function findTcByPhone(
  admin: ReturnType<typeof createClient>,
  fromPhone: string,
): Promise<{ id: string } | null> {
  const digits = fromPhone.replace(/\D/g, "");
  const candidates = [
    fromPhone,                             // exact
    "+" + digits,                          // +<digits>
    digits,                                // <digits>
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits, // strip 1
  ];
  const { data } = await admin
    .from("agents")
    .select("id")
    .eq("role", "tc")
    .in("phone", Array.from(new Set(candidates)))
    .limit(1);
  return (data && data[0]) || null;
}

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
