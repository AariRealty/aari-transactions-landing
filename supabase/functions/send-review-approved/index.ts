// Edge function: send-review-approved
// Trigger: client_reviews UPDATE status -> 'approved'
// Payload: { review_id: uuid, agent_id: uuid }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { ReviewApprovedAgent } from "../_email-templates/ReviewApprovedAgent.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: { review_id?: string; agent_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body.review_id) return json({ ok: false, error: "missing_payload" }, 400);

  const { data: review } = await supabaseAdmin
    .from("client_reviews")
    .select("id, agent_id, attribution_display, rating, body")
    .eq("id", body.review_id)
    .single();
  if (!review) return json({ ok: false, error: "review_not_found" }, 404);

  const { data: agent } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, email")
    .eq("id", review.agent_id)
    .single();
  if (!agent) return json({ ok: false, error: "agent_not_found" }, 404);

  const result = await sendEmail({
    to: agent.email,
    toUserId: agent.id,
    category: "transactional",
    subject: "A client review just went live.",
    templateName: "review_approved_agent",
    reactElement: React.createElement(ReviewApprovedAgent, {
      firstName: agent.first_name ?? "there",
      clientAttribution: review.attribution_display ?? "Florida Client",
      reviewBody: review.body,
      stars: review.rating,
      reviewsUrl: `${SITE_URL}/reviews.html`,
    }),
    payload: { review_id: review.id },
  });

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
