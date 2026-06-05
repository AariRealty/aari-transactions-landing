// Edge function: loan-deadline-ping (Post-Stage-8 · Fix 2 · June 2026)
// ============================================================================
// Daily 8am Eastern SMS escalation ladder for the loan approval deadline —
// the one deadline that can kill a deal (FAR/BAR Day 30 from Effective).
//
// Cron fires daily 12:00 + 13:00 UTC (+ :10 retry sweeps); the
// America/New_York hour gate below only lets a run proceed at 8am ET —
// DST-proof, same pattern as friday-summary.
//
// STAGE-AGNOSTIC (June 2026 advisor fix): the loan approval deadline doesn't
// care which kanban column the card sits in — a TC who never drags the card
// to Appraisal must still be pinged. For every ACTIVE FINANCED sale file
// where loan approval is NOT yet confirmed (logistics.loan_approval_status
// !== 'approved' AND loan_approval_confirmed = false; cash files excluded
// via the same detection the cockpit uses):
//   · exactly 5 days out  → "Push the lender daily."
//   · exactly 3 days out  → "Escalate now."
//   · 1 day out / due today → "Confirm written approval today."
//   · past deadline       → EVERY day: "Buyer written notice required today."
//
// SMS → assigned TC's phone (Twilio, same env as aari-sa-pdf-email).
// No assigned TC (or TC missing phone) → SMS goes to Marlenyi (role=broker).
// Dedup: loan_ping_last_sent_at — max one ping per file per ET day. The
// stamp is only written AFTER a successful send, so a Twilio failure leaves
// the file unstamped and the :10 retry sweep picks it up (~10-min retry).
// Invoke with {"force": true} to bypass the hour gate for testing.
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

// ---- FL deadline math · mirrors /js/deadline-engine.js (keep in sync) ----
const FED_HOLIDAYS = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03",
  "2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05",
  "2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
]);
const ymd = (d: Date) => d.toLocaleDateString("en-CA");
function flBusinessDay(d: Date): Date {
  const x = new Date(d.getTime());
  for (let i = 0; i < 10; i++) {
    const day = x.getDay();
    if (day !== 0 && day !== 6 && !FED_HOLIDAYS.has(ymd(x))) return x;
    x.setDate(x.getDate() + 1);
  }
  return x;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base.getTime()); d.setDate(d.getDate() + n); return d;
}
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}

// ---- time helpers (America/New_York) ----
function nyHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })
    .formatToParts(new Date());
  return parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
}
function nyToday(): Date {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setHours(0, 0, 0, 0);
  return et;
}
const nyDayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// ---- Active financed sale file? · stage-agnostic ----
// deno-lint-ignore no-explicit-any
function isActiveSaleFile(f: any): boolean {
  if ((f.file_type || "sale") !== "sale") return false;
  if (["closed", "cancelled", "archived"].includes(f.status)) return false;
  if (f.transaction_stage === "closed") return false;
  return true;
}
// Cash detection · mirrors isCashFile in files.html (keep in sync).
// deno-lint-ignore no-explicit-any
function isCashFile(f: any): boolean {
  const raw = (f.raw_form_data && typeof f.raw_form_data === "object") ? f.raw_form_data : {};
  if (raw.lender_is_cash === "1" || raw.lender_is_cash === 1 || raw.lender_is_cash === true) return true;
  if (raw.financing_type === "cash" || raw.cash_offer === "yes") return true;
  if (!f.lender_contact && !raw.lender_name && !raw.pa_lender) return true;
  return false;
}

const fmtD = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) { console.error("[loan-ping] Twilio env missing"); return false; }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    });
    if (!res.ok) { console.error("[loan-ping] Twilio", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[loan-ping] Twilio fetch failed", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let force = false;
  try { const b = await req.json(); force = !!b?.force; } catch { /* cron sends {} */ }

  const hour = nyHour();
  if (!force && hour !== 8) {
    return json({ ok: true, skipped: "outside_window", ny_hour: hour });
  }

  const today = nyToday();
  const dayKey = nyDayKey();

  const { data: files, error: fErr } = await supabaseAdmin
    .from("files")
    .select("id, property_address, file_type, status, transaction_stage, effective_date, closing_date, deadline_overrides, logistics, loan_approval_confirmed, loan_ping_last_sent_at, assigned_tc_id, raw_form_data, lender_contact")
    .not("status", "in", '("closed","cancelled","archived")');
  if (fErr) return json({ ok: false, error: fErr.message }, 500);

  // Broker fallback phones · also the recipient for unassigned files.
  const { data: brokers } = await supabaseAdmin
    .from("agents").select("phone").eq("role", "broker").not("phone", "is", null);
  const brokerPhones = (brokers ?? []).map(b => b.phone as string).filter(Boolean);

  const tcPhones: Record<string, string | null> = {};
  const results: Record<string, string> = {};
  let sent = 0, failed = 0;

  for (const f of files ?? []) {
    if (!isActiveSaleFile(f)) continue;
    if (isCashFile(f)) continue; // no loan, no ping

    // Approved? · the cockpit's loan widget writes logistics.loan_approval_status;
    // loan_approval_confirmed is the manual/SQL off-switch. Either silences pings.
    const lg = (f.logistics && typeof f.logistics === "object") ? f.logistics : {};
    if (lg.loan_approval_status === "approved" || f.loan_approval_confirmed) continue;

    // Loan approval deadline · manual override wins, else Effective+30 FL-rolled.
    const ov = (f.deadline_overrides && typeof f.deadline_overrides === "object") ? f.deadline_overrides : {};
    let dl = parseDate(ov.loan_approval ?? null);
    if (!dl) {
      const eff = parseDate(f.effective_date ? String(f.effective_date).slice(0, 10) : null);
      if (!eff) continue;
      dl = flBusinessDay(addDays(eff, 30));
    }
    dl.setHours(0, 0, 0, 0);
    const days = Math.round((dl.getTime() - today.getTime()) / 86400000);

    // Ladder: exactly 5 · exactly 3 · 1/0 (due) · every day once overdue.
    let action: string | null = null;
    if (days === 5) action = "Push the lender daily.";
    else if (days === 3) action = "Escalate now.";
    else if (days === 1 || days === 0) action = "Confirm written approval today.";
    else if (days < 0) action = "Buyer written notice required today.";
    if (!action) continue;

    // Dedup · one ping per file per ET day.
    if (f.loan_ping_last_sent_at &&
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(f.loan_ping_last_sent_at)) === dayKey) {
      results[f.id] = "deduped"; continue;
    }

    const street = (f.property_address || "Untitled file").split(",")[0].trim();
    const when = days < 0
      ? `passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (${fmtD(dl)})`
      : days === 0 ? `is TODAY (${fmtD(dl)})`
      : `in ${days} day${days === 1 ? "" : "s"} (${fmtD(dl)})`;
    const body = `Aari · ${street} — loan approval deadline ${when}. ${action}`;

    // Recipient · assigned TC's phone, else broker (Marlenyi).
    let phones: string[] = [];
    if (f.assigned_tc_id) {
      if (!(f.assigned_tc_id in tcPhones)) {
        const { data: tc } = await supabaseAdmin
          .from("agents").select("phone").eq("id", f.assigned_tc_id).single();
        tcPhones[f.assigned_tc_id] = tc?.phone ?? null;
      }
      const p = tcPhones[f.assigned_tc_id];
      if (p) phones = [p];
    }
    if (!phones.length) phones = brokerPhones; // unassigned or TC has no phone

    if (!phones.length) { results[f.id] = "no_recipient"; failed++; continue; }

    let okAll = true;
    for (const p of phones) {
      const ok = await sendSms(p, body);
      if (!ok) okAll = false;
    }

    if (okAll) {
      await supabaseAdmin.from("files")
        .update({ loan_ping_last_sent_at: new Date().toISOString() })
        .eq("id", f.id);
      results[f.id] = `sent_${days}d`;
      sent++;
    } else {
      // No stamp → the :10 retry sweep re-attempts this file (~10-min retry).
      results[f.id] = "sms_failed";
      failed++;
    }
  }

  return json({ ok: true, sent, failed, results });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
