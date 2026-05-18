// ============================================================================
// Aari Transactions · google-oauth-init
// ============================================================================
// Starts the Google OAuth flow for connecting the agent's calendar. Returns
// the authorization URL the agent's browser should redirect to. The flow
// continues at google-oauth-callback after the user grants consent.
//
// Auth: requires Bearer JWT (the calling agent).
// Body: {} (none required)
// Response: { url: string }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const SUPABASE_PROJECT_REF = "fnlrgmuvtgwzjsihqxcn";
const REDIRECT_URI = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/google-oauth-callback`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!GOOGLE_CLIENT_ID) {
    return j(500, { ok: false, error: "GOOGLE_OAUTH_CLIENT_ID not set in Supabase secrets" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return j(401, { ok: false, error: "Missing bearer token" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return j(401, { ok: false, error: "Invalid session" });
  const agentId = userData.user.id;

  // Insert a state row · the callback uses state_id to find which agent is connecting
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: stateRow, error: stateErr } = await admin
    .from("agent_google_oauth_state")
    .insert({ agent_id: agentId })
    .select("state_id")
    .single();
  if (stateErr || !stateRow) {
    return j(500, { ok: false, error: "Failed to create OAuth state: " + (stateErr?.message ?? "unknown") });
  }

  // Build Google OAuth URL
  // Scopes: readonly calendar + openid email for the user's address
  const scope = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "openid",
    "email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    access_type: "offline",  // ensures we get a refresh_token
    prompt: "consent",       // re-prompts consent so we always get a refresh_token
    state: stateRow.state_id,
    include_granted_scopes: "true",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return j(200, { ok: true, url });
});

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
