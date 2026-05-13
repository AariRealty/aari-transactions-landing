// Edge function: send-membership-event
// Trigger: memberships UPDATE on tier/status changes + cron pause_resume_reminder
// Payload (event): { user_id: uuid, event_type: 'upgrade_producer'|'paused'|'cancelled', membership_id: uuid }
// Payload (cron):  { event_type: 'pause_resume_reminder', run_date: 'YYYY-MM-DD' }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { MembershipUpgrade } from "../_email-templates/MembershipUpgrade.tsx";
import { MembershipPaused } from "../_email-templates/MembershipPaused.tsx";
import { MembershipCancelled } from "../_email-templates/MembershipCancelled.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  // ---- Cron-mode: pause-resume reminder sweep ----
  if (body.event_type === "pause_resume_reminder") {
    return await runPauseResumeReminder();
  }

  // ---- Event-mode: single user, single membership event ----
  if (!body.user_id || !body.event_type) {
    return json({ ok: false, error: "missing_payload" }, 400);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, email")
    .eq("id", body.user_id)
    .single();
  if (!profile) return json({ ok: false, error: "profile_not_found" }, 404);

  const { data: mem } = await supabaseAdmin
    .from("memberships")
    .select("id, tier, status, next_renewal_at, pause_until, period_end_at")
    .eq("user_id", body.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  switch (body.event_type) {
    case "upgrade_producer": {
      const result = await sendEmail({
        to: profile.email,
        toUserId: profile.id,
        category: "transactional",
        subject: "You're a Producer.",
        templateName: "membership_upgrade",
        reactElement: React.createElement(MembershipUpgrade, {
          firstName: profile.first_name ?? "there",
          nextBillingDate: fmtDate(mem?.next_renewal_at),
          portalUrl: `${SITE_URL}/portal.html`,
        }),
        payload: body,
      });
      return json({ ok: result.sent, ...result });
    }
    case "paused": {
      const result = await sendEmail({
        to: profile.email,
        toUserId: profile.id,
        category: "transactional",
        subject: "Your membership is paused.",
        templateName: "membership_paused",
        reactElement: React.createElement(MembershipPaused, {
          firstName: profile.first_name ?? "there",
          resumeDate: fmtDate(mem?.pause_until),
          portalUrl: `${SITE_URL}/portal.html`,
          isReminder: false,
        }),
        payload: body,
      });
      return json({ ok: result.sent, ...result });
    }
    case "cancelled": {
      const result = await sendEmail({
        to: profile.email,
        toUserId: profile.id,
        category: "transactional",
        subject: "Your membership is cancelled.",
        templateName: "membership_cancelled",
        reactElement: React.createElement(MembershipCancelled, {
          firstName: profile.first_name ?? "there",
          finalAccessDate: fmtDate(mem?.period_end_at),
          rejoinUrl: `${SITE_URL}/index.html#memberships`,
        }),
        payload: body,
      });
      return json({ ok: result.sent, ...result });
    }
    default:
      return json({ ok: false, error: "unknown_event_type" }, 400);
  }
});

async function runPauseResumeReminder() {
  // Scan memberships paused with pause_until in 1.5–2.5 days (catch one window per day)
  const now = Date.now();
  const lower = new Date(now + 1.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(now + 2.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabaseAdmin
    .from("memberships")
    .select("id, user_id, pause_until, profiles:user_id(id, first_name, email)")
    .eq("status", "paused")
    .gte("pause_until", lower)
    .lt("pause_until", upper);

  let sent = 0;
  for (const m of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const p: any = m.profiles;
    if (!p) continue;
    const r = await sendEmail({
      to: p.email,
      toUserId: p.id,
      category: "transactional",
      subject: "Your membership resumes in 2 days.",
      templateName: "membership_pause_reminder",
      reactElement: React.createElement(MembershipPaused, {
        firstName: p.first_name ?? "there",
        resumeDate: fmtDate(m.pause_until),
        portalUrl: `${SITE_URL}/portal.html`,
        isReminder: true,
      }),
      payload: { membership_id: m.id },
    });
    if (r.sent) sent++;
  }
  return json({ ok: true, sent, scanned: rows?.length ?? 0 });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "soon";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
