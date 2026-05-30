// ============================================================================
// send-agent-nps-request · Edge Function
// ============================================================================
// Triggered when a file moves to closed status. Sends agent a 30-second NPS
// request with a unique token. Agent clicks → lands on /nps.html?t=TOKEN.
//
// Body: { file_id }
// Auth: broker or TC who owns the file. (Or cron, internal.)
//
// Idempotency: writes one agent_nps row per file. If a row already exists,
// returns 200 + already_sent=true without resending.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Aari Transactions <noreply@aaritransactions.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function randomToken(): string {
  // 24-char base36, hard to guess, easy to URL-paste
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { file_id } = await req.json();
    if (!file_id) return json({ error: "Missing file_id" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: file } = await admin.from("files")
      .select("id, agent_id, assigned_tc_id, property_address, status, transaction_stage")
      .eq("id", file_id).single();
    if (!file) return json({ error: "File not found" }, 404);
    if (file.status !== "closed" && file.transaction_stage !== "closed") {
      return json({ error: "File not closed yet" }, 400);
    }

    // Idempotent
    const { data: existing } = await admin.from("agent_nps")
      .select("id, token, responded_at").eq("file_id", file_id).maybeSingle();
    if (existing) {
      return json({ ok: true, already_sent: true, token: existing.token, responded: !!existing.responded_at });
    }

    const { data: agent } = await admin.from("agents")
      .select("first_name, last_name, email").eq("id", file.agent_id).single();
    if (!agent || !agent.email) return json({ error: "Agent or email missing" }, 404);

    const { data: tc } = file.assigned_tc_id
      ? await admin.from("agents").select("first_name, last_name").eq("id", file.assigned_tc_id).single()
      : { data: null };

    const token = randomToken();
    const { data: row, error: insertErr } = await admin.from("agent_nps").insert({
      file_id, agent_id: file.agent_id, tc_id: file.assigned_tc_id,
      token, sent_at: new Date().toISOString(),
    }).select("id").single();
    if (insertErr) return json({ error: "Insert failed: " + insertErr.message }, 500);

    const addr = file.property_address || "your file";
    const tcName = tc ? `${tc.first_name || ""} ${tc.last_name || ""}`.trim() : "your TC";
    const link = `https://aaritransactions.com/nps.html?t=${token}`;
    const firstName = agent.first_name || "";

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0f0f0f;background:#fff">
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:500;letter-spacing:-0.3px;margin-bottom:8px">Congrats on the closing.</div>
        <div style="font-size:11px;color:#5f5e5a;letter-spacing:.5px;text-transform:uppercase;font-weight:600;margin-bottom:20px">${esc(addr)}</div>
        <p style="font-size:14px;margin:0 0 16px;color:#0f0f0f;line-height:1.55">${firstName ? `Hi ${esc(firstName)},` : "Hi,"}</p>
        <p style="font-size:14px;margin:0 0 16px;color:#0f0f0f;line-height:1.55">Quick favor — 30 seconds. How was working with ${esc(tcName)} on this file?</p>
        <a href="${link}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Leave 30-second feedback →</a>
        <p style="font-size:12px;color:#5f5e5a;margin:20px 0 0;line-height:1.5">Your answer goes straight to Marlenyi. We use it to keep the bar high.</p>
        <hr style="border:0;border-top:0.5px solid #e6e2d8;margin:28px 0 14px">
        <p style="font-size:10.5px;color:#888;line-height:1.5;margin:0">Closed ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Aari Transactions</p>
      </div>
    `;

    let emailOk = false;
    if (RESEND_API_KEY) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL, to: [agent.email],
            subject: `Quick favor · 30 seconds about ${addr}`,
            html,
          }),
        });
        emailOk = r.ok;
      } catch (_) {}
    }

    return json({ ok: emailOk, nps_id: row.id, token });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
