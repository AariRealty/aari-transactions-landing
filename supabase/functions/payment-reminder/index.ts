// ============================================================================
// Aari Transactions · payment-reminder (Email System v2 · Step 12 ladder)
// ============================================================================
// Cron-invoked (hourly via pg_cron -> call_edge_function). Sends an escalating
// D1 / D7 / D14 payment ladder to the agent for any file still payment_pending,
// then escalates to the broker on Day 14. Each rung fires once per file via
// payment_reminder_count (0 -> 1 -> 2 -> 3). File stays pending until the
// stripe-webhook confirms payment.
//
//   payment_reminder_count   meaning
//   0 (or null)              no reminder sent yet
//   1                        D1 gentle reminder sent
//   2                        D7 firm reminder sent
//   3                        D14 final notice sent + broker escalated
//
// "Days pending" is measured from files.created_at (when the pending file
// entered the system), matching the original 24h behavior.
//
// STAGED (Dec 2026): this replaces the old one-shot 24h reminder. Nothing
// changes live until `supabase functions deploy payment-reminder` is run AND
// the 20260624_payment_ladder.sql migration adds payment_reminder_count.
//
// Secrets: RESEND_API_KEY (already set). BROKER_NOTIFY_EMAIL optional
// (defaults to marlenyi@aaritransactions.com).
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { resend, FROM, REPLY_TO, SITE_URL } from "../_shared/resend.ts";
import { STRIPE_LINKS } from "../_shared/stripe-links.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROKER_EMAIL = Deno.env.get("BROKER_NOTIFY_EMAIL") ?? "marlenyi@aaritransactions.com";

// Label + price per upfront service for the reminder copy. URLs come from the
// shared canonical STRIPE_LINKS map. Keys match the canonical service_type slugs.
const SERVICE_META: Record<string, { label: string; price: string }> = {
  listing_coordinator: { label: "Listing Coordinator",   price: "$199" },
  listing_docs:        { label: "Listing Docs",          price: "$99"  },
  mls_setup:           { label: "MLS Setup",             price: "$149" },
  offer_prep_basic:    { label: "Offer Prep · Basic",    price: "$69"  },
  offer_prep_complete: { label: "Offer Prep · Complete", price: "$149" },
  file_organization:   { label: "File Organization",     price: "$99"  },
};

const DAY = 24 * 60 * 60 * 1000;

// Which rung is due, given days pending and how many reminders already went out.
// Returns 1 (D1), 2 (D7), 3 (D14), or 0 (nothing due yet).
function dueRung(daysPending: number, count: number): 0 | 1 | 2 | 3 {
  if (daysPending >= 14 && count < 3) return 3;
  if (daysPending >= 7 && count < 2) return 2;
  if (daysPending >= 1 && count < 1) return 1;
  return 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Any pending file at least a day old that has not finished the ladder.
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const { data: files, error } = await supabase
    .from("files")
    .select("id, agent_id, service_type, property_address, created_at, payment_reminder_count")
    .eq("payment_pending", true)
    .lt("created_at", dayAgo)
    .or("payment_reminder_count.is.null,payment_reminder_count.lt.3")
    .limit(50);

  if (error) {
    console.error("[payment-reminder] query failed", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  let sent = 0;
  for (const f of files ?? []) {
    const meta = SERVICE_META[f.service_type as string];
    const url = STRIPE_LINKS[f.service_type as string];
    if (!meta || !url) continue; // not an upfront service we know · skip silently

    const count = Number(f.payment_reminder_count ?? 0);
    const daysPending = Math.floor((Date.now() - new Date(f.created_at).getTime()) / DAY);
    const rung = dueRung(daysPending, count);
    if (rung === 0) continue;

    const { data: agent } = await supabase
      .from("agents")
      .select("first_name, email")
      .eq("id", f.agent_id)
      .maybeSingle();
    if (!agent?.email) continue;

    const payUrl = `${url}?client_reference_id=${encodeURIComponent(f.id)}`;
    const addr = f.property_address || "your file";
    const subject = rung === 1
      ? `Payment pending · ${meta.label} for ${addr}`
      : rung === 2
        ? `Still pending · ${meta.label} for ${addr}`
        : `Final notice · ${meta.label} for ${addr}`;

    const lead = rung === 1
      ? `Your <strong>${meta.label}</strong> file for <strong>${addr}</strong> is in my system. I cannot start work until the <strong>${meta.price}</strong> payment comes through.`
      : rung === 2
        ? `It has been a week. Your <strong>${meta.label}</strong> file for <strong>${addr}</strong> is still on hold for the <strong>${meta.price}</strong> payment. Work stays paused until it clears.`
        : `This is the final reminder on your <strong>${meta.label}</strong> file for <strong>${addr}</strong>. It has been two weeks and the <strong>${meta.price}</strong> payment has not come through. I am flagging this one for review on my end.`;

    try {
      await resend.emails.send({
        from: FROM,
        to: agent.email,
        reply_to: REPLY_TO,
        subject,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;color:#2c2c2a;max-width:520px;margin:0 auto">
            <p>Hi ${agent.first_name ?? "there"},</p>
            <p>${lead}</p>
            <p style="margin:24px 0">
              <a href="${payUrl}" style="background:#2c2c2a;color:#fff;border-radius:10px;padding:12px 22px;text-decoration:none;font-weight:500">Pay ${meta.price} now &rarr;</a>
            </p>
            <p style="font-size:13px;color:#9a9a9a">Already paid? No action needed. Confirmation can take a few minutes.
            Questions? Just reply to this email.</p>
            <p style="font-size:12px;color:#9a9a9a">Aari Transactions · <a href="${SITE_URL}/portal.html" style="color:#9a9a9a">your portal</a></p>
          </div>`,
      });

      // Day 14: escalate to the broker so it never goes silent.
      if (rung === 3) {
        try {
          await resend.emails.send({
            from: FROM,
            to: BROKER_EMAIL,
            reply_to: REPLY_TO,
            subject: `Payment unresolved at 14 days · ${meta.label} · ${addr}`,
            html: `
              <div style="font-family:Inter,Arial,sans-serif;color:#2c2c2a;max-width:520px;margin:0 auto">
                <p>Heads up.</p>
                <p><strong>${agent.first_name ?? "An agent"}</strong> (${agent.email}) has a <strong>${meta.label}</strong> file
                for <strong>${addr}</strong> that has been payment pending for 14 days. The <strong>${meta.price}</strong> payment
                has not cleared after the full D1, D7, and D14 reminder ladder.</p>
                <p style="font-size:13px;color:#9a9a9a">Final notice has gone to the agent. This file needs a decision on your end.</p>
              </div>`,
          });
        } catch (e) {
          console.warn("[payment-reminder] broker escalation failed for", f.id, e);
        }
      }

      await supabase
        .from("files")
        .update({ payment_reminder_count: rung, payment_reminder_sent_at: new Date().toISOString() })
        .eq("id", f.id);
      sent++;
    } catch (e) {
      console.warn("[payment-reminder] send failed for", f.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
});
