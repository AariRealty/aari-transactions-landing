// Aari Transactions · backfill-membership-stripe-ids (June 2026)
// ============================================================================
// ONE-TIME admin job. Walks active Stripe subscriptions, matches each by the
// customer's email to an agent, and writes stripe_subscription_id +
// stripe_customer_id onto that agent's membership — so existing members can use
// self-serve management (pause/cancel/downgrade) without re-checking-out.
//
// Safe to run repeatedly (idempotent · it just overwrites the same ids).
//
// Auth (either works):
//   • broker JWT (Authorization: Bearer <broker access token>), or
//   • the service-role key (Authorization: Bearer <SERVICE_ROLE_KEY>) — for a
//     quick one-off curl.
//
// Run it once:
//   curl -X POST "https://<project>.supabase.co/functions/v1/backfill-membership-stripe-ids" \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// Requires secret: STRIPE_SECRET_KEY.  Deploy: supabase functions deploy backfill-membership-stripe-ids
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(p: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!STRIPE_KEY) return json({ ok: false, error: "stripe_key_not_set" }, 500);

  // ---- Auth · service key OR broker JWT ----
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "no_auth" }, 401);
  let authorized = SERVICE_KEY && token === SERVICE_KEY;
  if (!authorized) {
    const { data: u } = await supabaseAdmin.auth.getUser(token);
    const uid = u?.user?.id;
    if (uid) {
      const { data: ag } = await supabaseAdmin.from("agents").select("role").eq("id", uid).maybeSingle();
      authorized = ag?.role === "broker";
    }
  }
  if (!authorized) return json({ ok: false, error: "not_authorized" }, 403);

  // ---- Walk active subscriptions, newest first, expanding the customer for email ----
  let matched = 0, scanned = 0;
  const unmatched: string[] = [];
  let startingAfter = "";
  try {
    for (let page = 0; page < 50; page++) { // hard cap · 50 pages * 100 = 5000 subs
      const qs = new URLSearchParams({ status: "all", limit: "100", "expand[]": "data.customer" });
      if (startingAfter) qs.set("starting_after", startingAfter);
      const res = await fetch("https://api.stripe.com/v1/subscriptions?" + qs.toString(), {
        headers: { Authorization: "Bearer " + STRIPE_KEY },
      });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: "stripe_failed", detail: data?.error?.message }, 502);
      const subs: any[] = data.data || [];
      for (const sub of subs) {
        if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
        scanned++;
        const cust = sub.customer && typeof sub.customer === "object" ? sub.customer : null;
        const email = cust && !cust.deleted ? (cust.email as string | null) : null;
        if (!email) { continue; }
        const ag = await supabaseAdmin.from("agents").select("id").ilike("email", email).maybeSingle();
        const agentId = ag.data?.id;
        if (!agentId) { unmatched.push(email); continue; }
        const upd = await supabaseAdmin.from("memberships")
          .update({ stripe_subscription_id: sub.id, stripe_customer_id: cust.id })
          .eq("agent_id", agentId)
          .in("status", ["active", "paused"]);
        if (!upd.error) matched++;
      }
      if (!data.has_more || !subs.length) break;
      startingAfter = subs[subs.length - 1].id;
    }
  } catch (err) {
    return json({ ok: false, error: "exception", detail: (err as Error).message }, 500);
  }

  return json({ ok: true, scanned, matched, unmatched });
});
