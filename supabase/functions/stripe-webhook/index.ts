// ============================================================================
// Aari Transactions · stripe-webhook (v36 · 2026-08-07)
// ============================================================================
// Handles Stripe events for BOTH sides of the business:
//   1. checkout.session.completed  · one-time file payments (flip
//      payment_pending -> payment_confirmed) AND the first subscription
//      checkout (capture stripe_customer_id + stripe_subscription_id onto the
//      agent's membership so self-serve management can act on it).
//   2. Subscription lifecycle (memberships) · keeps status + billing-period
//      dates in sync so recurring renewals, cancellations, and status changes
//      are recorded. Matched by stripe_subscription_id.
//        · customer.subscription.updated / .created · sync period + status
//        · customer.subscription.deleted            · status = cancelled
//        · invoice.paid                             · renewal paid -> active
//      Credits are intentionally NOT touched here: the app computes each
//      cycle's credits at read-time from current_period_start, so keeping that
//      date correct is all the webhook owes it.
//      A failed payment (invoice.payment_failed) is acknowledged but does NOT
//      change status — Stripe retries, and if it ultimately fails Stripe fires
//      subscription.deleted, which marks the member cancelled. This avoids
//      locking out a paying member over a temporary card hiccup (Marlenyi Aug 7).
//
// Secrets required (Dashboard -> Edge Functions -> Secrets):
//   STRIPE_WEBHOOK_SECRET  · signing secret from the Stripe webhook endpoint
//
// **verify_jwt MUST BE false** — Stripe cannot send Supabase JWTs, so with JWT
// verification on the edge runtime rejects every event as 401 before this file
// runs. Authenticity is protected by verifyStripeSignature() below, which
// HMAC-checks each event against STRIPE_WEBHOOK_SECRET. Re-deploy via the MCP
// deploy_edge_function tool with verify_jwt=false, NOT via any path that
// defaults to true.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyStripeSignature(body: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false; // never accept unsigned events
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Reject events older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish comparison.
  if (expected.length !== v1.length) return false;
  let diff = 0;
  const a = hexToBytes(expected), b = hexToBytes(v1);
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

// Stripe subscription.status -> membership.status. Returns null for states we
// don't want to write (past_due / unpaid / incomplete) so we never overwrite a
// known status with an unrecognized one — dates still sync, status is left be.
function mapSubStatus(s: string): string | null {
  if (s === "active" || s === "trialing") return "active";
  if (s === "paused") return "paused";
  if (s === "canceled") return "cancelled";
  return null;
}

function tsToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const body = await req.text();
  const ok = await verifyStripeSignature(body, req.headers.get("stripe-signature"));
  if (!ok) return new Response("invalid signature", { status: 400 });

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  // Once the signature verified and the payload parsed, ALWAYS return 200 to
  // Stripe. If our downstream processing (Supabase update, notification fetch)
  // throws, we log it and still ack the delivery. Returning 500 to Stripe just
  // starts the retry cycle that generates the "webhook trouble/recovered"
  // email pair; the underlying event is already stored on Stripe's side and
  // will show up in their dashboard's event log for manual replay if needed.
  try {
    return await handleEvent(event);
  } catch (e) {
    console.error("[stripe-webhook] handler threw", e instanceof Error ? e.message : String(e));
    return json({ received: true, processed: false, error: "internal_processing_error" });
  }
});

async function handleEvent(event: { type?: string; data?: { object?: Record<string, unknown> } }): Promise<Response> {
  const type = event.type || "";
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- Subscription lifecycle (memberships) --------------------------------
  if (type === "customer.subscription.updated" || type === "customer.subscription.created") {
    const subId = (obj.id as string | undefined) || "";
    if (!subId) return json({ received: true, ignored: type, reason: "no subscription id" });
    const patch: Record<string, unknown> = {};
    // Newer Stripe API versions (2025+) moved current_period_start/end off the
    // subscription and onto each line item. Read the top level first (older
    // versions), then fall back to the first item (2026-04-22.dahlia).
    const item0 = ((((obj.items as Record<string, unknown> | undefined)?.data) as Record<string, unknown>[] | undefined) || [])[0] || {};
    const cps = tsToIso(obj.current_period_start ?? item0.current_period_start);
    const cpe = tsToIso(obj.current_period_end ?? item0.current_period_end);
    if (cps) patch.current_period_start = cps;
    if (cpe) { patch.current_period_end = cpe; patch.next_renewal_at = cpe; }
    const st = mapSubStatus(String(obj.status || ""));
    if (st) {
      patch.status = st;
      if (st === "cancelled") patch.cancelled_at = new Date().toISOString();
    }
    if (Object.keys(patch).length) {
      const r = await supabase.from("memberships").update(patch).eq("stripe_subscription_id", subId);
      if (r.error) console.error("[stripe-webhook] subscription sync failed", r.error.message);
    }
    return json({ received: true, subscription_synced: subId });
  }

  if (type === "customer.subscription.deleted") {
    const subId = (obj.id as string | undefined) || "";
    if (subId) {
      const r = await supabase.from("memberships")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subId);
      if (r.error) console.error("[stripe-webhook] cancel sync failed", r.error.message);
    }
    return json({ received: true, subscription_deleted: subId });
  }

  if (type === "invoice.paid") {
    // A recurring charge succeeded. The following subscription.updated event
    // carries the new period; here we just make sure the member reads active
    // (unless they've been cancelled). Credits are handled by the app's cycle
    // logic off current_period_start, so nothing to reset here.
    const subId = (obj.subscription as string | undefined) || "";
    if (subId) {
      const r = await supabase.from("memberships")
        .update({ status: "active" })
        .eq("stripe_subscription_id", subId)
        .neq("status", "cancelled");
      if (r.error) console.error("[stripe-webhook] invoice.paid sync failed", r.error.message);
    }
    return json({ received: true, invoice_paid: subId });
  }

  // ---- Checkout (one-time file payment OR first subscription checkout) ------
  if (type !== "checkout.session.completed") {
    // invoice.payment_failed and everything else: acknowledge, no DB change.
    return json({ received: true, ignored: type });
  }

  const session = obj;
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const fileId = meta.file_id || (session.client_reference_id as string | undefined) || "";

  if (!fileId) {
    // No file → likely a MEMBERSHIP subscription checkout (Become a Starter/Producer).
    // Capture the Stripe customer + subscription id onto the agent's membership so
    // self-serve management (pause/cancel/downgrade) can act on the right subscription.
    const subscription = (session.subscription as string | undefined) || "";
    const customer = (session.customer as string | undefined) || "";
    const details = (session.customer_details ?? {}) as Record<string, unknown>;
    const email = (details.email as string | undefined) || (session.customer_email as string | undefined) || "";
    if (subscription && email) {
      try {
        const ag = await supabase.from("agents").select("id").ilike("email", email).maybeSingle();
        const agentId = ag.data?.id;
        if (agentId) {
          await supabase.from("memberships")
            .update({ stripe_subscription_id: subscription, stripe_customer_id: customer || null })
            .eq("agent_id", agentId)
            .in("status", ["active", "paused"]);
        }
      } catch (e) {
        console.warn("[stripe-webhook] membership id capture failed", e);
      }
    }
    return json({ received: true, matched: false, membership: !!subscription });
  }

  // Stripe gives amount_total in the smallest currency unit (cents for USD).
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;

  const upd = await supabase
    .from("files")
    .update({
      payment_pending: false,
      payment_confirmed: true,
      ...(amountTotal != null ? { amount_paid_cents: amountTotal } : {}),
    })
    .eq("id", fileId)
    .select("id, assigned_tc_id, property_address")
    .maybeSingle();

  if (upd.error) {
    console.error("[stripe-webhook] update failed", upd.error.message);
    return json({ received: true, updated: false });
  }

  // Best-effort TC ping · fire-and-forget so Stripe gets a fast 200 even if
  // send-file-notification is slow. Awaiting this used to block the response
  // long enough that Stripe flagged the endpoint as troubled on cold-start
  // days, generating the "webhook trouble/recovered" email cycle.
  // EdgeRuntime.waitUntil keeps the isolate alive until the background
  // promise settles, so the ping still fires; we just don't make Stripe wait.
  const notifyPromise = fetch(`${SUPABASE_URL}/functions/v1/send-file-notification`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ file_id: fileId, event: "payment_confirmed" }),
  }).catch((e) => {
    console.warn("[stripe-webhook] TC ping failed (payment still confirmed)", e);
  });
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") {
    runtime.waitUntil(notifyPromise);
  }

  return json({ received: true, updated: !!upd.data });
}
