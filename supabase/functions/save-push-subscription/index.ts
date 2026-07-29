// ============================================================================
// Aari Transactions · save-push-subscription
// ============================================================================
// Called by the client after the browser subscribes to Web Push. Persists the
// subscription so send-web-push can later fan out lock-screen alerts.
//
// Body: { subscription: { endpoint, keys: { p256dh, auth } }, ua?: string }
// Auth: requires a signed-in Supabase user (Authorization: Bearer <access_token>)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ---- 1. Auth: identify the caller ---------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return j(401, { ok: false, error: "unauthenticated" });
  }
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return j(401, { ok: false, error: "unauthenticated" });
  }
  const userId = userRes.user.id;

  // ---- 2. Parse the subscription payload -----------------------------------
  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; ua?: string };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "invalid_json" }); }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return j(400, { ok: false, error: "invalid_subscription" });
  }

  // ---- 3. Upsert -----------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: upErr } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: body.ua ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (upErr) return j(500, { ok: false, error: "upsert_failed: " + upErr.message });

  return j(200, { ok: true });
});

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
