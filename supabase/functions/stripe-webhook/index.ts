// ============================================================================
// Aari Transactions · stripe-webhook (v33 · 2026-08-07)
// ============================================================================
// Listens for checkout.session.completed. Matches the payment to the file via
// metadata.file_id (preferred) or client_reference_id (what the intake appends
// to the payment links). Flips payment_pending -> payment_confirmed and pings
// the TC notification function (best-effort).
//
// Secrets required (Dashboard -> Edge Functions -> Secrets):
//   STRIPE_WEBHOOK_SECRET  · signing secret from the Stripe webhook endpoint
//
// Stripe dashboard setup (Marlenyi):
//   Developers -> Webhooks -> Add endpoint
//   URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Event: checkout.session.completed
//
// **verify_jwt MUST BE false** — Stripe cannot send Supabase JWTs, so with JWT
// verification on the edge runtime rejects every event as 401 before this file
// runs. That's the bug Marlenyi hit on 2026-08-06: Stripe emailed her that
// deliveries were failing for the past week. Authenticity is protected by
// verifyStripeSignature() below, which HMAC-checks each event against
// STRIPE_WEBHOOK_SECRET before touching the DB. Re-deploy this function via
// the MCP deploy_edge_function tool with verify_jwt=false, NOT via any path
// that defaults to true.
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const body = await req.text();
  const ok = await verifyStripeSignature(body, req.headers.get("stripe-signature"));
  if (!ok) return new Response("invalid signature", { status: 400 });

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }

  const session = (event.data?.object ?? {}) as Record<string, unknown>;
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
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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
    return new Response(JSON.stringify({ received: true, matched: false, membership: !!subscription }), { status: 200 });
  }

  // Stripe gives amount_total in the smallest currency unit (cents for USD).
  // Capture it so the agent's Billing view can show the real amount charged.
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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
    return new Response(JSON.stringify({ received: true, updated: false }), { status: 200 });
  }

  // Best-effort TC ping · payment confirmed, file is ready to work.
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-file-notification`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ file_id: fileId, event: "payment_confirmed" }),
    });
  } catch (e) {
    console.warn("[stripe-webhook] TC ping failed (payment still confirmed)", e);
  }

  return new Response(JSON.stringify({ received: true, updated: !!upd.data }), { status: 200 });
});
