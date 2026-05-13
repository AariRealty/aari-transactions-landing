// Edge function: update-email-preferences
// Trigger: POST from unsubscribe.html on save
// Payload: { token: string, marketing: boolean, review_requests: boolean }
// Updates email_preferences row for the user identified by the token.

import { supabaseAdmin } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let body: { token?: string; marketing?: boolean; review_requests?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.token) return json({ error: "missing_token" }, 400);

  // Resolve token to user
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("unsub_token", body.token)
    .single();
  if (pErr || !profile) return json({ error: "invalid_token" }, 404);

  // Coerce booleans (default to current values if undefined)
  const marketing = body.marketing === false ? false : true;
  const review_requests = body.review_requests === false ? false : true;
  const fullyUnsubscribed = marketing === false && review_requests === false;

  const { error: uErr } = await supabaseAdmin
    .from("email_preferences")
    .upsert({
      user_id: profile.id,
      marketing,
      review_requests,
      unsubscribed_at: fullyUnsubscribed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (uErr) return json({ error: uErr.message }, 500);

  // Audit log entry
  await supabaseAdmin.from("email_log").insert({
    email_type: "preference_change",
    to_address: "n/a",
    to_user_id: profile.id,
    status: "delivered",
    subject: "Email preferences updated via unsubscribe.html",
    template: "preference_change",
    payload: { marketing, review_requests, source: "unsubscribe_page" },
    sent_at: new Date().toISOString(),
  });

  return json({ ok: true });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
