// Edge function: send-review-request
// Trigger: pg_cron daily at 14:00 UTC. Scans tc_files closed ~24h ago.
// Payload: { run_date: "YYYY-MM-DD" }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { ReviewRequest } from "../_email-templates/ReviewRequest.tsx";

Deno.serve(async (_req) => {
  // Window: files closed between 23h and 25h ago (1-hour buffer for cron jitter)
  const now = new Date();
  const upper = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
  const lower = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();

  const { data: files, error } = await supabaseAdmin
    .from("tc_files")
    .select(`
      id, agent_id, property_address, transaction_type, closed_at, review_token,
      client_email, client_first_name,
      agents:agent_id ( first_name, review_preference )
    `)
    .eq("status", "closed")
    .gte("closed_at", lower)
    .lt("closed_at", upper)
    .is("review_request_sent_at", null);

  if (error) return json({ ok: false, error: error.message }, 500);

  // V3 intake files live in `files` · same closing window, adapted columns.
  const { data: v3files } = await supabaseAdmin
    .from("files")
    .select("id, agent_id, property_address, file_type, closed_at, review_token, client_email, client_name")
    .eq("status", "closed")
    .gte("closed_at", lower)
    .lt("closed_at", upper)
    .is("review_request_sent_at", null);

  const all = [
    ...(files ?? []).map((f) => ({ ...f, _src: "tc_files" })),
    ...(v3files ?? []).map((f) => ({
      ...f,
      _src: "files",
      transaction_type: (f as Record<string, unknown>).file_type,
      client_first_name: String((f as Record<string, unknown>).client_name ?? "").split(" ")[0] || null,
      agents: null, // joined below · files has no FK relationship to agents
    })),
  ];
  if (!all.length) return json({ ok: true, sent: 0, reason: "no_eligible_files" });

  let sent = 0;
  for (const f of all) {
    // deno-lint-ignore no-explicit-any
    let ag: any = f.agents;
    if (!ag) {
      const r = await supabaseAdmin.from("agents").select("first_name, review_preference").eq("id", f.agent_id).maybeSingle();
      ag = r.data;
    }
    if (!ag || ag.review_preference === "never") continue;
    if (!f.client_email) continue;

    const reviewUrl = `${SITE_URL}/client-review.html?t=${f.review_token}`;
    const unsubscribeUrl = `${SITE_URL}/unsubscribe.html?t=${f.review_token}&type=reviews`;

    const r = await sendEmail({
      to: f.client_email,
      toUserId: null, // clients are not auth users
      relatedFileId: f.id,
      category: "review_requests",
      subject: "One favor before we close the file.",
      templateName: "review_request",
      reactElement: React.createElement(ReviewRequest, {
        clientFirstName: f.client_first_name ?? "there",
        agentFirstName: ag.first_name ?? "your agent",
        transactionType: f.transaction_type ?? "transaction",
        propertyAddress: f.property_address,
        reviewUrl,
        unsubscribeUrl,
      }),
      payload: { file_id: f.id },
    });

    if (r.sent) {
      sent += 1;
      await supabaseAdmin.from(f._src === "files" ? "files" : "tc_files").update({ review_request_sent_at: new Date().toISOString() }).eq("id", f.id);
    }
  }

  return json({ ok: true, sent, scanned: all.length });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
