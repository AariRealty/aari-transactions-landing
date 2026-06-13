// Aari Transactions · manage-subscription (June 2026)
// ============================================================================
// Self-serve membership changes from the portal save flow. The CALLER is the
// agent (JWT), so we act ONLY on their own subscription — never anyone else's.
//
// Actions:
//   pause_1 | pause_2 | pause_3 · pause billing for N months (auto-resume)
//   resume                      · clear the pause
//   cancel | pay_per_file       · cancel at period end (keeps access to date)
//   downgrade | upgrade         · swap the subscription's price (tier change)
//
// REQUIRED before this works:
//   • memberships.stripe_subscription_id populated (see 20260613_memberships_stripe_ids.sql)
//   • secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRODUCER
//   • deploy WITH jwt verification (default) so we get the caller identity:
//       supabase functions deploy manage-subscription
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const PRICE_STARTER = Deno.env.get("STRIPE_PRICE_STARTER") || "";
const PRICE_PRODUCER = Deno.env.get("STRIPE_PRICE_PRODUCER") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Minimal Stripe REST helper (form-encoded; no SDK dependency).
async function stripe(path: string, method: string, form?: Record<string, string>): Promise<any> {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + STRIPE_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || ("Stripe " + res.status));
  return data;
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!STRIPE_KEY) return json({ ok: false, error: "stripe_key_not_set" }, 500);

  // ---- 1. Identify the caller from their JWT ----
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "no_auth" }, 401);
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ ok: false, error: "invalid_auth" }, 401);

  // ---- 2. Parse action ----
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body.action || "");
  const VALID = ["pause_1", "pause_2", "pause_3", "resume", "cancel", "pay_per_file", "downgrade", "upgrade"];
  if (!VALID.includes(action)) return json({ ok: false, error: "bad_action" }, 400);

  // ---- 3. Load THIS agent's active membership ----
  const { data: mem } = await supabaseAdmin
    .from("memberships")
    .select("id, tier, status, stripe_subscription_id")
    .eq("agent_id", uid)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subId = mem?.stripe_subscription_id;
  if (!mem || !subId) {
    // No subscription on file → caller falls back to logging a manual request.
    return json({ ok: false, error: "no_subscription_on_file" }, 409);
  }

  try {
    // ---- 4. Perform the Stripe action on the caller's own subscription ----
    if (action.startsWith("pause_")) {
      const months = parseInt(action.split("_")[1], 10) || 1;
      const resumesAt = Math.floor(Date.now() / 1000) + months * 30 * 24 * 3600;
      await stripe("subscriptions/" + subId, "POST", {
        "pause_collection[behavior]": "void",
        "pause_collection[resumes_at]": String(resumesAt),
      });
      await supabaseAdmin.from("memberships").update({ status: "paused" }).eq("id", mem.id);
      return json({ ok: true, action, resumes_at: resumesAt });
    }

    if (action === "resume") {
      await stripe("subscriptions/" + subId, "POST", { "pause_collection": "" });
      await supabaseAdmin.from("memberships").update({ status: "active" }).eq("id", mem.id);
      return json({ ok: true, action });
    }

    if (action === "cancel" || action === "pay_per_file") {
      // Both keep access until period end; pay_per_file simply means "no plan after".
      await stripe("subscriptions/" + subId, "POST", { "cancel_at_period_end": "true" });
      return json({ ok: true, action, note: "cancels_at_period_end" });
    }

    if (action === "downgrade" || action === "upgrade") {
      const targetPrice = action === "upgrade" ? PRICE_PRODUCER : PRICE_STARTER;
      if (!targetPrice) return json({ ok: false, error: "price_id_not_set" }, 500);
      const sub = await stripe("subscriptions/" + subId, "GET");
      const itemId = sub?.items?.data?.[0]?.id;
      if (!itemId) return json({ ok: false, error: "no_subscription_item" }, 500);
      await stripe("subscriptions/" + subId, "POST", {
        "items[0][id]": itemId,
        "items[0][price]": targetPrice,
        "proration_behavior": "none",
      });
      await supabaseAdmin.from("memberships").update({ tier: action === "upgrade" ? "producer" : "starter" }).eq("id", mem.id);
      return json({ ok: true, action });
    }

    return json({ ok: false, error: "unhandled" }, 400);
  } catch (err) {
    console.error("[manage-subscription]", action, (err as Error).message);
    return json({ ok: false, error: "stripe_failed", detail: (err as Error).message }, 502);
  }
});
