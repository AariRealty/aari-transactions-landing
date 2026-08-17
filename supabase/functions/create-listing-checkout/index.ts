// ============================================================================
// Aari Transactions · create-listing-checkout v2 (2026-08-17)
// ============================================================================
// v2: Accepts an authenticated agent's Bearer token + optional `use_credit`
// flag. When both are present, the service is credit-eligible, and the member
// has ≥1 credit remaining, we:
//   1. Atomically increment memberships.credits_used (WHERE credits_used=<old>
//      so parallel spends can't double-dip).
//   2. Mint the Stripe Checkout Session with a 100%-off coupon
//      (`aari_membership_credit`), created lazily like the first-time coupon.
//   3. Metadata carries credit_used=1 so the webhook can label the payment.
//
// Credit-eligible services (per Marlenyi 2026-08-17): mls_setup, mls_setup_only,
// listing_docs. NOT listing_coordinator (it already bundles all three services,
// so a single credit covering it would violate the 1-credit=1-order model).
//
// v1 pricing model (unchanged):
//   listing_coordinator · $199 base (1 MLS included) + $59 per extra MLS
//   mls_setup_only      · $99 per MLS (flat, any count)
//   listing_docs        · $99 flat, no MLS input
//
// First-time client: $10-off coupon (aari_first_10_off). If use_credit fires
// AND first_time is true, we skip the first-time coupon because the credit
// already zeroes the order (can't discount past zero).
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://aaritransactions.com";
const FIRST_COUPON = "aari_first_10_off";
const CREDIT_COUPON = "aari_membership_credit";

const CREDIT_ELIGIBLE = new Set(["mls_setup", "mls_setup_only", "listing_docs"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

async function ensureFirstTimeCoupon(): Promise<void> {
  try {
    await stripe("coupons", "POST", {
      id: FIRST_COUPON,
      amount_off: "1000",
      currency: "usd",
      duration: "once",
      name: "First-time Aari client · $10 off",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists/i.test(msg)) console.warn("[checkout] first coupon ensure failed:", msg);
  }
}

// v2 · 100%-off coupon for spending a membership credit. Lazily created,
// idempotent by deterministic id.
async function ensureCreditCoupon(): Promise<void> {
  try {
    await stripe("coupons", "POST", {
      id: CREDIT_COUPON,
      percent_off: "100",
      duration: "once",
      name: "Aari Pro membership credit",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists/i.test(msg)) console.warn("[checkout] credit coupon ensure failed:", msg);
  }
}

function buildLineItems(
  service: string,
  mlsNames: string[],
): { items: Array<Record<string, string>>; totalCents: number } {
  const items: Array<Record<string, string>> = [];
  let total = 0;
  if (service === "listing_coordinator") {
    const first = mlsNames[0] || "your MLS";
    items.push(mkItem(`Listing Coordinator (${first} inclu.)`, 19900));
    total += 19900;
    for (let i = 1; i < mlsNames.length; i++) {
      items.push(mkItem(`Additional MLS · ${mlsNames[i]}`, 5900));
      total += 5900;
    }
  } else if (service === "mls_setup_only" || service === "mls_setup") {
    if (mlsNames.length === 0) {
      items.push(mkItem("MLS Setup", 9900));
      total += 9900;
    } else {
      for (const nm of mlsNames) {
        items.push(mkItem(`MLS Setup · ${nm}`, 9900));
        total += 9900;
      }
    }
  } else if (service === "listing_docs") {
    items.push(mkItem("Listing Docs Only", 9900));
    total += 9900;
  } else {
    return { items: [], totalCents: 0 };
  }
  return { items, totalCents: total };
}

function mkItem(name: string, unitAmount: number): Record<string, string> {
  return {
    "price_data[currency]": "usd",
    "price_data[unit_amount]": String(unitAmount),
    "price_data[product_data][name]": name,
    "quantity": "1",
  };
}

function flattenLineItems(items: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  items.forEach((it, i) => {
    for (const [k, v] of Object.entries(it)) out[`line_items[${i}][${k}]`] = v;
  });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!STRIPE_KEY) return json({ ok: false, error: "stripe_key_not_set" }, 500);

  let body: {
    file_id?: string;
    service?: string;
    agent_email?: string;
    mls_names?: string[];
    property_address?: string;
    use_credit?: boolean;
  };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const fileId = String(body.file_id || "").trim();
  const service = String(body.service || "").trim().toLowerCase();
  const email = String(body.agent_email || "").trim().toLowerCase();
  const mlsNames = Array.isArray(body.mls_names)
    ? body.mls_names.map((n) => String(n || "").trim()).filter(Boolean)
    : [];
  const propertyAddress = String(body.property_address || "").trim();
  const wantCredit = body.use_credit === true;

  if (!fileId) return json({ ok: false, error: "missing_file_id" }, 400);
  if (!service) return json({ ok: false, error: "missing_service" }, 400);
  if (!email) return json({ ok: false, error: "missing_agent_email" }, 400);

  const VALID = new Set(["listing_coordinator", "mls_setup_only", "mls_setup", "listing_docs"]);
  if (!VALID.has(service)) return json({ ok: false, error: "unsupported_service" }, 400);

  const { data: fileRow, error: fileErr } = await supabaseAdmin
    .from("files").select("id, agent_id, service_type").eq("id", fileId).maybeSingle();
  if (fileErr) return json({ ok: false, error: "file_lookup_failed" }, 500);
  if (!fileRow) return json({ ok: false, error: "file_not_found" }, 404);

  // v2 · Credit spend path. Requires an authenticated caller (Bearer JWT on
  // the incoming request), an eligible service, and ≥1 remaining credit.
  // We atomically decrement via an optimistic-locked update so two parallel
  // clicks can't spend the same credit twice.
  let creditSpent = false;
  let creditsRemainingAfter = 0;
  if (wantCredit) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "credit_requires_auth" }, 401);
    if (!CREDIT_ELIGIBLE.has(service)) return json({ ok: false, error: "service_not_credit_eligible" }, 400);

    const { data: userWrap, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userWrap?.user) return json({ ok: false, error: "invalid_auth_token" }, 401);
    const authUserId = userWrap.user.id;

    // Look up the agent row (may match by id OR by email if the auth user's
    // id doesn't map cleanly to agents.id).
    let agentId: string | null = null;
    const { data: byId } = await supabaseAdmin.from("agents").select("id, email").eq("id", authUserId).maybeSingle();
    if (byId) agentId = byId.id;
    if (!agentId) {
      const { data: byEmail } = await supabaseAdmin.from("agents").select("id").ilike("email", email).maybeSingle();
      agentId = byEmail?.id ?? null;
    }
    if (!agentId) return json({ ok: false, error: "agent_not_found" }, 404);

    // Read current credit posture, then optimistic-lock decrement.
    const { data: mem } = await supabaseAdmin
      .from("memberships")
      .select("id, credits_total, credits_used, activity_bonus_credits_remaining, status")
      .eq("agent_id", agentId)
      .in("status", ["active", "paused"])
      .limit(1).maybeSingle();
    if (!mem) return json({ ok: false, error: "no_active_membership" }, 400);

    const total = Number(mem.credits_total || 0);
    const used = Number(mem.credits_used || 0);
    const bonus = Number(mem.activity_bonus_credits_remaining || 0);
    const remaining = Math.max(0, total - used) + bonus;
    if (remaining < 1) return json({ ok: false, error: "no_credits_remaining" }, 400);

    // Prefer to burn a monthly credit first; fall back to activity bonus.
    if (total - used > 0) {
      const upd = await supabaseAdmin
        .from("memberships")
        .update({ credits_used: used + 1 })
        .eq("id", mem.id).eq("credits_used", used).select("id");
      if (upd.error || !upd.data || upd.data.length === 0) {
        return json({ ok: false, error: "credit_spend_conflict" }, 409);
      }
      creditsRemainingAfter = remaining - 1;
    } else if (bonus > 0) {
      const upd = await supabaseAdmin
        .from("memberships")
        .update({ activity_bonus_credits_remaining: bonus - 1 })
        .eq("id", mem.id).eq("activity_bonus_credits_remaining", bonus).select("id");
      if (upd.error || !upd.data || upd.data.length === 0) {
        return json({ ok: false, error: "credit_spend_conflict" }, 409);
      }
      creditsRemainingAfter = remaining - 1;
    } else {
      return json({ ok: false, error: "no_credits_remaining" }, 400);
    }
    creditSpent = true;
    // Ensure the coupon exists in Stripe before we reference it below.
    await ensureCreditCoupon();
  }

  // First-time detection (only when credit isn't already zeroing the order).
  let firstTime = false;
  if (!creditSpent) {
    try {
      let agentId = fileRow.agent_id as string | null;
      if (!agentId && email) {
        const ag = await supabaseAdmin.from("agents").select("id").ilike("email", email).maybeSingle();
        agentId = ag.data?.id ?? null;
      }
      if (agentId) {
        const { count } = await supabaseAdmin
          .from("payments").select("id", { count: "exact", head: true })
          .eq("agent_id", agentId).eq("status", "succeeded");
        firstTime = (count ?? 0) === 0;
      } else {
        firstTime = true;
      }
    } catch { firstTime = false; }
  }

  const { items, totalCents } = buildLineItems(service, mlsNames);
  if (items.length === 0) return json({ ok: false, error: "empty_line_items" }, 400);

  if (firstTime) await ensureFirstTimeCoupon();

  const successUrl = SITE_URL + "/files.html?paid=1&file=" + encodeURIComponent(fileId);
  const cancelUrl = SITE_URL + "/submit?svc=" + encodeURIComponent(service);
  const form: Record<string, string> = {
    mode: "payment",
    "payment_method_types[0]": "card",
    customer_email: email,
    client_reference_id: fileId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "metadata[file_id]": fileId,
    "metadata[service_type]": service,
    "metadata[mls_names]": mlsNames.join("|"),
    "metadata[property_address]": propertyAddress,
    "metadata[first_time]": firstTime ? "1" : "0",
    "metadata[credit_used]": creditSpent ? "1" : "0",
    ...flattenLineItems(items),
  };
  if (creditSpent) {
    // 100% off · order lands at $0 and Stripe skips the card collection step.
    form["discounts[0][coupon]"] = CREDIT_COUPON;
  } else if (firstTime) {
    form["discounts[0][coupon]"] = FIRST_COUPON;
  }

  let session: any;
  try {
    session = await stripe("checkout/sessions", "POST", form);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[create-listing-checkout] stripe session create failed:", msg);
    return json({ ok: false, error: "stripe_create_failed", detail: msg }, 502);
  }

  try {
    await supabaseAdmin
      .from("files")
      .update({
        service_type: service,
        mls_names: mlsNames.length ? mlsNames.join(", ") : null,
        stripe_checkout_session_id: session.id,
      })
      .eq("id", fileId);
  } catch (e) {
    console.warn("[create-listing-checkout] file metadata write failed:", e);
  }

  const chargedCents = creditSpent ? 0 : (firstTime ? Math.max(0, totalCents - 1000) : totalCents);
  return json({
    ok: true,
    checkout_url: session.url,
    session_id: session.id,
    first_time: firstTime,
    credit_used: creditSpent,
    credits_remaining: creditSpent ? creditsRemainingAfter : undefined,
    total_cents: chargedCents,
  });
});
