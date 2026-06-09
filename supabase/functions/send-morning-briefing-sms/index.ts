// ============================================================================
// Aari Transactions · send-morning-briefing-sms
// ============================================================================
// Fires daily at 8 AM ET via pg_cron. Composes the broker's morning briefing
// and sends it as an SMS through Quo.
//
// Schedule strategy:
//   pg_cron runs at 12 UTC and 13 UTC (covers 8 AM ET in both EDT and EST).
//   This function gates internally on the actual ET hour and on a
//   "already sent today" check in sms_log so DST transitions don't double-send.
//
// Body shape:
//   Aari Morning Briefing · Mon 5/18
//
//   START HERE: 1422 Maple Ave · emergency lane · closes Thu.
//
//   3 deals need attention · 5 follow-ups ready
//
//   aaritransactions.com/briefing.html
//
// Auth: callable by pg_cron with service role. No user auth required.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendQuoSms } from "../_shared/quo-sms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZ = "America/New_York";
const SEND_HOUR_ET = 8;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";  // bypass hour + idempotency for manual test

  // ---- Gate 1 · only fire at 8 AM ET (skip otherwise) -------------------
  if (!force) {
    const etHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, hour: "numeric", hour12: false,
      }).format(new Date()),
      10,
    );
    if (etHour !== SEND_HOUR_ET) {
      return j(200, { ok: true, skipped: true, reason: "not_8am_et", current_et_hour: etHour });
    }
  }

  // ---- Get broker recipient ---------------------------------------------
  const { data: broker, error: brokerErr } = await admin
    .from("agents")
    .select("id, first_name, phone, sms_opt_in")
    .eq("role", "broker")
    .limit(1)
    .maybeSingle();

  if (brokerErr || !broker) {
    return j(500, { ok: false, error: "no_broker_row" });
  }
  if (!broker.phone) {
    return j(200, { ok: false, error: "broker_no_phone", broker_id: broker.id });
  }
  if (broker.sms_opt_in === false) {
    return j(200, { ok: true, skipped: true, reason: "broker_opted_out" });
  }

  // ---- Gate 2 · idempotent (don't double-send if cron fires twice) ------
  if (!force) {
    const todayET = formatDateET(new Date());  // e.g. "2026-05-18"
    const { data: existing } = await admin
      .from("sms_log")
      .select("id")
      .eq("to_phone", broker.phone)
      .eq("status", "sent")
      .gte("created_at", todayET + "T00:00:00Z")
      .like("body", "Aari Morning Briefing%")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return j(200, { ok: true, skipped: true, reason: "already_sent_today" });
    }
  }

  // ---- Pull files · same ranking as briefing.html -----------------------
  const { data: files } = await admin
    .from("files")
    .select("id, property_address, closing_date, priority, priority_reason, status, updated_at")
    .not("status", "in", "(closed,archived)")
    .order("created_at", { ascending: false })
    .limit(50);

  const todayDate = new Date();
  const todayStr = formatDateET(todayDate);
  const today0 = new Date(todayStr + "T00:00:00");

  type Scored = { f: FileRow; score: number; reasons: string[] };
  const scored: Scored[] = (files ?? []).map((f: FileRow) => {
    let score = 0;
    const reasons: string[] = [];
    if (f.priority === "emergency") { score += 100; reasons.push(f.priority_reason ?? "emergency lane"); }
    if (f.status === "awaiting_broker_review") { score += 80; reasons.push("awaiting broker review"); }
    if (f.status === "awaiting_signatures") { score += 40; reasons.push("needs signatures"); }
    if (f.status === "awaiting_docs") { score += 30; reasons.push("docs pending"); }
    if (f.closing_date) {
      const close = new Date(f.closing_date + "T00:00:00");
      const days = Math.ceil((close.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));
      if (days < 0) { score += 90; reasons.push("past closing date"); }
      else if (days <= 3 && f.priority !== "emergency") { score += 70; reasons.push(`closes in ${days}d`); }
      else if (days <= 7 && f.priority !== "emergency") { score += 50; reasons.push(`closes in ${days}d`); }
    }
    if (f.updated_at) {
      const hrs = (Date.now() - new Date(f.updated_at).getTime()) / (1000 * 60 * 60);
      if (hrs > 48 && ["awaiting_signatures","awaiting_docs","awaiting_broker_review"].includes(f.status)) {
        score += 25;
        reasons.push(`${Math.floor(hrs/24)}d stale`);
      }
    }
    return { f, score, reasons };
  })
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score);

  // ---- Day-14 unpaid TC fee (Section 5) ---------------------------------
  // Closed files 14+ days past closing with an outstanding TC service fee
  // (non-upfront service) surface as DO FIRST. Upfront services pay before
  // work, so they are excluded here.
  const UPFRONT_SERVICES = ["listing_docs", "listing_coordinator", "mls_setup", "offer_prep", "file_organization"];
  const { data: unpaidFiles } = await admin
    .from("files")
    .select("id, property_address, client_name, service_type, closed_at, payment_confirmed, agent_id")
    .eq("status", "closed")
    .eq("payment_confirmed", false)
    .not("closed_at", "is", null)
    .limit(100);
  (unpaidFiles ?? []).forEach((u: any) => {
    if (UPFRONT_SERVICES.indexOf(u.service_type) !== -1) return;
    const days = Math.floor((Date.now() - new Date(u.closed_at).getTime()) / (1000 * 60 * 60 * 24));
    if (days < 14) return;
    const agentName = u.client_name ?? "Agent";
    const addr = u.property_address ?? ("File " + String(u.id).slice(0, 4).toUpperCase());
    scored.unshift({ f: u as FileRow, score: 95, reasons: [`TC fee unpaid — ${agentName} · ${addr} · 14 days past closing`] });
  });
  scored.sort((a, b) => b.score - a.score);

  // ---- Pull follow-up count ---------------------------------------------
  const { count: followupCount } = await admin
    .from("crm_followups_cache")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", broker.id);

  // ---- Compose SMS body -------------------------------------------------
  const dateLabel = formatShortDateET(todayDate);   // "Mon 5/18"
  const top = scored[0];
  const dealCount = scored.length;
  const fuCount = followupCount ?? 0;

  let startLine: string;
  if (top) {
    const addr = top.f.property_address ?? "File " + top.f.id.slice(0, 4).toUpperCase();
    startLine = `START HERE: ${addr} · ${top.reasons.slice(0, 2).join(" · ")}.`;
  } else {
    startLine = "All active files are on track today.";
  }

  const body = [
    `Aari Morning Briefing · ${dateLabel}`,
    ``,
    startLine,
    ``,
    `${dealCount} deal${dealCount === 1 ? "" : "s"} need attention · ${fuCount} follow-up${fuCount === 1 ? "" : "s"} ready`,
    ``,
    `aaritransactions.com/briefing.html`,
  ].join("\n");

  // ---- Send via Quo ------------------------------------------------------
  // Use the Aari Realty number for the morning briefing (broker-to-broker,
  // personal cadence). Falls back to QUO_FROM_NUMBER if the secret isn't set.
  const result = await sendQuoSms({
    to: broker.phone,
    body,
    from: Deno.env.get("AARI_REALTY_FROM_NUMBER") || undefined,
    sourceContext: {
      template: "morning_briefing",
      agent_id: broker.id,
      sent_date_et: todayStr,
      deal_count: dealCount,
      followup_count: fuCount,
      top_file_id: top?.f.id ?? null,
    },
  });

  return j(result.ok ? 200 : 500, {
    ok: result.ok,
    sent_to: broker.phone,
    body_preview: body,
    quo_message_id: result.messageId,
    error: result.error,
  });
});

// ---- Helpers ---------------------------------------------------------------

interface FileRow {
  id: string;
  property_address: string | null;
  closing_date: string | null;
  priority: string | null;
  priority_reason: string | null;
  status: string;
  updated_at: string | null;
}

function formatDateET(d: Date): string {
  // YYYY-MM-DD in America/New_York
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function formatShortDateET(d: Date): string {
  // "Mon 5/18"
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric", day: "numeric" }).format(d);
  return `${weekday} ${monthDay}`;
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
