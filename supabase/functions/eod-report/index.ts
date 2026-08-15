// ============================================================================
// Aari Transactions · eod-report v3 (2026-08-15)
// ============================================================================
// PER-TC daily clock-in email at 4 PM ET. Two states:
//   1. All done → "You clocked in." · N completed. Nothing left for today.
//   2. Something left → "Almost there... N to go! ✨" · warm Alex-toned nudge.
//
// Sections (only these two, everything else lives in the portal):
//   · Still to complete by end of day today (red-outlined empty checkbox ☐)
//   · Completed today (green ✓)
//
// Recipients: TO the TC, CC broker (marlenyi@aarirealty.com) on every one.
// The broker's own TC-role email doesn't self-CC (avoids the duplicate).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const BROKER_EMAIL = Deno.env.get("BROKER_EMAIL") ?? "marlenyi@aarirealty.com";
const FROM = "Aari Transactions <invoices@aaritransactions.com>";
const PORTAL = "https://aaritransactions.com/files.html";
const TZ = "America/New_York";
const INK = "#14110c";
const RED = "#a3402f";
const GREEN = "#2f6b4f";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function etYMD(now: Date, offsetDays = 0): string {
  const base = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}
function etTodayBoundsUtc(now: Date): { startUtc: string; endUtc: string } {
  const ymd = etYMD(now);
  const naiveMidnightUtc = new Date(`${ymd}T00:00:00Z`);
  const easternRender = new Date(naiveMidnightUtc.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = naiveMidnightUtc.getTime() - easternRender.getTime();
  const startUtc = new Date(naiveMidnightUtc.getTime() + offsetMs);
  const endUtc = new Date(startUtc.getTime() + 86400000);
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() };
}
function etHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).formatToParts(now).find(p => p.type === "hour")?.value ?? "0";
  return parseInt(h, 10);
}
function etLongLabel(now: Date): string { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(now); }
function etShortLabel(now: Date): string { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(now); }
const shortAddr = (a: string) => String(a || "").split(",")[0].trim();
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendEmail(to: string[], cc: string[] | undefined, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const payload: Record<string, unknown> = { from: FROM, to, subject, html, text };
  if (cc && cc.length) payload.cc = cc;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

const ALIAS: Record<string, string[]> = {
  emd_initial: ["init_deposit"], emd_additional: ["additional_deposit"],
  title_commitment: ["title_evidence", "title_policy", "buyer_title_rev", "title_commitment"],
  estoppel: ["estoppel", "estoppels_due"], survey: ["survey_seller", "survey_existing", "survey"],
  compensation: ["compensation_agreement"], loan_approval: ["loan_approval", "finance_cont"],
  tenant_lease: ["leases_provided", "lease_terminate", "tenant_lease"],
  inspection_end: ["inspection_end", "feasibility_end", "due_diligence_end"],
};
function aliasSet(key: string): Set<string> {
  const out = new Set<string>([key]);
  for (const c of Object.keys(ALIAS)) { if (c === key || ALIAS[c].includes(key)) { out.add(c); ALIAS[c].forEach(v => out.add(v)); } }
  return out;
}

type Task = { name: string; addr: string };
type DoneItem = { name: string; addr: string };

function rowStillToDo(t: Task): string {
  return `<div style="padding:8px 4px;border-top:0.5px solid #f2eee4"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr><td style="width:24px;vertical-align:top;padding-top:2px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;border:1.5px solid ${RED}">&nbsp;</span></td><td><div style="font-size:12.5px;color:${INK};line-height:1.4"><strong>${esc(t.name)}</strong></div><div style="font-size:11.5px;color:#8a7a6a;margin-top:2px">${esc(t.addr)}</div></td></tr></table></div>`;
}
function rowDone(t: DoneItem): string {
  return `<div style="padding:8px 4px;border-top:0.5px solid #f2eee4"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr><td style="width:24px;vertical-align:top"><span style="color:${GREEN};font-weight:700;font-size:14px">&#10003;</span></td><td><div style="font-size:12.5px;color:${INK};line-height:1.4"><strong>${esc(t.name)}</strong></div><div style="font-size:11.5px;color:#8a7a6a;margin-top:2px">${esc(t.addr)}</div></td></tr></table></div>`;
}

function heroAllDone(doneCount: number): string {
  return `<div style="padding:22px 18px 8px;text-align:center"><div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:${INK};letter-spacing:-0.5px">You clocked in.</div><div style="font-size:12.5px;color:#5f5647;margin-top:8px">${doneCount} completed. Nothing left for today.</div></div>`;
}
function heroStillToDo(remaining: number, doneCount: number): string {
  const remLabel = remaining === 1 ? "1 to go" : `${remaining} to go`;
  const doneLabel = doneCount === 0
    ? "Let’s wrap them before EOD."
    : `You&rsquo;ve <em>crushed</em> ${doneCount} today. Let’s wrap the last ${remaining === 1 ? "one" : "two"} before EOD.`;
  return `<div style="padding:22px 18px 8px;text-align:center"><div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:${INK};letter-spacing:-0.5px">Almost there... <span style="color:${RED}">${remLabel}</span>! &#10024;</div><div style="font-size:12.5px;color:#5f5647;margin-top:10px;line-height:1.5">${doneLabel}</div></div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  let force = false, dryRun = false, onlyTc: string | undefined;
  try { const b = await req.json(); force = !!b?.force; dryRun = !!b?.dry_run; onlyTc = b?.only_tc; } catch { /* cron {} */ }

  const now = new Date();
  if (!force && !dryRun && etHour(now) !== 16) return json(200, { ok: true, skipped: "outside_window", et_hour: etHour(now) });

  try {
    const { startUtc, endUtc } = etTodayBoundsUtc(now);
    const todayYMD = etYMD(now);

    const { data: people } = await admin.from("agents").select("id, first_name, last_name, email, role").in("role", ["broker", "tc"]);
    const tcs: Array<{ id: string; name: string; email: string }> = [];
    let brokerEmail = BROKER_EMAIL;
    (people || []).forEach((p: { id: string; first_name?: string; last_name?: string; email?: string; role?: string }) => {
      const nm = ((p.first_name || "") + (p.last_name ? " " + String(p.last_name).charAt(0).toUpperCase() + "." : "")).trim() || "Team";
      if (p.role === "tc" && p.email) tcs.push({ id: p.id, name: nm, email: p.email });
      if (p.role === "broker" && p.email) brokerEmail = p.email;
    });
    if (!tcs.length) return json(200, { ok: true, sent: 0, note: "no_tcs" });

    // Done today
    const { data: audits } = await admin.from("audit_log").select("actor_id, target_id, details, created_at").eq("action", "deadline_confirmed").gte("created_at", startUtc).lt("created_at", endUtc);
    const seen = new Set<string>();
    const doneByActor = new Map<string, DoneItem[]>();
    (audits || []).forEach((r: { actor_id: string; target_id: string; details?: { deadline_key?: string; dkey?: string; property_address?: string; name?: string } }) => {
      const dk = (r.details && (r.details.deadline_key || r.details.dkey)) || "";
      const dedupe = `${r.actor_id}|${r.target_id}|${dk}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      const addr = shortAddr((r.details && r.details.property_address) || "");
      const name = String((r.details && r.details.name) || "Task") + " completed";
      const list = doneByActor.get(r.actor_id) || []; list.push({ name, addr });
      doneByActor.set(r.actor_id, list);
    });

    // Due today (still to do)
    const { data: dueToday } = await admin.from("deadline_feed_cache").select("file_id, dkey, name, due_date, is_chase").eq("due_date", todayYMD).eq("is_chase", false);
    const dueFileIds = Array.from(new Set((dueToday || []).map((r: { file_id: string }) => r.file_id)));
    const fileById = new Map<string, { id: string; property_address?: string; assigned_tc_id?: string; status?: string; transaction_stage?: string; archived_at?: string }>();
    if (dueFileIds.length) {
      const { data: fs } = await admin.from("files").select("id, property_address, assigned_tc_id, status, transaction_stage, archived_at").in("id", dueFileIds);
      (fs || []).forEach((f: { id: string }) => fileById.set(f.id, f as never));
    }
    const isActive = (f: { archived_at?: string; status?: string; transaction_stage?: string } | undefined) =>
      f && !f.archived_at && !["closed", "cancelled", "archived"].includes(String(f.status || "")) && f.transaction_stage !== "closed";

    const completedByFile = new Map<string, Set<string>>();
    if (dueFileIds.length) {
      const { data: comp } = await admin.from("file_deadlines").select("file_id, deadline_key, completed_at").in("file_id", dueFileIds).not("completed_at", "is", null);
      (comp || []).forEach((c: { file_id: string; deadline_key: string }) => {
        const s = completedByFile.get(c.file_id) || new Set<string>();
        s.add(c.deadline_key); completedByFile.set(c.file_id, s);
      });
    }
    const isDone = (fileId: string, dkey: string) => {
      const done = completedByFile.get(fileId); if (!done) return false;
      for (const k of aliasSet(dkey)) if (done.has(k)) return true;
      return false;
    };

    const stillToDoByTc = new Map<string, Task[]>();
    for (const tc of tcs) stillToDoByTc.set(tc.id, []);
    (dueToday || []).forEach((r: { file_id: string; dkey: string; name?: string; due_date: string }) => {
      const f = fileById.get(r.file_id);
      if (!isActive(f)) return;
      if (isDone(r.file_id, r.dkey)) return;
      const tcId = f && f.assigned_tc_id; if (!tcId) return;
      const bkt = stillToDoByTc.get(tcId); if (!bkt) return;
      bkt.push({ name: r.name || "Deadline", addr: shortAddr((f && f.property_address) || "") });
    });

    const dateLabel = etLongLabel(now);
    const shortDate = etShortLabel(now);
    const sent: string[] = [];
    const previews: Record<string, { subject: string; html: string; text: string }> = {};

    for (const tc of tcs) {
      if (onlyTc && tc.id !== onlyTc && tc.email !== onlyTc) continue;
      const doneList = (doneByActor.get(tc.id) || []).slice().sort((a, b) => a.addr.localeCompare(b.addr));
      const stillList = (stillToDoByTc.get(tc.id) || []).slice().sort((a, b) => a.addr.localeCompare(b.addr));

      const hero = stillList.length === 0 ? heroAllDone(doneList.length) : heroStillToDo(stillList.length, doneList.length);

      const stillBlock = stillList.length > 0
        ? `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:${RED};font-weight:700;margin:14px 2px 4px">Still to complete by end of day today</div>${stillList.map(rowStillToDo).join("")}`
        : "";

      const doneBlock = doneList.length > 0
        ? `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:${GREEN};font-weight:700;margin:22px 2px 4px">Completed today</div>${doneList.map(rowDone).join("")}`
        : "";

      const preheader = stillList.length > 0
        ? `${stillList.length} to go... let’s wrap before EOD.`
        : `Nice — you clocked in. ${doneList.length} completed today.`;

      const subject = stillList.length > 0
        ? `Aari · ${shortDate} · Almost there... ${stillList.length} to go before EOD`
        : `Aari · ${shortDate} · You clocked in ✓ ${doneList.length} completed`;

      const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:22px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}"><div style="display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:transparent">${esc(preheader)}</div><div style="max-width:520px;margin:0 auto;background:#fff;border:0.5px solid #e6ddca;border-radius:14px;overflow:hidden"><div style="padding:12px 18px;border-bottom:0.5px solid #f2eee4;font-size:11.5px;color:#8a8073">Aari Transactions · Wrap-up for ${esc(tc.name)} · ${esc(dateLabel)}</div>${hero}<div style="padding:18px">${stillBlock}${doneBlock}<div style="text-align:center;margin-top:26px"><a href="${PORTAL}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:11px 22px;border-radius:8px">Open the portal</a></div><div style="text-align:center;font-size:10.5px;color:#8a8073;margin-top:22px;padding-top:14px;border-top:0.5px solid #f2eee4">Aari Transactions LLC</div></div></div></body></html>`;

      const textLines = [
        `Aari Transactions · Wrap-up for ${tc.name} · ${dateLabel}`, ``,
        ...(stillList.length > 0
          ? [`Almost there... ${stillList.length} to go before EOD.`, ``, `Still to complete by end of day today:`, ...stillList.map(t => `  [ ] ${t.name} · ${t.addr}`), ``]
          : [`You clocked in. ${doneList.length} completed. Nothing left for today.`, ``]),
        ...(doneList.length > 0 ? [`Completed today:`, ...doneList.map(t => `  [✓] ${t.name} · ${t.addr}`), ``] : []),
        `Open the portal: ${PORTAL}`,
      ];
      const text = textLines.join("\n");

      if (dryRun) { previews[tc.email] = { subject, html, text }; continue; }

      const cc = tc.email.toLowerCase() === brokerEmail.toLowerCase() ? undefined : [brokerEmail];
      try { await sendEmail([tc.email], cc, subject, html, text); sent.push(tc.email); }
      catch (e) { console.error(`[eod-report] send to ${tc.email} failed`, e instanceof Error ? e.message : String(e)); }
    }

    if (dryRun) return json(200, { ok: true, dry_run: true, tcs: tcs.length, previews });
    return json(200, { ok: true, sent, tcs: tcs.length });
  } catch (err) {
    try {
      if (BROKER_EMAIL && RESEND_API_KEY) {
        await sendEmail([BROKER_EMAIL], undefined, "Aari day-wrap report did not run", `<p>The per-TC day-wrap report hit an error:</p><pre>${esc(String((err as Error).message || err))}</pre>`, `Day-wrap report error: ${(err as Error).message || err}`);
      }
    } catch { /* ignore */ }
    return json(500, { ok: false, error: String((err as Error).message || err) });
  }
});
