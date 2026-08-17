// ============================================================================
// Aari Transactions · create-listing-checkout v1 (2026-08-17)
// ============================================================================
// Mints a Stripe Checkout Session on-the-fly for the redesigned listing flow.
// Replaces the static Payment Links previously used for Listing Coordinator +
// MLS Setup Only so pricing can vary with the number of MLSs the client picks.
//
// Pricing model (per Marlenyi 2026-08-17):
//   listing_coordinator · $199 base (1 MLS included) + $59 per extra MLS
//   mls_setup_only      · $99 per MLS (flat, any count)
//   listing_docs        · $99 flat, no MLS input
//
// First-time client:
//   Zero prior succeeded rows for this agent email in the `payments` table.
//   Auto-applies a $10 off coupon to the whole order. Coupon is minted
//   lazily on first use of this function (deterministic id `aari_first_10_off`).
//
// Request (public, no JWT — matched by file_id):
//   { file_id, service, agent_email, mls_names?: string[], property_address? }
//
// Response:
//   { ok: true, checkout_url, session_id, first_time, total_cents }
//   { ok: false, error }
//
// deploy:
//   supabase functions deploy create-listing-checkout --no-verify-jwt
// secrets required:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://aaritransactions.com";
const COUPON_ID = "aari_first_10_off";

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

// Minimal Stripe REST helper (form-encoded; matches manage-subscription pattern).
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

// Lazily create the first-time $10 off coupon. Idempotent: if the coupon with
// this deterministic id already exists, Stripe returns it. We swallow the
// "resource_already_exists" error so subsequent calls no-op cleanly.
async function ensureFirstTimeCoupon(): Promise<void> {
  try {
    await stripe("coupons", "POST", {
      id: COUPON_ID,
      amount_off: "1000", // $10.00 in cents
      currency: "usd",
      duration: "once",
      name: "First-time Aari client · $10 off",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists/i.test(msg)) {
      console.warn("[create-listing-checkout] coupon ensure failed:", msg);
    }
  }
}

// Return the Stripe line_items[] array for the service + MLS selection.
// Uses price_data.product_data.name so each line has a human-readable label
// on the Stripe checkout screen (per Marlenyi: base line should say
// "Listing Coordinator (Miami Realtors® inclu.)"; additional MLSs each get
// their own line prefixed "Additional MLS · <name>").
function buildLineItems(
  service: string,
  mlsNames: string[],
): { items: Array<Record<string, string>>; totalCents: number } {
  const items: Array<Record<string, string>> = [];
  let total = 0;

  if (service === "listing_coordinator") {
    const first = mlsNames[0] || "your MLS";
    const baseName = `Listing Coordinator (${first} inclu.)`;
    items.push(mkItem(baseName, 19900));
    total += 19900;
    for (let i = 1; i < mlsNames.length; i++) {
      const name = `Additional MLS · ${mlsNames[i]}`;
      items.push(mkItem(name, 5900));
      total += 5900;
    }
  } else if (service === "mls_setup_only" || service === "mls_setup") {
    // MLS Setup Only · $99 per MLS
    if (mlsNames.length === 0) {
      // Fallback: no MLS names supplied (shouldn't happen in the new flow but keep safe)
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
    // Unknown service — caller should have validated. Return empty so the
    // Stripe call errors out clearly rather than charging something wrong.
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

// Flatten { line_items: [{...}, {...}] } into Stripe's form-encoded shape:
//   line_items[0][price_data][currency]=usd&line_items[0][quantity]=1&line_items[1]...
function flattenLineItems(items: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  items.forEach((it, i) => {
    for (const [k, v] of Object.entries(it)) {
      out[`line_items[${i}][${k}]`] = v;
    }
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
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const fileId = String(body.file_id || "").trim();
  const service = String(body.service || "").trim().toLowerCase();
  const email = String(body.agent_email || "").trim().toLowerCase();
  const mlsNames = Array.isArray(body.mls_names)
    ? body.mls_names.map((n) => String(n || "").trim()).filter(Boolean)
    : [];
  const propertyAddress = String(body.property_address || "").trim();

  if (!fileId) return json({ ok: false, error: "missing_file_id" }, 400);
  if (!service) return json({ ok: false, error: "missing_service" }, 400);
  if (!email) return json({ ok: false, error: "missing_agent_email" }, 400);

  const VALID_SERVICES = new Set(["listing_coordinator", "mls_setup_only", "mls_setup", "listing_docs"]);
  if (!VALID_SERVICES.has(service)) return json({ ok: false, error: "unsupported_service" }, 400);

  // Verify the file exists so we don't mint a Stripe session against a stale/bogus id.
  const { data: fileRow, error: fileErr } = await supabaseAdmin
    .from("files")
    .select("id, agent_id, service_type")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) {
    console.error("[create-listing-checkout] file lookup failed", fileErr.message);
    return json({ ok: false, error: "file_lookup_failed" }, 500);
  }
  if (!fileRow) return json({ ok: false, error: "file_not_found" }, 404);

  // First-time detection · count prior succeeded payments for this agent email.
  // If the file has an agent_id, check by agent_id (most reliable). Otherwise
  // fall back to matching by email through the agents table.
  let firstTime = false;
  try {
    let agentId = fileRow.agent_id as string | null;
    if (!agentId && email) {
      const ag = await supabaseAdmin.from("agents").select("id").ilike("email", email).maybeSingle();
      agentId = ag.data?.id ?? null;
    }
    if (agentId) {
      const { count } = await supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("status", "succeeded");
      firstTime = (count ?? 0) === 0;
    } else {
      // Unknown agent · treat as first-time so they get the welcome discount.
      firstTime = true;
    }
  } catch (e) {
    console.warn("[create-listing-checkout] first-time check failed (defaulting false):", e);
    firstTime = false;
  }

  // Build the line items for this service + MLS selection.
  const { items, totalCents } = buildLineItems(service, mlsNames);
  if (items.length === 0) return json({ ok: false, error: "empty_line_items" }, 400);

  // If first-time, make sure the coupon exists in Stripe before we reference it.
  if (firstTime) await ensureFirstTimeCoupon();

  // Assemble the Stripe Checkout Session params.
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
    ...flattenLineItems(items),
  };
  if (firstTime) {
    form["discounts[0][coupon]"] = COUPON_ID;
  }

  let session: any;
  try {
    session = await stripe("checkout/sessions", "POST", form);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[create-listing-checkout] stripe session create failed:", msg);
    return json({ ok: false, error: "stripe_create_failed", detail: msg }, 502);
  }

  // Write metadata onto the file row so the webhook has everything it needs
  // when payment lands (without re-querying Stripe metadata). Fire-and-forget.
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

  return json({
    ok: true,
    checkout_url: session.url,
    session_id: session.id,
    first_time: firstTime,
    total_cents: firstTime ? totalCents - 1000 : totalCents,
  });
});
