// Edge function: send-agent-introduction
// Trigger: agent_referrals INSERT (refer.html form submit -> Netlify -> webhook -> Supabase row -> trigger)
// Payload: { referral_id: uuid }
//
// Workflow:
//   1. Load the agent_referrals row (referrer + peer details + context)
//   2. Send warm intro email FROM Marlenyi TO peer (CC: referrer for transparency)
//   3. Log to email_log
//   4. Mark agent_referrals.intro_sent_at = now()
//
// Schema note for your dev:
//   CREATE TABLE agent_referrals (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     referrer_first_name TEXT NOT NULL,
//     referrer_last_name TEXT NOT NULL,
//     referrer_email TEXT NOT NULL,
//     referrer_brokerage TEXT,
//     peer_first_name TEXT NOT NULL,
//     peer_last_name TEXT NOT NULL,
//     peer_email TEXT NOT NULL,
//     peer_brokerage TEXT,
//     message TEXT,
//     referral_source TEXT,
//     intro_sent_at TIMESTAMPTZ,
//     peer_engaged_at TIMESTAMPTZ,  -- nullable, set if peer ever submits a file
//     created_at TIMESTAMPTZ DEFAULT now()
//   );

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { AgentIntroduction } from "../_email-templates/AgentIntroduction.tsx";
import { resolveClientEmailRedirect, reviewSubjectPrefix } from "../_shared/client-email-hold.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: { referral_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body.referral_id) return json({ ok: false, error: "missing_referral_id" }, 400);

  const { data: ref, error } = await supabaseAdmin
    .from("agent_referrals")
    .select("*")
    .eq("id", body.referral_id)
    .single();

  if (error || !ref) return json({ ok: false, error: "referral_not_found" }, 404);
  if (ref.intro_sent_at) return json({ ok: false, error: "already_sent" }, 200);

  // Client-email review-hold gate · redirect to Marlenyi if this peer is
  // an agent under beta review.
  const redirect = await resolveClientEmailRedirect({ email: ref.peer_email });
  const emailTo = redirect ? redirect.redirectTo : ref.peer_email;
  const emailSubject = redirect
    ? reviewSubjectPrefix(redirect, `${ref.referrer_first_name} thought you should know about us.`)
    : `${ref.referrer_first_name} thought you should know about us.`;

  const result = await sendEmail({
    to: emailTo,
    toUserId: null, // peer is not yet an auth user
    category: "transactional",
    subject: emailSubject,
    templateName: "agent_introduction",
    reactElement: React.createElement(AgentIntroduction, {
      peerFirstName: ref.peer_first_name,
      referrerFirstName: ref.referrer_first_name,
      referrerLastName: ref.referrer_last_name,
      context: ref.message,
      bookCallUrl: `${SITE_URL}/book.html?src=referral`,
      intakeUrl: `${SITE_URL}/index.html#apply`,
    }),
    payload: { referral_id: ref.id, referrer_email: ref.referrer_email },
  });

  if (result.sent) {
    await supabaseAdmin
      .from("agent_referrals")
      .update({ intro_sent_at: new Date().toISOString() })
      .eq("id", ref.id);
  }

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
