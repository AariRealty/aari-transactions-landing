// ============================================================================
// send-agent-weekly-digest · Edge Function
// ============================================================================
// Sends each active agent a Sunday-evening email summarizing what their TC is
// watching for them this week. Pulls top 3 upcoming deadlines + recent risks
// caught + TC SLA stats. CTA back to /portal.html.
//
// Trigger: pg_cron Sundays at 18:00 America/New_York (set up manually in Supabase).
//
// Body (optional): { agent_id? }  · if provided, sends only to that agent (for
// testing). Otherwise blasts to every opt-in agent.
//
// Idempotency: writes to agent_weekly_digest_log keyed by (agent_id, week_start).
// Re-running on the same week is a no-op.
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function weekStartUTC(now = new Date()): string {
  // Sunday of the current week, UTC date string YYYY-MM-DD
  const d = new Date(now);
  d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

interface DigestData {
  upcoming: Array<{ address: string; label: string; due: string; daysOut: number; file_id: string }>;
  risksCaught: number;
  avgReplyMin: number | null;
  onTimePct: number | null;
  activeFiles: number;
}

async function buildDigest(admin: any, agentId: string): Promise<DigestData> {
  const { data: files } = await admin.from("files").select("id, property_address, status, transaction_stage, closing_date").eq("agent_id", agentId);
  const active = (files || []).filter((f: any) => f.status !== "closed" && f.status !== "archived" && f.transaction_stage !== "closed");
  const fileIds = active.map((f: any) => f.id);
  if (!fileIds.length) {
    return { upcoming: [], risksCaught: 0, avgReplyMin: null, onTimePct: null, activeFiles: 0 };
  }

  const nowMs = Date.now();
  const weekFromNow = nowMs + 7 * 86400000;
  const fileById: Record<string, any> = {};
  active.forEach((f: any) => { fileById[f.id] = f; });

  const [vRes, dRes, mRes] = await Promise.all([
    admin.from("file_verifications").select("file_id, status, confirmed_at").in("file_id", fileIds),
    admin.from("file_deadlines").select("file_id, deadline_key, due_date, completed_at").in("file_id", fileIds),
    admin.from("file_messages").select("sent_at, replied_at").eq("sender_role","agent").not("replied_at","is",null).in("file_id", fileIds).gte("sent_at", new Date(nowMs - 30*86400000).toISOString()),
  ]);

  const upcoming = (dRes.data || [])
    .filter((d: any) => !d.completed_at && d.due_date)
    .map((d: any) => {
      const ms = new Date(d.due_date + "T17:00:00").getTime() - nowMs;
      return {
        address: fileById[d.file_id]?.property_address || "a file",
        label: String(d.deadline_key || "Deadline").replace(/_/g, " "),
        due: d.due_date,
        daysOut: Math.round(ms / 86400000),
        file_id: d.file_id,
      };
    })
    .filter((d: any) => d.daysOut >= -1 && d.daysOut <= 7)
    .sort((a: any, b: any) => a.daysOut - b.daysOut)
    .slice(0, 3);

  const yStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const risksCaught = (vRes.data || []).filter((v: any) => v.status === "confirmed" && (!v.confirmed_at || new Date(v.confirmed_at).getTime() >= yStart)).length;

  const msgs = mRes.data || [];
  const mins = msgs.map((m: any) => (new Date(m.replied_at).getTime() - new Date(m.sent_at).getTime()) / 60000).filter((n: number) => n >= 0);
  const avgReplyMin = mins.length ? Math.round(mins.reduce((a: number, b: number) => a + b, 0) / mins.length) : null;
  const onTimePct = mins.length ? Math.round((mins.filter((n: number) => n <= 240).length / mins.length) * 100) : null;

  return { upcoming, risksCaught, avgReplyMin, onTimePct, activeFiles: active.length };
}

function renderEmail(firstName: string, data: DigestData): string {
  const greet = firstName ? `Hi ${esc(firstName)},` : "Hi,";
  let upcomingBlock = "";
  if (data.upcoming.length === 0) {
    upcomingBlock = `<p style="margin:0 0 12px;font-size:14px;color:#0f0f0f;line-height:1.5">You’re clear this week — no deadlines tracked in the next 7 days.</p>`;
  } else {
    upcomingBlock = `<p style="margin:0 0 8px;font-size:14px;color:#0f0f0f">Your TC is watching <strong>${data.upcoming.length}</strong> deadline${data.upcoming.length === 1 ? "" : "s"} for you this week:</p>` +
      `<ol style="padding-left:20px;margin:0 0 16px;font-size:13px;color:#0f0f0f;line-height:1.6">` +
      data.upcoming.map((d) => {
        const when = d.daysOut < 0 ? `<strong style="color:#c44b3b">${Math.abs(d.daysOut)}d overdue</strong>`
          : d.daysOut === 0 ? `<strong style="color:#c44b3b">due today</strong>`
          : d.daysOut === 1 ? `<strong>due tomorrow</strong>`
          : `due in ${d.daysOut} days`;
        return `<li><strong>${esc(d.label)}</strong> on ${esc(d.address)} · ${when}</li>`;
      }).join("") + `</ol>`;
  }
  const slaBlock = (data.avgReplyMin != null || data.risksCaught > 0) ? `
    <div style="display:flex;gap:14px;padding:14px 18px;background:#fafaf9;border-radius:6px;margin:18px 0">
      ${data.risksCaught > 0 ? `<div style="flex:1"><div style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#0f0f0f">${data.risksCaught}</div><div style="font-size:10.5px;color:#5f5e5a;text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-top:4px;line-height:1.3">Compliance checks completed YTD</div></div>` : ""}
      ${data.avgReplyMin != null ? `<div style="flex:1"><div style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#0f0f0f">${data.avgReplyMin < 60 ? data.avgReplyMin + "m" : (data.avgReplyMin/60).toFixed(1) + "h"}</div><div style="font-size:10.5px;color:#5f5e5a;text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-top:4px;line-height:1.3">Avg TC reply time · 30d</div></div>` : ""}
      ${data.onTimePct != null ? `<div style="flex:1"><div style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#0f0f0f">${data.onTimePct}%</div><div style="font-size:10.5px;color:#5f5e5a;text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-top:4px;line-height:1.3">On-time replies · 30d</div></div>` : ""}
    </div>` : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:28px;color:#0f0f0f;background:#fff">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:500;letter-spacing:-0.3px;margin-bottom:8px">Your week with Aari</div>
      <div style="font-size:11px;color:#5f5e5a;letter-spacing:.5px;text-transform:uppercase;font-weight:600;margin-bottom:20px">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
      <p style="font-size:14px;margin:0 0 14px;color:#0f0f0f;line-height:1.5">${greet}</p>
      ${upcomingBlock}
      ${slaBlock}
      <a href="https://aaritransactions.com/portal.html" style="display:inline-block;background:#0f0f0f;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;margin-top:6px">Open my portal →</a>
      <hr style="border:0;border-top:0.5px solid #e6e2d8;margin:28px 0 14px">
      <p style="font-size:10.5px;color:#888;line-height:1.5;margin:0">You're getting this because you have ${data.activeFiles} active file${data.activeFiles === 1 ? "" : "s"} with Aari Transactions. <a href="https://aaritransactions.com/portal.html#settings" style="color:#888">Manage email preferences</a>.</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    let targetAgentId: string | null = null;
    if (req.method === "POST") {
      try { const body = await req.json(); targetAgentId = body?.agent_id || null; } catch {}
    }

    const weekStart = weekStartUTC();
    let agentsQuery = admin.from("agents")
      .select("id, first_name, last_name, email, weekly_digest_opt_in, role")
      .eq("role", "agent")
      .eq("weekly_digest_opt_in", true)
      .not("email", "is", null);
    if (targetAgentId) agentsQuery = agentsQuery.eq("id", targetAgentId);
    const { data: agents } = await agentsQuery;
    if (!agents || !agents.length) return json({ ok: true, sent: 0, message: "No eligible agents." });

    let sent = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const agent of agents) {
      // Idempotent: skip if we already sent this week
      const { data: existing } = await admin.from("agent_weekly_digest_log")
        .select("id").eq("agent_id", agent.id).eq("digest_week_start", weekStart).maybeSingle();
      if (existing) { skipped++; continue; }

      const data = await buildDigest(admin, agent.id);
      // Skip agents with zero active files — they don't need a digest
      if (data.activeFiles === 0) { skipped++; continue; }

      const html = renderEmail(agent.first_name || "", data);
      const subject = data.upcoming.length > 0
        ? `Your Aari week · ${data.upcoming.length} deadline${data.upcoming.length === 1 ? "" : "s"} tracked`
        : `Your Aari week · ${data.activeFiles} active file${data.activeFiles === 1 ? "" : "s"}`;

      let emailOk = false;
      if (RESEND_API_KEY && agent.email) {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: FROM_EMAIL, to: [agent.email], subject, html }),
          });
          emailOk = r.ok;
          if (!r.ok) errors.push(`${agent.email}: ${(await r.text()).slice(0, 200)}`);
        } catch (e) { errors.push(`${agent.email}: ${String(e).slice(0, 200)}`); }
      }

      await admin.from("agent_weekly_digest_log").insert({
        agent_id: agent.id,
        digest_week_start: weekStart,
        email_sent: emailOk,
      });

      if (emailOk) sent++; else failed++;
    }

    return json({ ok: true, sent, skipped, failed, errors: errors.slice(0, 5), weekStart });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
