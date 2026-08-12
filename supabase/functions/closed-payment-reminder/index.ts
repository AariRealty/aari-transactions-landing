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

// Eastern time-of-day greeting — mirrors getTimeOfDayGreeting in files.html
// (night fallback is "Good evening" per the Section 3 ruling).
function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

const D1_BODY = (first: string, payLink: string) =>
`${greeting()} ${first},

Your file just closed and I wanted to touch base on the TC service fee.

*Please use the link below to complete your payment at your earliest convenience.*

${payLink}`;

const D7_BODY = (first: string, payLink: string) =>
`${greeting()} ${first},

Just a reminder that the TC service fee for your recent closing is still outstanding.

*Please take a moment to complete your payment using the link below.*

${payLink}`;

function htmlWrap(text: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;color:#2c2c2a;max-width:520px;margin:0 auto;white-space:pre-line">${text.replace(/\*([^*]+)\*/g, "<strong>$1</strong>")}</div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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
    const payLink = `${baseLink}${sep}client_reference_id=${encodeURIComponent(f.id)}`;

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
    const text = rung === 1 ? D1_BODY(first, payLink) : D7_BODY(first, payLink);
    const subject = rung === 1
      ? `TC service fee · ${f.property_address ?? "your closing"}`
      : `Reminder · TC service fee · ${f.property_address ?? "your closing"}`;

    try {
      await resend.emails.send({
        from: `${tcName} <${FROM_ADDR}>`,
        to: agent.email,
        reply_to: tcEmail ?? FROM_ADDR,
        subject,
        text,
        html: htmlWrap(text),
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
