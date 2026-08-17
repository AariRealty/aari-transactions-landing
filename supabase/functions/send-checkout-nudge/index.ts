// ============================================================================
// Aari Transactions · send-checkout-nudge v1 (2026-08-16)
// ============================================================================
// Two-email cadence for files submitted with an upfront-paid service where
// Stripe checkout never landed. Marlenyi wanted a warm Alex-toned push, not
// a threatening reminder — and definitely not more than two.
//
//   Email 1: 30 min – 4 h after submit if still unpaid.
//            "Almost there... just one step! ✨"
//
//   Email 2: 72 h after email 1 if still unpaid.
//            "Still holding your spot 💫"
//
//   After email 2: silence (no third reminder, no daily nag).
//
// Recipients: TO the client (agent that submitted), CC the broker
// (marlenyi@aaritransactions.com), so Marlenyi sees every unpaid file in her inbox.
// Design mirrors the eod-report wrap-up email: cream card, serif hero, black
// CTA, quiet property + service facts block.
//
// Cron: `5,35 * * * *` (every 30 min at :05 and :35).
// See 20260816_checkout_nudge_cron.sql.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const BROKER_EMAIL = Deno.env.get("OWNER_EMAIL") || "marlenyi@aaritransactions.com";
const FROM_ADDRESS = Deno.env.get("FROM_ADDRESS") || "files@aaritransactions.com";
const PORTAL = "https://aaritransactions.com/files.html";

// Services that require upfront checkout (paid at submission). tc_one_side /
// tc_both_sides are billed at close and never enter this cadence.
const UPFRONT_SERVICES = new Set([
  "offer_prep_basic", "offer_prep_complete",
  "listing_docs", "listing_coordinator", "mls_setup",
  "file_organization", "standalone_review",
]);

// Stripe payment link map · reuses the same links as the client saw at submit.
const STRIPE_LINKS: Record<string, string> = {
  offer_prep_basic:     "https://buy.stripe.com/00w00b1NBcGL4yfgfgcAo0i",
  offer_prep_complete:  "https://buy.stripe.com/6oUfZ99g3gX18Ov4wycAo05",
  listing_docs:         "https://buy.stripe.com/6oU7sD8bZbCH3ubfbccAo08",
  mls_setup:            "https://buy.stripe.com/fZu5kvgIvbCH7Kr7IKcAo09",
  file_organization:    "https://buy.stripe.com/6oU00b2RF6infcT8MOcAo0f",
  listing_coordinator:  "https://buy.stripe.com/dRm6oz4ZNdKP0hZgfgcAo0j",
};

const SVC_LABEL: Record<string, string> = {
  offer_prep_basic:    "Offer Prep · Basic",
  offer_prep_complete: "Offer Prep · Complete",
  listing_docs:        "Listing Docs",
  mls_setup:           "MLS Setup",
  file_organization:   "File Organization",
  listing_coordinator: "Listing Coordinator",
  standalone_review:   "Standalone Review",
};

function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

async function sendResend(kind: string, to: string[], cc: string[], subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) { console.warn(`[checkout-nudge] ${kind} skipped: RESEND_API_KEY missing`); return false; }
  const doSend = () => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, cc, subject, html }),
  });
  let r: Response;
  try { r = await doSend(); } catch (e) {
    console.error(`[checkout-nudge] ${kind} network threw`, e instanceof Error ? e.message : String(e));
    try { r = await doSend(); } catch (e2) { console.error(`[checkout-nudge] ${kind} retry threw`, e2 instanceof Error ? e2.message : String(e2)); return false; }
  }
  if (!r.ok && (r.status === 429 || r.status >= 500)) {
    console.warn(`[checkout-nudge] ${kind} transient ${r.status}, retrying`);
    try { r = await doSend(); } catch (_){ return false; }
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`[checkout-nudge] ${kind} Resend failed status=${r.status} body=${body}`);
    return false;
  }
  console.log(`[checkout-nudge] ${kind} sent to=${to.join(",")} cc=${cc.join(",")}`);
  return true;
}

function htmlEmail(args: {
  headline: string; sub: string; addr: string; svcLabel: string;
  ctaUrl: string; ctaLabel: string; kicker: string;
}): string {
  const { headline, sub, addr, svcLabel, ctaUrl, ctaLabel, kicker } = args;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 16px"><tr><td align="center"><table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:0.5px solid #e6ddca;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td style="padding:20px 26px 6px;border-bottom:0.5px solid #f2eee4;font-size:11.5px;letter-spacing:0.3px;color:#8a8073;text-transform:uppercase">Aari Transactions · ${esc(kicker)}</td></tr>
<tr><td align="center" style="padding:28px 26px 4px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#0f0f0f;letter-spacing:-0.5px">${headline}</div></td></tr>
<tr><td align="center" style="padding:10px 26px 22px"><div style="font-size:13px;color:#5f5647;line-height:1.55;max-width:400px;margin:0 auto">${sub}</div></td></tr>
<tr><td style="padding:0 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7ef;border:0.5px solid #ede6d4;border-radius:12px">
<tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a8073;border-bottom:0.5px solid #f2eee4">Property</td><td style="padding:12px 16px;border-bottom:0.5px solid #f2eee4;font-size:13px;color:#0f0f0f;text-align:right">${esc(addr)}</td></tr>
<tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a8073">Service</td><td style="padding:12px 16px;font-size:13px;color:#0f0f0f;text-align:right">${esc(svcLabel)}</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:24px 26px 26px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:13px 24px;border-radius:10px;letter-spacing:0.2px">${esc(ctaLabel)} &rarr;</a></td></tr>
<tr><td style="padding:14px 26px 20px;border-top:0.5px solid #f2eee4;text-align:center;font-size:10.5px;color:#8a8073;letter-spacing:0.3px">Aari Transactions LLC</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Pull unpaid upfront-service files created in the last 14 days.
  const upfrontList = Array.from(UPFRONT_SERVICES);
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: files, error } = await admin.from("files")
    .select("id, property_address, service_type, agent_id, created_at, payment_status, paid_at, checkout_reminder_1_sent_at, checkout_reminder_2_sent_at")
    .in("service_type", upfrontList)
    .gte("created_at", cutoff)
    .is("paid_at", null)
    .neq("payment_status", "paid")
    .not("status", "in", "('closed','cancelled','archived')")
    .limit(200);
  if (error) {
    console.error("[checkout-nudge] query failed", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const now = Date.now();
  let sent1 = 0, sent2 = 0;

  for (const f of files || []) {
    const svc = String(f.service_type || "");
    const svcLabel = SVC_LABEL[svc] || svc;
    const ctaBase = STRIPE_LINKS[svc];
    if (!ctaBase) continue;
    const ctaUrl = `${ctaBase}?client_reference_id=${encodeURIComponent(f.id)}`;
    const addr = String(f.property_address || "your property");

    // Look up agent (the client) — email + first name.
    let clientEmail = "", clientFirst = "";
    try {
      const ag = await admin.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
      clientEmail = String(ag.data?.email || "").trim();
      clientFirst = String(ag.data?.first_name || "").trim();
    } catch (_){}
    if (!clientEmail) continue;

    const createdAt = new Date(f.created_at).getTime();
    const hoursSinceCreate = (now - createdAt) / 3600000;

    // ---- Email 1: 30 min – 4 h after submit, not yet sent ----
    if (!f.checkout_reminder_1_sent_at && hoursSinceCreate >= 0.5 && hoursSinceCreate <= 24) {
      const headline = `Almost there... just one step! &#10024;`;
      const hi = clientFirst ? `Hi ${esc(clientFirst)} &mdash; ` : "";
      const sub = `${hi}we&rsquo;ve got your file. Complete checkout and a coordinator picks it up right away.`;
      const html = htmlEmail({ headline, sub, addr, svcLabel, ctaUrl, ctaLabel: "Complete checkout", kicker: "Just one step left" });
      const ok = await sendResend(`email-1 file=${f.id}`, [clientEmail], [BROKER_EMAIL], `Almost there · ${addr} · ${svcLabel}`, html);
      if (ok) {
        await admin.from("files").update({ checkout_reminder_1_sent_at: new Date().toISOString() }).eq("id", f.id);
        sent1++;
      }
      continue;
    }

    // ---- Email 2: 72 h after email 1, still unpaid, not yet sent ----
    if (f.checkout_reminder_1_sent_at && !f.checkout_reminder_2_sent_at) {
      const r1Ms = new Date(f.checkout_reminder_1_sent_at).getTime();
      const hoursSinceReminder1 = (now - r1Ms) / 3600000;
      if (hoursSinceReminder1 >= 72) {
        const headline = `Still holding your spot &#128140;`;
        const hi = clientFirst ? `Hi ${esc(clientFirst)} &mdash; ` : "";
        const sub = `${hi}your file is ready to go, but checkout hasn&rsquo;t landed yet. If you&rsquo;d still like us on it, tap below &mdash; we&rsquo;re ready.`;
        const html = htmlEmail({ headline, sub, addr, svcLabel, ctaUrl, ctaLabel: "Complete checkout", kicker: "Still holding your spot" });
        const ok = await sendResend(`email-2 file=${f.id}`, [clientEmail], [BROKER_EMAIL], `Still holding your spot · ${addr}`, html);
        if (ok) {
          await admin.from("files").update({ checkout_reminder_2_sent_at: new Date().toISOString() }).eq("id", f.id);
          sent2++;
        }
      }
    }
    // After email 2: nothing more · no third reminder.
  }

  return new Response(JSON.stringify({ ok: true, sent1, sent2, considered: (files || []).length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
