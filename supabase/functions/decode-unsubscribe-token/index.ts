// Edge function: decode-unsubscribe-token
// Trigger: POST from unsubscribe.html on page load
// Payload: { token: string }
// Returns: { user_id, email, prefs: { marketing, review_requests, transactional } }
//
// Token format (one option): signed JWT or a UUID stored in profiles.unsub_token
// Simplest path: each profile row has an unsub_token column (UUID), and we look it up.

import { supabaseAdmin } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.token) return json({ error: "missing_token" }, 400);

  // Look up profile by unsub_token (UUID column on profiles table)
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, unsub_token")
    .eq("unsub_token", body.token)
    .single();

  if (error || !profile) return json({ error: "invalid_token" }, 404);

  // Load current preferences (auto-created on user signup via trigger)
  const { data: prefs } = await supabaseAdmin
    .from("email_preferences")
    .select("transactional, marketing, review_requests, unsubscribed_at")
    .eq("user_id", profile.id)
    .maybeSingle();

  return json({
    user_id: profile.id,
    email: profile.email,
    prefs: prefs ?? { transactional: true, marketing: true, review_requests: true },
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
