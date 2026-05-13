// Edge function: send-win-back
// Trigger: pg_cron daily at 13:00 UTC (~09:00 ET).
// Scans agents whose last tc_files row is 28-32, 58-62, or 88-92 days old.
// Sends Day30 / Day60 / Day90 template based on bucket.

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { WinBackDay30 } from "../_email-templates/WinBackDay30.tsx";
import { WinBackDay60 } from "../_email-templates/WinBackDay60.tsx";
import { WinBackDay90 } from "../_email-templates/WinBackDay90.tsx";

interface WinBackRow {
  id: string;
  first_name: string | null;
  email: string;
  last_file_at: string;
  unsub_token: string | null;
}

Deno.serve(async (_req) => {
  const sentCounts = { day30: 0, day60: 0, day90: 0 };

  for (const bucket of [30, 60, 90] as const) {
    const lower = isoDaysAgo(bucket + 2);
    const upper = isoDaysAgo(bucket - 2);

    // AARI:WIRE · This query depends on an agent_engagement view that exposes
    // last_file_at per profile. If you store it inline on profiles row, swap accordingly.
    const { data, error } = await supabaseAdmin
      .from("agent_engagement_view")
      .select("id, first_name, email, last_file_at, unsub_token")
      .gte("last_file_at", lower)
      .lt("last_file_at", upper);

    if (error || !data) continue;

    for (const a of data as WinBackRow[]) {
      // Dedupe: skip if already sent this bucket
      const { data: prior } = await supabaseAdmin
        .from("email_log")
        .select("id")
        .eq("to_user_id", a.id)
        .eq("template", `win_back_day${bucket}`)
        .gte("created_at", isoDaysAgo(35))
        .limit(1)
        .maybeSingle();
      if (prior) continue;

      const unsubscribeUrl = `${SITE_URL}/unsubscribe.html?t=${a.unsub_token ?? ""}&type=marketing`;
      let element: React.ReactElement;
      let subject = "";
      let template = "";

      if (bucket === 30) {
        element = React.createElement(WinBackDay30, {
          firstName: a.first_name ?? "there",
          intakeUrl: `${SITE_URL}/index.html#apply`,
          unsubscribeUrl,
        });
        subject = "It's been a minute. How's the next deal looking?";
        template = "win_back_day30";
      } else if (bucket === 60) {
        element = React.createElement(WinBackDay60, {
          firstName: a.first_name ?? "there",
          bookCallUrl: `${SITE_URL}/book.html`,
          unsubscribeUrl,
        });
        subject = "Quick question.";
        template = "win_back_day60";
      } else {
        element = React.createElement(WinBackDay90, {
          firstName: a.first_name ?? "there",
          intakeUrl: `${SITE_URL}/index.html#apply`,
          unsubscribeUrl,
        });
        subject = "Last note from us for a while.";
        template = "win_back_day90";
      }

      const r = await sendEmail({
        to: a.email,
        toUserId: a.id,
        category: "marketing",
        subject,
        templateName: template,
        reactElement: element,
        payload: { bucket, last_file_at: a.last_file_at },
      });

      if (r.sent) {
        if (bucket === 30) sentCounts.day30++;
        else if (bucket === 60) sentCounts.day60++;
        else sentCounts.day90++;
      }
    }
  }

  return json({ ok: true, sent: sentCounts });
});

function isoDaysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
