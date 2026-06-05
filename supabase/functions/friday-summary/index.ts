// Edge function: friday-summary (Agent portal · Item 5 · June 2026)
// ============================================================================
// FULLY AUTOMATIC weekly agent summary. No TC review, no send button, no
// manual action — ever (Marlenyi's rule, June 2026).
//
// Cron fires Fridays at 12:00 + 13:00 UTC (and :15 retry sweeps). The hour
// gate below only lets a run proceed when it is 8am in America/New_York —
// DST-proof without cron timezone support. friday_summary_sent_at makes
// every extra invocation a no-op, so the :15 sweeps only pick up failures.
//
// One combined email per opted-in agent covering all active files. Agents
// with no active files are skipped silently. Reply-to = assigned TC.
// Invoke with {"force": true} to bypass the hour gate for testing.
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://aaritransactions.com";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";

// ---- Plain-English task labels (mirrors STAGE_CHECKLISTS in files.html) ----
const TASK_LABELS: Record<string, string> = {
  "new_file_received": "Confirm file received and all required documents uploaded",
  "new_contract_attached": "Verify executed contract is attached",
  "new_effective_confirmed": "Identify and confirm Effective Date from contract",
  "new_closing_confirmed": "Identify and confirm Closing Date from contract",
  "new_deadlines_calculated": "Calculate all deadlines from Effective Date",
  "wtc_contract_review": "TC reviews full contract — all parties, dates, deadlines confirmed",
  "wtc_deadlines_verified": "Verify all auto-calculated deadlines are correct",
  "wtc_contacts_complete": "Confirm all party contact information is complete",
  "wtc_opening_email": "Send opening email to all parties",
  "wtc_escrow_agent": "Confirm escrow agent name, address, phone, and email on file",
  "wtc_escrow_instructions": "Send escrow opening instructions to title company",
  "wtc_hoa_initiated": "HOA status confirmed — if yes, initiate HOA document request",
  "wtc_survey_requested": "Request existing survey from seller if available",
  "wtc_title_policy_requested": "Request existing title insurance copy from seller if available",
  "uc_emd_verify": "Verify EMD amount and due date match the contract",
  "uc_emd_followup": "Follow up with title — confirm initial EMD received",
  "uc_emd_confirmed": "EMD status set to \"Confirmed in Writing\"",
  "uc_addl_followup": "Confirm additional deposit received",
  "uc_loan_app": "Confirm buyer submitted loan application",
  "uc_lender_followup": "Follow up with lender — loan in process + appraisal will be ordered",
  "uc_hoa_docs": "Request HOA documents from management company",
  "uc_tenant_lease": "Confirm seller provided lease info — if tenant occupied",
  "uc_weekly_update": "Send weekly update email to agent — every Friday",
  "insp_scheduled": "Confirm inspection is scheduled — inspector name, date, time",
  "insp_reminder_sent": "Send inspection reminder to buyer&rsquo;s agent — 24 hours before inspection",
  "insp_deadline_watch": "Inspection period deadline — confirm everyone knows the date",
  "insp_decision_followup": "Follow up with buyer&rsquo;s agent — proceeding or canceling?",
  "insp_proceed_notice": "If proceeding — confirm written notice to seller before deadline",
  "insp_cancel_notice": "If canceling — confirm written notice to seller before deadline",
  "insp_deposit_return": "If canceling — initiate deposit return process with title company",
  "insp_permits": "Follow up on any open permit issues identified during inspection",
  "insp_lender_update": "Follow up with lender — update on loan status",
  "insp_weekly_update": "Send weekly update email to agent — every Friday",
  "rem_asis_accepted": "Confirm buyer has accepted property AS-IS in writing",
  "rem_addendum_confirmed": "Credit/concession negotiated — confirm addendum executed by ALL parties",
  "rem_permits_followup": "Open permit issues — follow up on resolution status",
  "rem_lender_progress": "Follow up with lender — loan progressing + appraisal ordered",
  "rem_title_search": "Follow up with title — confirm title search in progress",
  "rem_weekly_update": "Send weekly update email to agent — every Friday",
  "app_ordered": "Confirm appraisal ordered by lender — get it in writing",
  "app_status_followup": "Follow up with lender — appraisal completed + results received",
  "app_deadline_watch": "Loan approval deadline — Day 30 from Effective Date",
  "app_satisfactory_confirm": "At/above value — confirm with lender in writing appraisal is satisfactory",
  "app_final_approval_followup": "At/above value — follow up on final loan approval status",
  "app_low_notify": "Below value — notify BOTH agents immediately, in writing",
  "app_low_decision": "Below value — document buyer/seller decision in writing",
  "app_low_addendum": "Below value — if price reduction agreed, confirm executed addendum by ALL parties",
  "app_low_deposit_return": "Below value — if cancellation, initiate deposit return with title",
  "app_loan_approved": "Loan approval received from lender IN WRITING before Day 30",
  "app_no_approval_notice": "No approval by deadline — confirm buyer&rsquo;s written notice to seller TODAY",
  "app_title_commitment": "Follow up with title — commitment on track",
  "app_weekly_update": "Send weekly update email to agent — every Friday",
  "ctc_loan_written": "Loan approval in writing ON FILE — nothing proceeds without it",
  "ctc_title_commitment_received": "Title commitment received",
  "ctc_title_review": "Review title commitment for exceptions or issues",
  "ctc_title_exceptions_notify": "Title exceptions — notify agents and parties IMMEDIATELY, in writing",
  "ctc_title_exceptions_resolved": "Confirm ALL title exceptions resolved before closing",
  "ctc_cd_received": "Closing disclosure received from lender — confirm CFPB 3-day clock",
  "ctc_closing_confirmed": "Closing date, time, and location confirmed with ALL parties",
  "ctc_walkthrough": "Walk-through scheduled — day before or day of closing",
  "ctc_estoppels": "Estoppel letters received from all tenants",
  "ctc_fincen": "FinCEN report prepared by closing agent — entity buyer",
  "ctc_firpta": "FIRPTA certification or withholding certificate on file — foreign seller",
  "ctc_48hr_reminder": "Send 48-hour closing reminder to all parties",
  "ctc_weekly_update": "Send weekly update email to agent — every Friday",
  "cl_funds_recorded": "Confirm all closing funds collected and deed recorded — written confirmation from title",
  "cl_keys": "Confirm keys delivered to buyer",
  "cl_personal_property": "Confirm all personal property per contract on premises — seller removed all trash and personal items",
  "cl_docs_filed": "Confirm closing documents received and filed — executed deed, settlement statement, all addenda",
  "cl_congrats_agent": "Send closing congratulations email to agent",
  "cl_confirm_parties": "Send closing confirmation to all parties",
  "cl_google_review": "Request Google review from agent — send review link",
  "cl_closed_stamp": "Closed date stamped on file — automatic",
  "cl_review_24h": "24-hour post-closing review request — automatic",
  "cl_archive": "Archive file — mark as closed in system"
};

const STAGE_LABELS: Record<string, string> = {
  new: "New", waiting_for_tc: "Waiting for TC", under_contract: "Under Contract",
  inspection: "Inspection", remedy: "Remedy", appraisal: "Appraisal",
  ctc: "Clear to Close", closed: "Closed",
};

// ---- FL deadline engine · server-side port of /js/deadline-engine.js ----
const FED_HOLIDAYS = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03",
  "2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05",
  "2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
]);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function flBusinessDay(d: Date): Date {
  const x = new Date(d.getTime());
  for (let i = 0; i < 10; i++) {
    const day = x.getUTCDay();
    if (day !== 0 && day !== 6 && !FED_HOLIDAYS.has(ymd(x))) return x;
    x.setUTCDate(x.getUTCDate() + 1);
  }
  return x;
}
const addDays = (b: Date, n: number) => { const d = new Date(b.getTime()); d.setUTCDate(d.getUTCDate() + n); return d; };
const parseDate = (s: string | null) => { if (!s) return null; const d = new Date(s + "T12:00:00Z"); return isNaN(d.getTime()) ? null : d; };
const DEADLINE_DEFS = [
  { key: "emd_initial",      label: "Initial deposit due",       from: "effective", offset: 3 },
  { key: "loan_app",         label: "Loan application due",      from: "effective", offset: 5 },
  { key: "emd_additional",   label: "Additional deposit due",    from: "effective", offset: 10 },
  { key: "inspection_end",   label: "Inspection period ends",    from: "effective", offset: 15 },
  { key: "loan_approval",    label: "Loan approval deadline",    from: "effective", offset: 30 },
  { key: "title_commitment", label: "Title commitment deadline", from: "closing",   offset: -15 },
  { key: "estoppel",         label: "Estoppel letter deadline",  from: "closing",   offset: -10 },
  { key: "survey",           label: "Survey deadline",           from: "closing",   offset: -5 },
  { key: "walkthrough",      label: "Walk-through",              from: "closing",   offset: -1 },
];
// deno-lint-ignore no-explicit-any
function fileDeadlines(file: any): { label: string; date: Date }[] {
  const eff = parseDate(file.effective_date);
  const close = parseDate(file.closing_date);
  const ov = (file.deadline_overrides && typeof file.deadline_overrides === "object") ? file.deadline_overrides : {};
  const out: { label: string; date: Date }[] = [];
  for (const def of DEADLINE_DEFS) {
    if (ov[def.key]) {
      const od = parseDate(ov[def.key]);
      if (od) { out.push({ label: def.label, date: od }); continue; }
    }
    const base = def.from === "effective" ? eff : close;
    if (!base) continue; // missing date · skip, never crash
    out.push({ label: def.label, date: flBusinessDay(addDays(base, def.offset)) });
  }
  return out;
}

// ---- time helpers (America/New_York) ----
function nyParts(): { hour: number; dow: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false, weekday: "short" });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.find(p => p.type === "weekday")?.value ?? "Fri"] ?? 5;
  return { hour, dow };
}
function lastMondayEt(): Date {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const back = (et.getDay() + 6) % 7;
  et.setDate(et.getDate() - back);
  et.setHours(0, 0, 0, 0);
  return et;
}

const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtD = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// deno-lint-ignore no-explicit-any
function stageOf(f: any): string {
  const s = (f.transaction_stage || "").toLowerCase();
  if (STAGE_LABELS[s]) return s;
  if (f.status === "closed" || f.status === "archived") return "closed";
  if (f.assigned_tc_id && !f.tc_accepted_at) return "waiting_for_tc";
  return "new";
}

Deno.serve(async (req) => {
  let force = false;
  try { const b = await req.json(); force = !!b?.force; } catch { /* cron sends {} */ }

  const { hour, dow } = nyParts();
  if (!force && (dow !== 5 || hour !== 8)) {
    return json({ ok: true, skipped: "outside_window", ny_hour: hour, ny_dow: dow });
  }

  const { data: agents, error: agErr } = await supabaseAdmin
    .from("agents")
    .select("id, first_name, email, weekly_digest_opt_in, role")
    .eq("weekly_digest_opt_in", true)
    .eq("role", "agent")
    .not("email", "is", null);
  if (agErr) return json({ ok: false, error: agErr.message }, 500);

  const weekStart = lastMondayEt();
  const cutoff = new Date(Date.now() - 6 * 86400000); // dedup window
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  let sent = 0, skipped = 0, failed = 0;

  for (const agent of agents ?? []) {
    try {
      const { data: files } = await supabaseAdmin
        .from("files")
        .select("id, property_address, transaction_stage, status, tc_accepted_at, assigned_tc_id, closing_date, effective_date, deadline_overrides, stage_tasks, friday_summary_sent_at")
        .eq("agent_id", agent.id)
        .not("status", "in", '("closed","cancelled","archived")');
      const active = (files ?? []).filter(f =>
        !f.friday_summary_sent_at || new Date(f.friday_summary_sent_at) < cutoff);
      if (!active.length) { skipped++; continue; }

      let tc: { first_name: string; last_name: string; email: string; phone: string | null } | null = null;
      const tcId = active.find(f => f.assigned_tc_id)?.assigned_tc_id;
      if (tcId) {
        const { data } = await supabaseAdmin.from("agents")
          .select("first_name, last_name, email, phone").eq("id", tcId).single();
        tc = data ?? null;
      }
      const tcName = tc ? (tc.first_name + " " + tc.last_name).trim() : "Your Aari team";
      const tcPhone = (tc && tc.phone) || "239.688.1770";

      const blocks = active.map(f => {
        const stage = STAGE_LABELS[stageOf(f)] ?? "In progress";
        let dtc = "";
        if (f.closing_date) {
          const cd = new Date(f.closing_date + "T00:00:00Z");
          const days = Math.round((cd.getTime() - today.getTime()) / 86400000);
          dtc = days <= 7 ? "Closing this week" : days + " days to close";
        }
        const dt = (f.stage_tasks && typeof f.stage_tasks === "object") ? f.stage_tasks : {};
        const done = Object.keys(dt)
          .filter(k => dt[k]?.at && new Date(dt[k].at) >= weekStart && TASK_LABELS[k])
          .map(k => TASK_LABELS[k]);
        const doneHtml = done.length
          ? '<ul style="margin:6px 0 0;padding-left:18px">' + done.map(l => '<li style="margin:2px 0">' + esc(l) + "</li>").join("") + "</ul>"
          : '<p style="margin:6px 0 0;color:#6b6b6b">Your TC is working behind the scenes on your file.</p>';
        const upcoming = fileDeadlines(f)
          .filter(d => d.date.getTime() >= today.getTime())
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 2)
          .map(d => {
            const days = Math.round((d.date.getTime() - today.getTime()) / 86400000);
            const urgent = days <= 3;
            return '<li style="margin:2px 0;' + (urgent ? "color:#9a3a2c;font-weight:600" : "") + '">' + esc(d.label) + " " + fmtD(d.date) + (urgent ? " · urgent" : "") + "</li>";
          }).join("");
        return '<div style="border:1px solid #e8e4db;border-radius:10px;margin:0 0 16px;overflow:hidden">' +
          '<div style="background:#0f0f0f;color:#fff;padding:12px 16px">' +
          '<div style="font-size:14px;font-weight:600">' + esc(f.property_address || "Your file") + "</div>" +
          '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">' + esc(stage) + (dtc ? " · " + esc(dtc) : "") + "</div>" +
          "</div>" +
          '<div style="padding:12px 16px;font-size:13px;color:#0f0f0f">' +
          '<div style="font-size:11px;letter-spacing:0.5px;color:#888;text-transform:uppercase">Completed this week</div>' +
          doneHtml +
          (upcoming ? '<div style="font-size:11px;letter-spacing:0.5px;color:#888;text-transform:uppercase;margin-top:12px">Coming up</div><ul style="margin:6px 0 0;padding-left:18px">' + upcoming + "</ul>" : "") +
          "</div></div>";
      }).join("");

      const subject = active.length === 1
        ? "Your weekly update — " + (active[0].property_address || "your file")
        : "Your weekly update — " + active.length + " active files";
      const html = '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f0f0f">' +
        '<p style="font-size:14px">Hi ' + esc(agent.first_name || "there") + ", here is where everything stands this week:</p>" +
        blocks +
        '<p style="font-size:12px;color:#6b6b6b">Questions? Reply to this email or message your TC directly.<br>' +
        esc(tcName) + " · " + esc(tcPhone) + "</p>" +
        '<p style="font-size:11px;color:#9a9a9a"><a href="' + SITE + '/portal" style="color:#9a9a9a">Manage your preferences</a> · ' +
        '<a href="' + SITE + '/portal" style="color:#9a9a9a">Unsubscribe</a> (turn off the Friday update in your portal settings)</p></div>';

      const ok = await sendResend({ to: agent.email!, subject, html, replyTo: (tc && tc.email) || undefined });
      if (!ok) { failed++; continue; } // no stamp → the :15 sweep resends

      const nowIso = new Date().toISOString();
      for (const f of active) {
        await supabaseAdmin.from("files").update({ friday_summary_sent_at: nowIso }).eq("id", f.id);
      }
      sent++;
    } catch (e) {
      failed++;
      console.error("[friday-summary] agent failed", agent.id, e);
    }
  }

  return json({ ok: true, sent, skipped, failed });
});

async function sendResend(args: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[friday-summary] RESEND_API_KEY missing"); return false; }
  const body: Record<string, unknown> = { from: FROM, to: [args.to], subject: args.subject, html: args.html };
  if (args.replyTo) body.reply_to = args.replyTo;
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) return true;
    const t = await resp.text().catch(() => "");
    console.warn("[friday-summary] resend attempt " + (attempt + 1) + " failed: " + resp.status + " " + t.slice(0, 160));
    if (attempt === 0) await new Promise(r => setTimeout(r, 30000)); // 30s in-run retry · :15 sweep covers the rest
  }
  return false;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
