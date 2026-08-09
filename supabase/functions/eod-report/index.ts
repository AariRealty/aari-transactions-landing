// ============================================================================
// Aari Transactions · eod-report  (Mock J · "Rolled up by coordinator")
// ============================================================================
// Calm 4 PM ET wrap-up email to broker + coordinators. Rolls the day up per
// coordinator, names files, shows what missed today's 2 PM window (so Eileen
// still has half a workday to react), shows what's due tomorrow, links the
// portal. Done today comes from audit_log (deadline_confirmed timestamp),
// deduped. Tomorrow comes from deadline_feed_cache minus file_deadlines
// completions. Missed-today is deadline_feed_cache rows with due_date=today
// that still aren't marked complete at 4 PM ET.
//
// Moved from 6 PM ET (was etHour===18) to 4 PM ET (etHour===16) so Eileen
// gets it while she still has time to send outbound comms same-day.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Aari Transactions <invoices@aaritransactions.com>";
const PORTAL = "https://aaritransactions.com/files.html";
const TZ = "America/New_York";
const INK = "#14110c";

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
function etLongLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(now);
}
function etShortLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(now);
}
const shortAddr = (a: string) => String(a || "").split(",")[0].trim();
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendEmail(to: string[], subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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
  for (const c of Object.keys(ALIAS)) {
    if (c === key || ALIAS[c].includes(key)) { out.add(c); ALIAS[c].forEach(v => out.add(v)); }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  let force = false, dryRun = false;
  try { const b = await req.json(); force = !!b?.force; dryRun = !!b?.dry_run; } catch { /* cron {} */ }

  const now = new Date();
  // Fires at 4 PM ET (was 6 PM). Cron pings at both 20:00 and 21:00 UTC to cover EDT+EST
  // and act as a retry; the guard ensures only one fire actually goes out.
  if (!force && !dryRun && etHour(now) !== 16) return json(200, { ok: true, skipped: "outside_window", et_hour: etHour(now) });

  try {
    const { startUtc, endUtc } = etTodayBoundsUtc(now);
    const todayYMD = etYMD(now);
    const tomorrowYMD = etYMD(now, 1);

    const { data: people } = await admin.from("agents").select("id, first_name, last_name, email, role").in("role", ["broker", "tc"]);
    const nameById = new Map<string, string>();
    const recipients: string[] = [];
    (people || []).forEach((p: any) => {
      const nm = ((p.first_name || "") + (p.last_name ? " " + String(p.last_name).charAt(0).toUpperCase() + "." : "")).trim();
      nameById.set(p.id, nm || "Team");
      if (p.email) recipients.push(p.email);
    });
    if (!recipients.length) return json(200, { ok: true, sent: 0, note: "no_recipients" });

    // Done today · deadline_confirmed events since midnight ET, deduped per (actor,file,deadline_key).
    const { data: audits } = await admin
      .from("audit_log")
      .select("actor_id, target_id, details, created_at")
      .eq("action", "deadline_confirmed")
      .gte("created_at", startUtc).lt("created_at", endUtc);
    const seen = new Set<string>();
    const byActor = new Map<string, { count: number; files: Set<string> }>();
    let doneTotal = 0;
    (audits || []).forEach((r: any) => {
      const dk = (r.details && (r.details.deadline_key || r.details.dkey)) || "";
      const dedupe = `${r.actor_id}|${r.target_id}|${dk}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      const addr = shortAddr((r.details && r.details.property_address) || "");
      const a = byActor.get(r.actor_id) || { count: 0, files: new Set<string>() };
      a.count += 1; if (addr) a.files.add(addr);
      byActor.set(r.actor_id, a);
      doneTotal += 1;
    });

    // Deadline pulls · today (for missed-2PM), tomorrow, overdue.
    const { data: dueToday } = await admin
      .from("deadline_feed_cache").select("file_id, dkey, name, due_date, is_chase")
      .eq("due_date", todayYMD).eq("is_chase", false);
    const { data: dueTom } = await admin
      .from("deadline_feed_cache").select("file_id, dkey, name, due_date, is_chase")
      .eq("due_date", tomorrowYMD).eq("is_chase", false);
    const { data: overdueRows } = await admin
      .from("deadline_feed_cache").select("file_id, dkey, due_date, is_chase")
      .lt("due_date", todayYMD).eq("is_chase", false);

    const fileIds = Array.from(new Set([...(dueToday || []), ...(dueTom || []), ...(overdueRows || [])].map((r: any) => r.file_id)));
    const fileById = new Map<string, any>();
    if (fileIds.length) {
      const { data: fs } = await admin.from("files")
        .select("id, property_address, assigned_tc_id, status, transaction_stage, archived_at").in("id", fileIds);
      (fs || []).forEach((f: any) => fileById.set(f.id, f));
    }
    const isActive = (f: any) => f && !f.archived_at && !["closed", "cancelled", "archived"].includes(String(f.status || "")) && f.transaction_stage !== "closed";

    const completedByFile = new Map<string, Set<string>>();
    if (fileIds.length) {
      const { data: comp } = await admin.from("file_deadlines")
        .select("file_id, deadline_key, completed_at").in("file_id", fileIds).not("completed_at", "is", null);
      (comp || []).forEach((c: any) => {
        const s = completedByFile.get(c.file_id) || new Set<string>();
        s.add(c.deadline_key); completedByFile.set(c.file_id, s);
      });
    }
    const isDone = (fileId: string, dkey: string) => {
      const done = completedByFile.get(fileId); if (!done) return false;
      for (const k of aliasSet(dkey)) if (done.has(k)) return true;
      return false;
    };

    // Missed today's 2 PM · anything due today that's not marked done by 4 PM (when this fires).
    const missedItems: { name: string; addr: string; tc: string }[] = [];
    (dueToday || []).forEach((r: any) => {
      const f = fileById.get(r.file_id);
      if (!isActive(f)) return;
      if (isDone(r.file_id, r.dkey)) return;
      missedItems.push({ name: r.name || "Deadline", addr: shortAddr(f.property_address), tc: nameById.get(f.assigned_tc_id) || "" });
    });
    missedItems.sort((a, b) => a.addr.localeCompare(b.addr));

    const tomorrowItems: { name: string; addr: string; tc: string }[] = [];
    (dueTom || []).forEach((r: any) => {
      const f = fileById.get(r.file_id);
      if (!isActive(f)) return;
      if (isDone(r.file_id, r.dkey)) return;
      tomorrowItems.push({ name: r.name || "Deadline", addr: shortAddr(f.property_address), tc: nameById.get(f.assigned_tc_id) || "" });
    });
    tomorrowItems.sort((a, b) => a.addr.localeCompare(b.addr));

    let overdueCount = 0;
    (overdueRows || []).forEach((r: any) => {
      const f = fileById.get(r.file_id);
      if (!isActive(f)) return;
      if (isDone(r.file_id, r.dkey)) return;
      overdueCount += 1;
    });

    const dateLabel = etLongLabel(now);
    const shortDate = etShortLabel(now);
    const subject = `Aari · Day wrap · ${shortDate} · ${doneTotal} done · ${tomorrowItems.length} for tomorrow`;

    const heroSubParts: string[] = [`${tomorrowItems.length} for tomorrow`];
    if (overdueCount > 0) heroSubParts.push(`<span style=\"color:#a3402f;font-weight:600\">${overdueCount} overdue</span>`);

    // Missed 2 PM block · red-tinted, only when items exist.
    const missedBlock = missedItems.length > 0
      ? `<div style=\"margin-top:20px;background:#fbf3f1;border:0.5px solid #ecd6d0;border-radius:10px;padding:12px 14px\">`
        + `<div style=\"font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#a3402f;font-weight:700;margin-bottom:8px\">Missed today's 2 PM</div>`
        + missedItems.slice(0, 6).map(m => `<div style=\"padding:6px 0;margin-bottom:2px\"><div style=\"font-size:12.5px;color:#14110c;line-height:1.4\"><span style=\"width:6px;height:6px;border-radius:50%;background:#a3402f;display:inline-block;vertical-align:middle;margin-right:8px\"></span><strong>${esc(m.name)}</strong></div><div style=\"font-size:11.5px;color:#8a7a6a;line-height:1.4;padding-left:14px;margin-top:2px\">${esc(m.addr)}${m.tc ? " · " + esc(m.tc) : ""}</div></div>`).join("")
        + `<div style=\"font-size:11.5px;color:#6f6656;margin-top:8px;padding-left:14px\">Push to first thing tomorrow, or send now.</div>`
        + `</div>`
      : "";

    const actorLines = Array.from(byActor.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, v]) => {
        const files = Array.from(v.files);
        const fileCount = files.length;
        const fileList = files.slice(0, 6).join(", ") + (files.length > 6 ? `, +${files.length - 6} more` : "");
        return `<div style=\"padding:10px 4px;border-top:0.5px solid #f2eee4\"><div style=\"font-size:13px;font-weight:700;color:${INK}\">${esc(nameById.get(id) || "Team")} <span style=\"color:#9a8c6d;font-weight:600\">· ${v.count} across ${fileCount} file${fileCount === 1 ? "" : "s"}</span></div>${fileList ? `<div style=\"font-size:11.5px;color:#6f6656;margin-top:2px\">${esc(fileList)}</div>` : ""}</div>`;
      }).join("");

    const doneBlock = doneTotal > 0
      ? `<div style=\"font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#2f6b4f;font-weight:700;margin:20px 2px 2px\">What got done</div>${actorLines}`
      : `<div style=\"text-align:center;color:#8a8073;font-size:13px;padding:14px 0\">A quiet day. Nothing was checked off.</div>`;

    const tomorrowRows = tomorrowItems.slice(0, 6).map(t => `<div style=\"padding:10px 4px;border-top:0.5px solid #f2eee4\"><div style=\"font-size:12.5px;font-weight:600;color:${INK};line-height:1.4\"><span style=\"display:inline-block;width:7px;height:7px;border-radius:50%;background:#c9932f;vertical-align:middle;margin-right:10px\"></span>${esc(t.name)}</div><div style=\"font-size:11.5px;color:#9a8c6d;line-height:1.4;padding-left:17px;margin-top:2px\">${esc(t.addr)}${t.tc ? " · " + esc(t.tc) : ""}</div></div>`).join("");
    const tomorrowBlock = tomorrowItems.length > 0
      ? `<div style=\"font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#8a6d1b;font-weight:700;margin:20px 2px 2px\">${tomorrowItems.length} for tomorrow</div>${tomorrowRows}`
      : `<div style=\"font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#8a6d1b;font-weight:700;margin:20px 2px 6px\">For tomorrow</div><div style=\"font-size:12.5px;color:#6f6656;padding:2px 4px 4px\">Nothing due tomorrow. Nice.</div>`;

    const preheader = missedItems.length > 0
      ? `2 PM window closed with ${missedItems.length} still open. Here's what got done and what's teed up for tomorrow.`
      : `2 PM window closed. Here's what got done today and what's teed up for tomorrow.`;

    const html = `<!doctype html><html><body style=\"margin:0;background:#f4f1ea;padding:22px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}\">`
      + `<div style=\"display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:transparent\">${esc(preheader)}</div>`
      + `<div style=\"max-width:520px;margin:0 auto;background:#fff;border:0.5px solid #e6ddca;border-radius:14px;overflow:hidden\">`
      + `<div style=\"padding:12px 18px;border-bottom:0.5px solid #f2eee4;font-size:11.5px;color:#8a8073\">Aari Transactions · Wrap-up · ${esc(dateLabel)}</div>`
      + `<div style=\"padding:18px\">`
      + `<div style=\"text-align:center;padding:10px 0 6px\"><div style=\"font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1;color:${INK};letter-spacing:-0.5px\">${doneTotal} done today</div><div style=\"font-size:12.5px;color:#5f5647;margin-top:6px\">${heroSubParts.join(" · ")}</div></div>`
      + missedBlock
      + doneBlock
      + tomorrowBlock
      + `<div style=\"text-align:center;margin-top:24px\"><a href=\"${PORTAL}\" style=\"display:inline-block;background:${INK};color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:11px 22px;border-radius:8px\">See every task in the portal</a></div>`
      + `<div style=\"text-align:center;font-size:10.5px;color:#8a8073;margin-top:22px;padding-top:14px;border-top:0.5px solid #f2eee4\">Aari Transactions LLC · FL Broker BK3530153</div>`
      + `</div></div></body></html>`;

    const textLines = [
      `Aari Transactions · Wrap-up · ${dateLabel}`, ``,
      `${doneTotal} done today · ${tomorrowItems.length} for tomorrow${overdueCount > 0 ? " · " + overdueCount + " overdue" : ""}`, ``,
      ...(missedItems.length ? [`Missed today's 2 PM:`, ...missedItems.slice(0, 6).map(m => `  • ${m.name} · ${m.addr}${m.tc ? " · " + m.tc : ""}`), `Push to first thing tomorrow, or send now.`, ``] : []),
      ...(doneTotal > 0 ? ["What got done:", ...Array.from(byActor.entries()).sort((a, b) => b[1].count - a[1].count).map(([id, v]) => `  ${nameById.get(id) || "Team"} · ${v.count} across ${v.files.size} files: ${Array.from(v.files).join(", ")}`)] : ["A quiet day. Nothing was checked off."]), ``,
      ...(tomorrowItems.length ? [`${tomorrowItems.length} for tomorrow:`, ...tomorrowItems.slice(0, 6).map(t => `  ${t.name} · ${t.addr}${t.tc ? " · " + t.tc : ""}`)] : ["Nothing due tomorrow."]), ``,
      `See every task: ${PORTAL}`,
    ];
    const text = textLines.join("\n");

    if (dryRun) return json(200, { ok: true, dry_run: true, doneTotal, overdueCount, missed: missedItems.length, tomorrow: tomorrowItems.length, recipients, actors: Array.from(byActor.entries()).map(([id, v]) => ({ name: nameById.get(id), count: v.count, files: Array.from(v.files) })), missedItems, tomorrowItems, html });

    await sendEmail(recipients, subject, html, text);
    return json(200, { ok: true, sent: recipients.length, doneTotal, overdueCount, missed: missedItems.length, tomorrow: tomorrowItems.length });
  } catch (err) {
    try {
      const { data: b } = await admin.from("agents").select("email").eq("role", "broker").limit(1).maybeSingle();
      if (b?.email && RESEND_API_KEY) {
        await sendEmail([b.email], "Aari day-wrap report did not run", `<p>The day-wrap report hit an error:</p><pre>${esc(String((err as Error).message || err))}</pre>`, `Day-wrap report error: ${(err as Error).message || err}`);
      }
    } catch { /* ignore */ }
    return json(500, { ok: false, error: String((err as Error).message || err) });
  }
});
