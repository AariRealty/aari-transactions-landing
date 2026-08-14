// Edge function: closed-payment-reminder (Email System v2 · Section 5)
// ============================================================================
// POST-CLOSING TC-fee reminder ladder for TC services billed at closing (NOT
// the upfront pre-work flow — that's `payment-reminder`). Runs daily.
//
// Targets: status='closed', payment_status='pending', service_type in
// ('tc_one_side','tc_both_sides'), actual_closing_date (falls back to
// closing_date) not null. Prior versions filtered on `closed_at` (nonexistent
// column) and `payment_confirmed=false` (contradicts the TC-file schema which
// seeds it true) — this cron sent zero emails until Aug 11, 2026.
//
// Ladder, measured from closed_at:
//   Day 1  · 20–28h after closing  → email the agent (Thread 1 tone)
//   Day 7  · 168–192h after closing → second email the agent
//   Day 14 · NO email here — the morning briefing (send-morning-briefing-sms)
//            surfaces it as DO FIRST. This function never sends on Day 14.
//
// Dedup: payment_reminder_last_sent_at. A rung is skipped if a send already
// landed in or after that rung's window start, so each window fires once.
//
// Sender: From = assigned TC's name on the verified domain, Reply-To = TC email.
// {{payment_link}} = the canonical Stripe link for the file's service_type.
//
// STAGED (Dec 2026): deploy via `supabase functions deploy closed-payment-reminder`
// after running 20260625_closed_payment_reminder.sql.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { resend, FROM } from "../_shared/resend.ts";
import { STRIPE_LINKS } from "../_shared/stripe-links.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_ADDR = (FROM.match(/<([^>]+)>/) || [])[1] ?? "hello@aaritransactions.com";

const TC_SERVICES = ["tc_one_side", "tc_both_sides"];
const HOUR = 60 * 60 * 1000;

// Per-agent member promo · mirrors MEMBER_PROMO in files.html so the pay link
// carries the agent's Stripe discount as well as the file id. Scoped by service
// so a code never misapplies to the wrong product at checkout.
const MEMBER_PROMO: Record<string, { code: string; services: string[] }> = {
  "2635cd0e-45ee-415e-b0d0-91251b5af6bf": { code: "SAMANTHA50", services: ["tc_one_side"] }, // Samantha Haringa · $50 off TC one side
};

const P = `font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;color:#000000;font-weight:400;line-height:1.55;margin:12px 0`;

// Bulletproof cream pill button — the background sits on a <td> so Gmail can't
// strip it (a plain <a> background gets dropped on render).
function payButton(address: string, payLink: string): string {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0"><tbody><tr><td bgcolor="#f1efe8" style="background-color:#f1efe8;border-radius:999px"><a href="${payLink}" target="_blank" style="display:inline-block;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:bold;color:#141210;text-decoration:none;padding:12px 24px">Pay for ${address}</a></td></tr></tbody></table>`;
}

// The approved post-closing payment email (Alex-voice branded template, cream
// pill, company sign-off, dark footer). rung 1 = day after closing, rung 2 =
// gentle nudge a week out. Short and to the point — the agent is expecting
// these, so no congratulations or filler.
function buildEmail(rung: number, first: string, address: string, payLink: string): { subject: string; text: string; html: string } {
  const lead = rung === 1
    ? { htmlLine: `<strong style="font-weight:bolder">${address}</strong> is closed and ready to settle up.`, textLine: `${address} is closed and ready to settle up.`, subject: `Your closing is ready to settle · ${address}` }
    : { htmlLine: `Just a quick nudge, the payment for <strong style="font-weight:bolder">${address}</strong> is still open on our end.`, textLine: `Just a quick nudge, the payment for ${address} is still open on our end.`, subject: `Still open · ${address}` };
  const text = `Hi ${first},\n\n${lead.textLine}\n\nYour link is tied to this property. Just tap to pay:\n${payLink}\n\nReply here once it is sent, so we can confirm on our end.\n\nThank you!\nThe Aari Transactions Team`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:0;background:#ffffff}p{margin:12px 0}</style></head><body>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;width:100%" bgcolor="#ffffff"><tbody><tr><td>`
    + `<div style="padding:0 0 24px 0;margin:0 auto;max-width:100%">`
    + `<div style="margin:20px auto"><center><table cellpadding="0" cellspacing="0" style="width:100%;margin:0 auto;max-width:100%"><tbody><tr>`
    + `<td width="100%" style="background-color:#FFFFFF;box-sizing:border-box" bgcolor="#FFFFFF"><div style="padding:26px 40px"><div style="margin-left:auto;margin-right:auto;max-width:600px">`
    + `<p style="${P}">Hi ${first},</p>`
    + `<p style="${P}">${lead.htmlLine}</p>`
    + `<p style="${P}">Your link is tied to this property, so it is already set. Just tap to pay.</p>`
    + payButton(address, payLink)
    + `<p style="${P}">Reply here once it is sent, so we can confirm on our end.</p>`
    + `<p style="font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;color:#000000;font-weight:400;line-height:1.55;margin:16px 0 12px">Thank you!<br>The Aari Transactions Team</p>`
    + `</div></div></td></tr></tbody></table></center></div>`
    + `<div style="margin:20px auto"><center><table cellpadding="0" cellspacing="0" style="width:100%;margin:0 auto;max-width:100%"><tbody><tr>`
    + `<td width="100%" style="background-color:#141210;box-sizing:border-box" bgcolor="#141210"><div style="padding:24px 40px"><div style="margin-left:auto;margin-right:auto;max-width:600px">`
    + `<p style="font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#ffffff;font-weight:400;line-height:1.7;text-align:center;margin:0"><strong style="font-weight:bolder">Aari Transactions</strong><br>Fort Myers &middot; Cape Coral &middot; Lehigh Acres &middot; Southwest Florida<br><a href="mailto:hello@aaritransactions.com" style="color:#ffffff;text-decoration:underline">hello@aaritransactions.com</a></p>`
    + `</div></div></td></tr></tbody></table></center></div>`
    + `</div></td></tr></tbody></table></body></html>`;
  return { subject: lead.subject, text, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Kill-switch · Marlenyi controls the arm/disarm from /files.html More menu
  // > Payment reminders. Column added in
  // 20260812_org_settings_payment_reminders_enabled.sql, default false so
  // redeploying this function never surprises anyone with a burst of emails.
  // We fetch the singleton row (id=1) and bail early on false or on any error
  // reading it — safer to skip a run than to send when we can't confirm the
  // flag.
  try {
    const { data: os, error: osErr } = await supabase
      .from("org_settings")
      .select("payment_reminders_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (osErr) {
      console.warn("[closed-payment-reminder] org_settings read failed, skipping run", osErr.message);
      return new Response(JSON.stringify({ ok: true, skipped: "org_settings_read_error" }), { status: 200 });
    }
    if (!os || os.payment_reminders_enabled !== true) {
      return new Response(JSON.stringify({ ok: true, skipped: "disabled_by_broker", sent: 0 }), { status: 200 });
    }
  } catch (e) {
    console.warn("[closed-payment-reminder] kill-switch check threw, skipping run", e);
    return new Response(JSON.stringify({ ok: true, skipped: "kill_switch_exception" }), { status: 200 });
  }

  // Two schema-alignment fixes vs the original (Marlenyi Aug 11):
  //   1. `closed_at` doesn't exist on public.files. The closing date lives in
  //      `actual_closing_date` (falls back to `closing_date` for legacy rows
  //      that never got actual_closing_date backfilled).
  //   2. `.eq("payment_confirmed", false)` matched nothing on TC files, because
  //      migration 20260607_payment_gate.sql defaults every TC file to
  //      payment_confirmed=true (they're billed at closing, not upfront). The
  //      real pending signal for TC files is payment_status='pending', which is
  //      what the manual "mark paid" flow flips. Filter on that instead.
  // The two together explain why this cron has been active but never sent a
  // single email (Samantha's 3815 NW 22nd Ter TC fee sat 5 days past close
  // with payment_reminder_count=0).
  const { data: files, error } = await supabase
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address, service_type, actual_closing_date, closing_date, payment_status, payment_reminder_last_sent_at")
    .eq("status", "closed")
    .eq("payment_status", "pending")
    .in("service_type", TC_SERVICES)
    .limit(200);

  if (error) {
    console.error("[closed-payment-reminder] query failed", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  let sent = 0;
  for (const f of files ?? []) {
    const baseLink = STRIPE_LINKS[f.service_type as string];
    if (!baseLink) continue; // no Stripe link for this service · skip silently

    // Tag the link so the webhook can match this file when the agent pays.
    // Without ?client_reference_id, the payment lands in Stripe untagged and
    // the file stays "pending" in Aari — the exact bug we're patching.
    const sep = baseLink.indexOf("?") === -1 ? "?" : "&";
    let payLink = `${baseLink}${sep}client_reference_id=${encodeURIComponent(f.id)}`;
    // Pre-apply the agent's member discount so the same link is both tagged and
    // discounted (mirrors paymentLinkFor in files.html).
    const mp = f.agent_id ? MEMBER_PROMO[f.agent_id as string] : undefined;
    if (mp && mp.services.includes(f.service_type as string)) {
      payLink += `&prefilled_promo_code=${encodeURIComponent(mp.code)}`;
    }

    // Closed timestamp source — prefer actual (title-confirmed), fall back to
    // scheduled closing_date for older rows that predate the actual field.
    const closedSource = f.actual_closing_date || f.closing_date;
    if (!closedSource) continue;
    const closedMs = new Date(closedSource).getTime();
    if (!Number.isFinite(closedMs)) continue;
    const hrs = (Date.now() - closedMs) / HOUR;

    // Which rung is due by window? (Day 14 is handled by the morning briefing.)
    let rung = 0, windowStartH = 0;
    if (hrs >= 20 && hrs <= 28) { rung = 1; windowStartH = 20; }
    else if (hrs >= 168 && hrs <= 192) { rung = 2; windowStartH = 168; }
    if (rung === 0) continue;

    // Dedup — skip if a send already landed in or after this rung's window.
    if (f.payment_reminder_last_sent_at &&
        new Date(f.payment_reminder_last_sent_at).getTime() >= closedMs + windowStartH * HOUR) {
      continue;
    }

    // Agent (recipient) + assigned TC (sender)
    const { data: agent } = await supabase.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
    if (!agent?.email) continue;
    let tcName = "Aari Transactions", tcEmail: string | undefined;
    if (f.assigned_tc_id) {
      const { data: tc } = await supabase.from("agents").select("first_name, last_name, email").eq("id", f.assigned_tc_id).maybeSingle();
      if (tc) { tcName = [tc.first_name, tc.last_name].filter(Boolean).join(" ").trim() || tcName; tcEmail = tc.email ?? undefined; }
    }

    const first = agent.first_name ?? "there";
    const address = f.property_address ?? "your closing";
    const { subject, text, html } = buildEmail(rung, first, address, payLink);

    try {
      await resend.emails.send({
        from: `Aari Transactions <${FROM_ADDR}>`,
        to: agent.email,
        reply_to: tcEmail ?? FROM_ADDR,
        subject,
        text,
        html,
      });
      await supabase.from("files")
        .update({ payment_reminder_last_sent_at: new Date().toISOString() })
        .eq("id", f.id);
      sent++;
    } catch (e) {
      console.warn("[closed-payment-reminder] send failed for", f.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
});
