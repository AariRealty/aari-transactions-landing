// ============================================================================
// Aari Transactions · google-oauth-callback
// ============================================================================
// Google redirects here after the user grants consent. We exchange the
// authorization code for access + refresh tokens, persist them in
// agent_google_calendar keyed on the agent_id (looked up via the state row),
// and redirect the user back to the portal with ?google_connected=1.
//
// Method: GET
// Query: ?code=...&state=...&scope=...
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
const SUPABASE_PROJECT_REF = "fnlrgmuvtgwzjsihqxcn";
const REDIRECT_URI = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/google-oauth-callback`;
const PORTAL_URL = Deno.env.get("AARI_PORTAL_URL") ?? "https://aaritransactions.com/portal.html";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User declined or Google returned an error
  if (error) {
    return redirectToPortal({ google_error: error });
  }
  if (!code || !state) {
    return redirectToPortal({ google_error: "missing_code_or_state" });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return redirectToPortal({ google_error: "missing_oauth_secrets" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Look up agent_id from state, then delete the state row (one-time use)
  const { data: stateRow, error: stateErr } = await admin
    .from("agent_google_oauth_state")
    .select("agent_id, created_at")
    .eq("state_id", state)
    .maybeSingle();
  if (stateErr || !stateRow) {
    return redirectToPortal({ google_error: "invalid_state" });
  }
  // Reject states older than 10 minutes (matches the cleanup window)
  if (new Date(stateRow.created_at).getTime() < Date.now() - 10 * 60 * 1000) {
    await admin.from("agent_google_oauth_state").delete().eq("state_id", state);
    return redirectToPortal({ google_error: "state_expired" });
  }
  // Burn the state immediately so it can't be replayed
  await admin.from("agent_google_oauth_state").delete().eq("state_id", state);

  // Exchange code for tokens
  let tokenResp: Response;
  try {
    tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
  } catch (e) {
    return redirectToPortal({ google_error: "token_exchange_network_error" });
  }

  if (!tokenResp.ok) {
    const errText = await tokenResp.text().catch(() => "");
    console.error("[google-oauth-callback] token exchange failed:", errText);
    return redirectToPortal({ google_error: "token_exchange_failed" });
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  // Decode the id_token to grab the Google account email (no signature
  // verification needed · we just received this directly from Google's HTTPS endpoint)
  let googleEmail: string | null = null;
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      googleEmail = payload.email ?? null;
    } catch (_) { /* ignore */ }
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Upsert into agent_google_calendar
  const { error: upsertErr } = await admin
    .from("agent_google_calendar")
    .upsert({
      agent_id: stateRow.agent_id,
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      scope: tokens.scope ?? null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (upsertErr) {
    console.error("[google-oauth-callback] upsert failed:", upsertErr);
    return redirectToPortal({ google_error: "token_save_failed" });
  }

  return redirectToPortal({ google_connected: "1" });
});

function redirectToPortal(params: Record<string, string>): Response {
  const u = new URL(PORTAL_URL);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return new Response(null, {
    status: 302,
    headers: { Location: u.toString() },
  });
}
