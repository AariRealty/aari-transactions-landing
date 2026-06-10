// Edge function: send-welcome-home (Email System v2 · Step 15)
// ============================================================================
// Day-14 buyer welcome-home email. Fires once per sale file, 14 days after the
// file's status flips to closed. Mirrors the send-review-request pattern:
// daily pg_cron, idempotent stamp, opt-out honored via the shared sendEmail.
//
// WINDOW: base date = actual_closing_date (TC-logged source of truth) ?? closed_at
// (fallback) — consistent with send-agent-review and the Section 12 ruling. Fires
// when the base is 14–21 days ago, gated by welcome_home_sent_at
// IS NULL. The wide lower bound is a catch-up safety net — if a daily run is
// missed, the file still gets its welcome within the week instead of never. The
// stamp guarantees exactly one send per file regardless of how many runs scan it.
//
// SCOPE: sale files only (a buyer welcome-home makes no sense on a listing).
//
// AGENT REVIEW LINK: pulls agents.google_review_link if that column exists. If
// it does not exist yet (or is empty), the email sends WITHOUT the review CTA —
// no broken button. The moment per-agent Google links are added, the CTA lights
// up automatically with zero code change here.
//
// Trigger: pg_cron daily (see 20260624_welcome_home.sql). Invoke with
// {"force_file_id": "<uuid>"} to send a single file immediately for testing.
// ============================================================================

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { WelcomeHome } from "../_email-templates/WelcomeHome.tsx";

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  let forceFileId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      forceFileId = body?.force_file_id ?? null;
    }
  } catch (_) { /* no body */ }

  // ---- Pull candidate sale files ----
  let query = supabaseAdmin
    .from("files")
    .select("id, agent_id, property_address, file_type, status, closed_at, actual_closing_date, review_token, client_email, client_name")
    .eq("status", "closed")
    .is("welcome_home_sent_at", null);

  if (forceFileId) {
    query = supabaseAdmin
      .from("files")
      .select("id, agent_id, property_address, file_type, status, closed_at, actual_closing_date, review_token, client_email, client_name")
      .eq("id", forceFileId);
  } else {
    const now = Date.now();
    // Base date = actual_closing_date (TC-logged source of truth) else closed_at
    // (fallback). Pull a generous closed_at floor to bound the set, then apply the
    // precise 14–21 day window against the base in code below — actual_closing_date
    // can differ from the move timestamp. Mirrors send-agent-review.
    const floor = new Date(now - 35 * DAY).toISOString();
    query = query.gte("closed_at", floor);
  }

  const { data: files, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!files || !files.length) return json({ ok: true, sent: 0, reason: "no_eligible_files" });

  let sent = 0;
  const skipped: Record<string, number> = {};
  const bump = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; };

  for (const f of files) {
    // Sale files only — a listing seller does not get a buyer welcome-home.
    const ft = String(f.file_type ?? "sale").toLowerCase();
    if (ft === "listing" || ft === "referral") { bump("not_a_sale"); continue; }
    if (!f.client_email) { bump("no_client_email"); continue; }

    // Day-14 window against the base date (actual_closing_date ?? closed_at).
    // Skipped when forcing a single file for testing.
    if (!forceFileId) {
      const baseStr = (f.actual_closing_date as string | null) ?? (f.closed_at as string | null);
      if (!baseStr) { bump("no_base_date"); continue; }
      const baseMs = new Date(String(baseStr).length === 10 ? `${baseStr}T12:00:00-05:00` : String(baseStr)).getTime();
      const ageDays = (Date.now() - baseMs) / DAY;
      if (ageDays < 14 || ageDays > 21) { bump("outside_window"); continue; }
    }

    // ---- Agent first name + (optional) Google review link ----
    let agentFirstName = "your agent";
    let reviewUrl: string | null = null;
    if (f.agent_id) {
      // Try the link column first; fall back if the column does not exist yet.
      let ag: Record<string, unknown> | null = null;
      const withLink = await supabaseAdmin
        .from("agents").select("first_name, google_review_link").eq("id", f.agent_id).maybeSingle();
      if (withLink.error) {
        const basic = await supabaseAdmin
          .from("agents").select("first_name").eq("id", f.agent_id).maybeSingle();
        ag = basic.data ?? null;
      } else {
        ag = withLink.data ?? null;
        const link = String(ag?.google_review_link ?? "").trim();
        if (link) reviewUrl = link;
      }
      if (ag?.first_name) agentFirstName = String(ag.first_name);
    }

    const buyerFirstName = String(f.client_name ?? "").split(" ")[0] || "there";
    const unsubscribeUrl = `${SITE_URL}/unsubscribe.html?t=${f.review_token}&type=reviews`;

    const r = await sendEmail({
      to: f.client_email,
      toUserId: null, // clients are not auth users
      relatedFileId: f.id,
      category: "review_requests",
      subject: "Welcome home.",
      templateName: "welcome_home",
      reactElement: React.createElement(WelcomeHome, {
        buyerFirstName,
        agentFirstName,
        reviewUrl,
        unsubscribeUrl,
      }),
      payload: { file_id: f.id },
    });

    if (r.sent) {
      sent += 1;
      await supabaseAdmin.from("files")
        .update({ welcome_home_sent_at: new Date().toISOString() })
        .eq("id", f.id);
    } else {
      bump("send_failed");
    }
  }

  return json({ ok: true, sent, scanned: files.length, skipped });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
