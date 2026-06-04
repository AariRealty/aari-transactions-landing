// ============================================================================
// Aari Transactions · payment-reminder (June 2026 · Phase 2 Step 7)
// ============================================================================
// Cron-invoked (hourly via pg_cron → call_edge_function). Finds files that have
// been payment_pending for 24h+ with no reminder sent, emails the agent their
// Stripe payment link, and stamps payment_reminder_sent_at so each file gets
// exactly one reminder. File stays pending until the stripe-webhook confirms.
//
// Secrets: RESEND_API_KEY (already set for the other mail functions).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { resend, FROM, REPLY_TO, SITE_URL } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Stripe payment links per upfront service (same links the intake uses).
const STRIPE_LINKS: Record<string, { label: string; price: string; url: string }> = {
  lc:           { label: "Listing Coordinator",    price: "$199", url: "https://buy.stripe.com/dRm3cn77V6in5Cj9QScAo0h" },
  listing_docs: { label: "Listing Docs",           price: "$99",  url: "https://buy.stripe.com/6oU7sD8bZbCH3ubfbccAo08" },
  mls_setup:    { label: "MLS Setup",              price: "$149", url: "https://buy.stripe.com/fZu5kvgIvbCH7Kr7IKcAo09" },
  op_basic:     { label: "Offer Prep · Basic",     price: "$69",  url: "https://buy.stripe.com/3cI5kv63R227ggXbZ0cAo07" },
  op_complete:  { label: "Offer Prep · Complete",  price: "$149", url: "https://buy.stripe.com/6oUfZ99g3gX18Ov4wycAo05" },
  file_org:     { label: "File Organization",      price: "$99",  url: "https://buy.stripe.com/6oU00b2RF6infcT8MOcAo0f" },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: files, error } = await supabase
    .from("files")
    .select("id, agent_id, service_type, property_address, created_at")
    .eq("payment_pending", true)
    .is("payment_reminder_sent_at", null)
    .lt("created_at", cutoff)
    .limit(25);

  if (error) {
    console.error("[payment-reminder] query failed", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  let sent = 0;
  for (const f of files ?? []) {
    const svc = STRIPE_LINKS[f.service_type as string];
    if (!svc) continue; // not an upfront service we know · skip silently

    const { data: agent } = await supabase
      .from("agents")
      .select("first_name, email")
      .eq("id", f.agent_id)
      .maybeSingle();
    if (!agent?.email) continue;

    const payUrl = `${svc.url}?client_reference_id=${encodeURIComponent(f.id)}`;
    const addr = f.property_address || "your file";

    try {
      await resend.emails.send({
        from: FROM,
        to: agent.email,
        reply_to: REPLY_TO,
        subject: `Payment pending · ${svc.label} for ${addr}`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;color:#2c2c2a;max-width:520px;margin:0 auto">
            <p>Hi ${agent.first_name ?? "there"},</p>
            <p>Your <strong>${svc.label}</strong> file for <strong>${addr}</strong> is in our system,
            but we can't start work until the <strong>${svc.price}</strong> payment comes through.</p>
            <p style="margin:24px 0">
              <a href="${payUrl}" style="background:#2c2c2a;color:#fff;border-radius:10px;padding:12px 22px;text-decoration:none;font-weight:500">Pay ${svc.price} now &rarr;</a>
            </p>
            <p style="font-size:13px;color:#9a9a9a">Already paid? No action needed — confirmation can take a few minutes.
            Questions? Just reply to this email.</p>
            <p style="font-size:12px;color:#9a9a9a">— Aari Transactions · <a href="${SITE_URL}/portal.html" style="color:#9a9a9a">your portal</a></p>
          </div>`,
      });
      await supabase
        .from("files")
        .update({ payment_reminder_sent_at: new Date().toISOString() })
        .eq("id", f.id);
      sent++;
    } catch (e) {
      console.warn("[payment-reminder] send failed for", f.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
});
