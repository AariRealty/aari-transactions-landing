// Edge function: broker-review-ping (July 2026)
// ============================================================================
// Broker compliance-review checkpoints. Marlenyi offers file review on every
// transaction, and that only scales if the system tells her when to look.
//
// For every ACTIVE transaction (effective + closing date set, not closed /
// cancelled / archived), three one-shot checkpoints fire to the broker's
// notification bell AND phone (the tc_notifications insert trips
// trg_push_on_notification, which calls send-web-push — no extra send here):
//
//   1. broker_review_intake   · first look, 2 business days after we get the
//                               file (max of created / effective, +2 biz).
//   2. broker_review_mid      · mid transaction, at the inspection deadline
//                               (explicit _dates.inspection_end override, else
//                               effective + inspection_days [default 15], FL-
//                               rolled). Falls back to the calendar midpoint
//                               between effective and closing if no inspection.
//   3. broker_review_preclose · 7 calendar days before closing.
//
// Cron fires daily 15:00 + 16:00 UTC (+ :10 retry sweeps); the America/New_York
// hour gate only lets a run proceed at 11am ET — DST-proof, same pattern as
// loan-deadline-ping.
//
// Dedup is by existence: one row per (recipient, file, kind) ever. A checkpoint
// only fires inside a 0..3 day window after its date, so:
//   · downtime up to 3 days is still caught, and
//   · files already past a checkpoint by >3 days on first deploy are NOT
//     back-filled (no notification flood).
//
// Invoke {"force": true} to bypass the hour gate, {"dry_run": true} to compute
// what WOULD fire without inserting anything.
// ============================================================================

import { createClient } from "supabase";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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
  const d = new Date(String(s).slice(0, 10) + "T12:00:00");
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
const fmtD = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

// deno-lint-ignore no-explicit-any
function isActiveTxn(f: any): boolean {
  if (["closed", "cancelled", "archived"].includes(f.status)) return false;
  if (f.transaction_stage === "closed") return false;
  return true;
}

// Inspection-day count · TC-entered logistics value, else extracted, else 15.
// deno-lint-ignore no-explicit-any
function inspectionDays(f: any): number {
  const lg = (f.logistics && typeof f.logistics === "object") ? f.logistics : {};
  const exf = (((f.raw_form_data || {}).extracted_contract || {}).fields) || {};
  const raw = (lg.inspection_days != null && lg.inspection_days !== "") ? lg.inspection_days : exf.inspection_days;
  if (raw == null || raw === "") return 15;
  const n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 15 : n;
}

// The three checkpoint dates for a file, or null where not derivable.
// deno-lint-ignore no-explicit-any
function checkpoints(f: any): { kind: string; title: string; body: (street: string) => string; date: Date | null }[] {
  const eff = parseDate(f.effective_date ?? null);
  const C = parseDate(f.closing_date ?? null);
  const created = parseDate(f.created_at ? String(f.created_at).slice(0, 10) : null);

  // 1. Intake · 2 business days after the later of (created, effective).
  let base: Date | null = null;
  if (created && eff) base = created.getTime() > eff.getTime() ? created : eff;
  else base = eff || created;
  const intake = base ? flBusinessDay(addDays(base, 2)) : null;

  // 2. Mid · inspection deadline. Explicit override date wins; else eff+inspDays
  //    FL-rolled; else calendar midpoint between effective and closing.
  const ov = (f.deadline_overrides && typeof f.deadline_overrides === "object") ? f.deadline_overrides : {};
  const ovDates = (ov._dates && typeof ov._dates === "object") ? ov._dates : {};
  let mid: Date | null = parseDate(ovDates.inspection_end ?? null);
  if (!mid && eff) mid = flBusinessDay(addDays(eff, inspectionDays(f)));
  if (!mid && eff && C) mid = new Date((eff.getTime() + C.getTime()) / 2);

  // 3. Pre-close · 7 calendar days before closing.
  const pre = C ? addDays(C, -7) : null;

  return [
    { kind: "broker_review_intake",   title: "New file · compliance check",
      body: (s) => `${s} just came in. Give it your first compliance look while the file is fresh.`, date: intake },
    { kind: "broker_review_mid",      title: "Mid transaction · compliance check",
      body: (s) => `${s} is at its inspection deadline. Good point for your mid file review.`, date: mid },
    { kind: "broker_review_preclose", title: "Closing in 7 days · compliance check",
      body: (s) => `${s} closes ${C ? fmtD(C) : "soon"}. Final compliance pass before it funds.`, date: pre },
  ];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let force = false, dryRun = false;
  try { const b = await req.json(); force = !!b?.force; dryRun = !!b?.dry_run; } catch { /* cron sends {} */ }

  const hour = nyHour();
  if (!force && hour !== 11) return json({ ok: true, skipped: "outside_window", ny_hour: hour });

  const today = nyToday();

  const { data: files, error: fErr } = await supabaseAdmin
    .from("files")
    .select("id, property_address, file_type, status, transaction_stage, created_at, effective_date, closing_date, deadline_overrides, logistics, raw_form_data")
    .not("status", "in", '("closed","cancelled","archived")')
    .not("effective_date", "is", null)
    .not("closing_date", "is", null);
  if (fErr) return json({ ok: false, error: fErr.message }, 500);

  const { data: brokers, error: bErr } = await supabaseAdmin
    .from("agents").select("id").eq("role", "broker");
  if (bErr) return json({ ok: false, error: bErr.message }, 500);
  const brokerIds = (brokers ?? []).map(b => b.id as string).filter(Boolean);
  if (!brokerIds.length) return json({ ok: false, error: "no_broker_recipient" }, 500);

  // Existence dedup · one row per (recipient, file, kind) ever.
  const { data: existing } = await supabaseAdmin
    .from("tc_notifications")
    .select("recipient_id, file_id, kind")
    .like("kind", "broker_review_%");
  const seen = new Set((existing ?? []).map(r => `${r.recipient_id}|${r.file_id}|${r.kind}`));

  const dd = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
  const rows: { recipient_id: string; file_id: string; kind: string; title: string; body: string }[] = [];
  const would: string[] = [];

  for (const f of files ?? []) {
    if (!isActiveTxn(f)) continue;
    const street = (f.property_address || "Untitled file").split(",")[0].trim();
    for (const cp of checkpoints(f)) {
      if (!cp.date) continue;
      const gap = dd(today, cp.date);
      if (gap < 0 || gap > 3) continue; // only inside the 0..3 day window
      for (const rid of brokerIds) {
        const key = `${rid}|${f.id}|${cp.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ recipient_id: rid, file_id: f.id, kind: cp.kind, title: cp.title, body: cp.body(street) });
        would.push(`${street} · ${cp.kind} (${fmtD(cp.date)})`);
      }
    }
  }

  if (dryRun) return json({ ok: true, dry_run: true, would_fire: would, count: rows.length });
  if (!rows.length) return json({ ok: true, sent: 0, results: [] });

  const { error: iErr } = await supabaseAdmin.from("tc_notifications").insert(rows);
  if (iErr) return json({ ok: false, error: iErr.message }, 500);

  return json({ ok: true, sent: rows.length, results: would });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
