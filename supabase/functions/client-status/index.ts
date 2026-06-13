// Aari Transactions · client-status (June 2026)
// ============================================================================
// PUBLIC, no-JWT. Powers the read-only client status page (status.html). Takes
// a share token and returns ONLY whitelisted milestone data — never other
// parties, price, TC, internal notes, or compliance detail. The token is the
// only credential; expired or revoked tokens return nothing.
//
// Deploy: supabase functions deploy client-status --no-verify-jwt
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(p: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Sale-file stage order (client-relevant). Pre-contract stages collapse to "getting set up".
const ORDER = ["new", "waiting_for_tc", "under_contract", "inspection", "appraisal", "ctc", "closed"];
const MILES = [
  { label: "Under contract", stage: "under_contract" },
  { label: "Inspection", stage: "inspection" },
  { label: "Appraisal", stage: "appraisal" },
  { label: "Clear to close", stage: "ctc" },
  { label: "Closing", stage: "closed" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // token from query (?token=) or JSON body
  let token = new URL(req.url).searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    try { token = (await req.json())?.token || ""; } catch { /* ignore */ }
  }
  if (!token) return json({ ok: false, error: "no_token" }, 400);

  // 1. Resolve the share link
  const { data: link } = await admin
    .from("file_share_links")
    .select("file_id, expires_at, revoked")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.revoked) return json({ ok: false, error: "not_found" }, 404);
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "expired", expired: true }, 410);
  }

  // 2. Load the file (whitelisted columns only)
  const { data: file } = await admin
    .from("files")
    .select("id, property_address, transaction_stage, closing_date, effective_date, agent_id")
    .eq("id", link.file_id)
    .maybeSingle();
  if (!file) return json({ ok: false, error: "not_found" }, 404);

  // 3. Agent contact (the client's own agent)
  let agent = { name: "Your agent", phone: "" };
  if (file.agent_id) {
    const { data: ag } = await admin
      .from("agents")
      .select("first_name, last_name, phone")
      .eq("id", file.agent_id)
      .maybeSingle();
    if (ag) agent = { name: ((ag.first_name || "") + " " + (ag.last_name || "")).trim() || "Your agent", phone: ag.phone || "" };
  }

  // 4. Deadlines · for "next date" + on-track (open = no completed_at)
  let nextDate: string | null = null;
  let onTrack = true;
  try {
    const { data: dls } = await admin
      .from("file_deadlines")
      .select("due_date, completed_at")
      .eq("file_id", file.id);
    const now = Date.now();
    const open = (dls || []).filter((d) => !d.completed_at && d.due_date);
    open.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    if (open.length) {
      nextDate = open[0].due_date;
      if (open.some((d) => new Date(d.due_date).getTime() < now)) onTrack = false;
    }
  } catch { /* deadlines optional */ }

  // 5. Build milestones from stage
  const stage = (file.transaction_stage || "new").toLowerCase();
  const curIdx = ORDER.indexOf(stage) >= 0 ? ORDER.indexOf(stage) : 0;
  let setNow = false;
  const milestones = MILES.map((m) => {
    const tIdx = ORDER.indexOf(m.stage);
    let state: string;
    if (curIdx > tIdx) state = "done";
    else if (curIdx === tIdx) { state = "now"; setNow = true; }
    else state = "future";
    const date = m.stage === "under_contract" ? file.effective_date : (m.stage === "closed" ? file.closing_date : null);
    return { label: m.label, state, date: date || null };
  });
  if (!setNow) { const f = milestones.find((x) => x.state === "future"); if (f) f.state = "now"; }

  const curMile = milestones.find((x) => x.state === "now") || milestones[0];

  return json({
    ok: true,
    property_address: file.property_address || "Your transaction",
    agent,
    stage: curMile.label,
    milestones,
    next: nextDate ? { date: nextDate } : null,
    closing_date: file.closing_date || null,
    on_track: onTrack,
  });
});
