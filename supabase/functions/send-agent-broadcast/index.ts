// Edge function: send-agent-broadcast
// Trigger: manual POST from aari-crm.html Templates tab
// Payload: {
//   segment: 'all' | 'active' | 'cooling' | 'top' | 'members' | 'producer' | 'starter',
//   subject: string,
//   headline: string,
//   bodyParagraphs: string[],
//   ctaLabel?: string,
//   ctaUrl?: string,
//   category?: 'transactional' | 'marketing'
// }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { AgentBroadcast } from "../_email-templates/AgentBroadcast.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const segment: string = body.segment ?? "all";
  const category: "transactional" | "marketing" = body.category ?? "marketing";

  if (!body.subject || !body.headline || !Array.isArray(body.bodyParagraphs)) {
    return json({ ok: false, error: "missing_payload" }, 400);
  }

  // Build segment query
  // deno-lint-ignore no-explicit-any
  let q: any = supabaseAdmin.from("agent_engagement_view").select("id, first_name, email, unsub_token");
  if (segment === "active") q = q.eq("engagement_status", "active");
  else if (segment === "cooling") q = q.eq("engagement_status", "cooling");
  else if (segment === "top") q = q.eq("is_top_earner", true);
  else if (segment === "members") q = q.in("member_tier", ["starter", "producer"]);
  else if (segment === "producer") q = q.eq("member_tier", "producer");
  else if (segment === "starter") q = q.eq("member_tier", "starter");

  const { data: agents, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!agents?.length) return json({ ok: true, sent: 0, reason: "empty_segment" });

  let sent = 0;
  for (const a of agents as { id: string; first_name: string | null; email: string; unsub_token: string | null }[]) {
    const unsubscribeUrl = `${SITE_URL}/unsubscribe.html?t=${a.unsub_token ?? ""}&type=marketing`;

    const r = await sendEmail({
      to: a.email,
      toUserId: a.id,
      category,
      subject: body.subject,
      templateName: "agent_broadcast",
      reactElement: React.createElement(AgentBroadcast, {
        firstName: a.first_name ?? "there",
        subjectLine: body.subject,
        headline: body.headline,
        bodyParagraphs: body.bodyParagraphs,
        ctaLabel: body.ctaLabel,
        ctaUrl: body.ctaUrl,
        category,
        unsubscribeUrl,
      }),
      payload: { segment, broadcast_id: body.broadcast_id ?? null },
    });
    if (r.sent) sent++;
  }

  return json({ ok: true, sent, scanned: agents.length, segment });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
