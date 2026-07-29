// ============================================================================
// Aari Transactions · send-web-push
// ============================================================================
// Fans out Web Push notifications to every registered browser subscription
// belonging to a given user. Called by send-broker-website-lead (and any other
// caller that wants a lock-screen alert).
//
// Body: { user_id?: uuid, user_email?: string, title: string, body: string, url?: string, tag?: string }
//   - Exactly one of user_id / user_email required.
//   - title / body: what shows on the lock screen.
//   - url: where clicking the notification lands.
//   - tag: optional dedupe key; same tag replaces the previous unread push.
//
// Requires the following Supabase edge function secrets:
//   VAPID_PUBLIC_KEY   — base64url (matches the key hard-coded in the client)
//   VAPID_PRIVATE_KEY  — base64url; NEVER commit
//   VAPID_SUBJECT      — mailto:marlenyi@aaritransactions.com
//
// One-time setup Marlenyi runs locally:
//   npx web-push generate-vapid-keys
//   → paste PUBLIC into files.html (already there for the current key)
//   → paste both into Supabase secrets:
//     supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:marlenyi@aaritransactions.com
//
// Dead subscriptions (410 Gone from the push service) are auto-pruned.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:marlenyi@aaritransactions.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return j(200, { ok: false, skipped: true, reason: "vapid_keys_missing" });
  }

  let body: {
    user_id?: string;
    user_email?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "invalid_json" }); }

  if (!body.title || !body.body) return j(400, { ok: false, error: "title_and_body_required" });
  if (!body.user_id && !body.user_email) return j(400, { ok: false, error: "user_id_or_email_required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- Resolve target user_id ----------------------------------------------
  let userId = body.user_id ?? null;
  if (!userId && body.user_email) {
    const { data: agent } = await admin
      .from("agents")
      .select("id")
      .eq("email", body.user_email)
      .maybeSingle();
    userId = agent?.id ?? null;
  }
  if (!userId) return j(404, { ok: false, error: "user_not_found" });

  // ---- Pull all live subscriptions -----------------------------------------
  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (subsErr) return j(500, { ok: false, error: "subs_lookup_failed: " + subsErr.message });
  if (!subs || subs.length === 0) return j(200, { ok: true, sent: 0, skipped: true, reason: "no_subscriptions" });

  // ---- Fan out --------------------------------------------------------------
  const payload = JSON.stringify({
    title: body.title,
    body: body.body,
    url: body.url ?? "/broker-cockpit.html",
    tag: body.tag ?? "aari-alert",
  });

  const deadEndpoints: string[] = [];
  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      return { id: s.id, ok: true };
      // deno-lint-ignore no-explicit-any
    } catch (e: any) {
      const status = e?.statusCode ?? 0;
      // 404 / 410 mean the browser dropped the subscription — prune it.
      if (status === 404 || status === 410) deadEndpoints.push(s.endpoint);
      console.error("[send-web-push] send failed", s.id, status, e?.body ?? e?.message);
      return { id: s.id, ok: false, status };
    }
  }));

  if (deadEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }

  const sent = results.filter((r) => r.ok).length;
  return j(200, { ok: sent > 0, sent, attempted: subs.length, pruned: deadEndpoints.length });
});

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
