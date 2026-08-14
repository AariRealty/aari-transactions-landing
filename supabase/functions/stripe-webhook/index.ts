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
// Owner ping · every confirmed file payment emails the owner so she doesn't
// have to log in to see when money lands. Overridable via env in case the
// owning email changes; hardcoded default keeps deploys idempotent.
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "marlenyi@aarirealty.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_ADDRESS = Deno.env.get("FROM_ADDRESS") || "files@aaritransactions.com";

function escapeHtmlSimple(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  // Record a one-time payment into the `payments` ledger the billing board reads (Marlenyi Aug 14
  // 2026). The table was designed for this but the webhook never wrote to it, so payments were only
  // ever reflected as a flag on the file, and payments with no file (the "next file" promo link,
  // paid before the file exists) vanished entirely. Deduped on the checkout session id so a Stripe
  // retry can't double-record. Fully best-effort · never rejects the webhook.
  async function recordPayment(row: Record<string, unknown>, sessionId: string): Promise<void> {
    try {
      if (sessionId) {
        const ex = await supabase.from("payments").select("id").eq("stripe_checkout_session_id", sessionId).maybeSingle();
        if (ex.data) return; // already recorded
      }
      await supabase.from("payments").insert(row);
    } catch (e) {
      console.warn("[stripe-webhook] recordPayment failed (payment flow unaffected)", e instanceof Error ? e.message : String(e));
    }
  }

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
    // One-time payment with no file reference (e.g. the "next file" promo link, paid before the file
    // exists). Record it so it is visible — matched to the agent by email — for a broker/TC to attach
    // to the right file from the billing board. Subscriptions are handled above, not here.
    if (!subscription) {
      let agentId: string | null = null;
      if (email) {
        try {
          const ag = await supabase.from("agents").select("id").ilike("email", email).maybeSingle();
          agentId = (ag.data?.id as string) ?? null;
        } catch (_ae) { /* leave null */ }
      }
      await recordPayment({
        file_id: null,
        agent_id: agentId,
        stripe_checkout_session_id: (session.id as string) || null,
        stripe_payment_intent_id: (session.payment_intent as string) || null,
        service_type: null,
        amount_cents: (typeof session.amount_total === "number" ? session.amount_total : 0),
        currency: (session.currency as string) || "usd",
        status: "succeeded", // file_id null = not yet attached to a file
        paid_at: new Date().toISOString(),
        raw_event: { customer_email: email, session_id: session.id },
      }, (session.id as string) || "");
    }
    return json({ received: true, matched: false, membership: !!subscription });
  }

  // Stripe gives amount_total in the smallest currency unit (cents for USD).
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;

  const paidAtIso = new Date().toISOString();
  const upd = await supabase
    .from("files")
    .update({
      payment_pending: false,
      payment_confirmed: true,
      paid_at: paidAtIso,
      ...(amountTotal != null ? { amount_paid_cents: amountTotal } : {}),
    })
    .eq("id", fileId)
    .select("id, assigned_tc_id, property_address, service_type, agent_id")
    .maybeSingle();

  if (upd.error) {
    console.error("[stripe-webhook] update failed", upd.error.message);
    return json({ received: true, updated: false });
  }

  // Record the payment against its file in the payments ledger the billing board reads.
  {
    const f2 = (upd.data ?? {}) as Record<string, unknown>;
    await recordPayment({
      file_id: fileId,
      agent_id: (f2.agent_id as string) || null,
      stripe_checkout_session_id: (session.id as string) || null,
      stripe_payment_intent_id: (session.payment_intent as string) || null,
      service_type: (f2.service_type as string) || null,
      amount_cents: amountTotal ?? 0,
      currency: (session.currency as string) || "usd",
      status: "succeeded",
      paid_at: paidAtIso,
      raw_event: { session_id: session.id },
    }, (session.id as string) || "");
  }

  // Owner ping · fire the email to the owner so she doesn't have to log in
  // to see money landing. Best-effort, wrapped so a Resend hiccup can't
  // reject the webhook (Stripe would retry the whole event otherwise, causing
  // duplicate TC pings and a confusing "webhook trouble" alert email).
  try {
    if (RESEND_API_KEY && upd.data) {
      const f = upd.data as Record<string, unknown>;
      const addr = String(f.property_address || "unknown property");
      const svcLabel = String(f.service_type || "").trim() || "Service";
      const dollars = amountTotal != null ? (amountTotal / 100).toFixed(2) : "?.??";
      // Resolve agent name/email from the agents row if we have an agent_id.
      // Best-effort; the email still sends without it.
      let agentName = "", agentEmail = "";
      try {
        const agentId = f.agent_id as string | undefined;
        if (agentId) {
          const ag = await supabase.from("agents").select("first_name, last_name, email").eq("id", agentId).maybeSingle();
          if (ag.data) {
            agentName = ((ag.data.first_name || "") + " " + (ag.data.last_name || "")).trim();
            agentEmail = String(ag.data.email || "");
          }
        }
      } catch (_ae) { /* leave agentName / email empty */ }
      const subject = `$${dollars} · ${addr} · ${svcLabel} paid`;
      const html =
        `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#0f0f0f;line-height:1.55">` +
          `<p style="margin:0 0 12px"><strong>$${dollars}</strong> just landed in Stripe.</p>` +
          `<p style="margin:0 0 6px"><strong>Property:</strong> ${escapeHtmlSimple(addr)}</p>` +
          `<p style="margin:0 0 6px"><strong>Service:</strong> ${escapeHtmlSimple(svcLabel)}</p>` +
          (agentName ? `<p style="margin:0 0 6px"><strong>Agent:</strong> ${escapeHtmlSimple(agentName)}${agentEmail ? ` &lt;${escapeHtmlSimple(agentEmail)}&gt;` : ""}</p>` : "") +
          `<p style="margin:16px 0 0;color:#6f6a61;font-size:12px">Paid at ${paidAtIso} UTC. Recent payments live on the broker cockpit.</p>` +
        `</div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM_ADDRESS, to: [OWNER_EMAIL], subject, html }),
      });
    }
  } catch (e) {
    console.warn("[stripe-webhook] owner ping failed (payment still confirmed)", e);
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
