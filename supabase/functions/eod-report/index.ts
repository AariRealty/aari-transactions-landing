// ============================================================================
// Aari Transactions · eod-report  (Mock J · "Rolled up by coordinator")
// ============================================================================
// A calm end-of-day email to the broker + every coordinator. Design goal: it
// reads the same whether the team cleared 14 deadlines or 400, so it NEVER
// itemizes every task. It rolls the day up per coordinator, names the files,
// shows only what's due tomorrow, and links the full task-by-task log in the
// portal.
//
// DATA (all service_role, RLS bypassed):
//   Done today   · audit_log where action='deadline_confirmed' and created_at
//                  falls in today (America/New_York). Deduped by
//                  actor|file|deadline_key so a re-save never inflates the count.
//                  Grouped by actor (who actually checked it off).
//   For tomorrow · deadline_feed_cache rows due TOMORROW (ET), not is_chase,
//                  on an active file, minus anything already completed in
//                  file_deadlines. Overdue count is the same, for due_date<today.
//
// completed_at on file_deadlines is the deadline's ACTUAL date, not when it was
// checked, which is why "done today" comes from the audit_log timestamp instead.
//
// Trigger:
//   POST {}                · pg_cron, twice (22:00 + 23:00 UTC) gated to 18 ET
//   POST {"force":true}    · bypass the hour gate
//   POST {"dry_run":true}  · compute + return the html, send nothing
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected), RESEND_API_KEY (set).
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

// ---- date helpers · America/New_York ----------------------------------------
function etYMD(now: Date, offsetDays = 0): string {
  const base = new Date(now.getTime() + offsetDays * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
  return p; // en-CA => YYYY-MM-DD
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
const shortAddr = (a: string) => String(a || "").split(",")[0].trim();
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Resend -----------------------------------------------------------------
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

// deadline-key aliases · a completion can sit under an equivalent key, so a
// tomorrow item must be considered done if ANY key in its group is completed.
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
  try { const b = await req.json(); force = !!b?.force; dryRun = !!b?.dry_run; } catch { /* cron sends {} */ }

  const now = new Date();
  if (!force && !dryRun && etHour(now) !== 18) return json(200, { ok: true, skipped: "outside_window", et_hour: etHour(now) });

  try {
    const { startUtc, endUtc } = etTodayBoundsUtc(now);
    const todayYMD = etYMD(now);
    const tomorrowYMD = etYMD(now, 1);

    // ---- recipients + name map ----
    const { data: people } = await admin.from("agents").select("id, first_name, last_name, email, role").in("role", ["broker", "tc"]);
    const nameById = new Map<string, string>();
    const recipients: string[] = [];
    (people || []).forEach((p: any) => {
      const nm = ((p.first_name || "") + (p.last_name ? " " + String(p.last_name).charAt(0).toUpperCase() + "." : "")).trim();
      nameById.set(p.id, nm || "Team");
      if (p.email) recipients.push(p.email);
    });
    if (!recipients.length) return json(200, { ok: true, sent: 0, note: "no_recipients" });

    // ---- DONE TODAY · audit_log deadline_confirmed, deduped, by actor ----
    const { data: audits } = await admin
      .from("audit_log")
      .select("actor_id, target_id, details, created_at")
      .eq("action", "deadline_confirmed")
      .gte("created_at", startUtc).lt("created_at", endUtc);
    const seen = new Set<string>();
    // actor -> { count, files: Map<addr,1> }
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

    // ---- cache rows due tomorrow (+ overdue count) on ACTIVE files ----
    const { data: dueTom } = await admin
      .from("deadline_feed_cache")
      .select("file_id, dkey, name, due_date, is_chase")
      .eq("due_date", tomorrowYMD).eq("is_chase", false);
    const { data: overdueRows } = await admin
      .from("deadline_feed_cache")
      .select("file_id, dkey, due_date, is_chase")
      .lt("due_date", todayYMD).eq("is_chase", false);

    const fileIds = Array.from(new Set([...(dueTom || []), ...(overdueRows || [])].map((r: any) => r.file_id)));
    const fileById = new Map<string, any>();
    if (fileIds.length) {
      const { data: fs } = await admin.from("files")
        .select("id, property_address, assigned_tc_id, status, transaction_stage, archived_at")
        .in("id", fileIds);
      (fs || []).forEach((f: any) => fileById.set(f.id, f));
    }
    const isActive = (f: any) => f && !f.archived_at && !["closed", "cancelled", "archived"].includes(String(f.status || "")) && f.transaction_stage !== "closed";

    // completions to subtract (alias-aware)
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

    // tomorrow list (cap 6)
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

    // ---- build email (Mock J) ----
    const dateLabel = etLongLabel(now);
    const subject = `Aari Transactions · End of day · ${dateLabel}`;

    const H = (s: string) => s; // readability
    const sub = overdueCount > 0
      ? `<span style="color:#a3402f;font-weight:600">${overdueCount} still overdue</span>`
      : `nothing overdue`;

    // "What got done" · one line per coordinator who did something today
    const actorLines = Array.from(byActor.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, v]) => {
        const files = Array.from(v.files);
        const fileCount = files.length;
        const fileList = files.slice(0, 6).join(", ") + (files.length > 6 ? `, +${files.length - 6} more` : "");
        return `<div style="padding:9px 4px;border-top:0.5px solid #f2eee4">
          <div style="font-size:13px;font-weight:700;color:${INK}">${esc(nameById.get(id) || "Team")} <span style="color:#9a8c6d;font-weight:600">· ${v.count} across ${fileCount} file${fileCount === 1 ? "" : "s"}</span></div>
          ${fileList ? `<div style="font-size:11.5px;color:#6f6656;margin-top:2px">${esc(fileList)}</div>` : ""}
        </div>`;
      }).join("");

    const doneBlock = doneTotal > 0
      ? `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#2f6b4f;font-weight:700;margin:16px 2px 2px">What got done</div>${actorLines}`
      : `<div style="text-align:center;color:#8a8073;font-size:13px;padding:14px 0">A quiet day. Nothing was checked off.</div>`;

    const tomorrowRows = tomorrowItems.slice(0, 6).map(t => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-top:0.5px solid #f2eee4">
        <span style="width:7px;height:7px;border-radius:50%;background:#c9932f;flex:none"></span>
        <span style="flex:1;font-size:12.5px;font-weight:600;color:${INK}">${esc(t.name)}<span style="color:#9a8c6d;font-weight:400"> · ${esc(t.addr)}${t.tc ? " · " + esc(t.tc) : ""}</span></span>
      </div>`).join("");
    const tomorrowBlock = tomorrowItems.length > 0
      ? `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#8a6d1b;font-weight:700;margin:18px 2px 2px">${tomorrowItems.length} for tomorrow</div>${tomorrowRows}`
      : `<div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#8a6d1b;font-weight:700;margin:18px 2px 6px">For tomorrow</div><div style="font-size:12.5px;color:#6f6656;padding:2px 4px 4px">Nothing due tomorrow. Nice.</div>`;

    const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:22px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:0.5px solid #e6ddca;border-radius:14px;overflow:hidden">
        <div style="padding:12px 18px 8px;border-bottom:0.5px solid #f2eee4;font-size:11.5px;color:#8a8073">Aari Transactions · End of day · ${esc(dateLabel)}</div>
        <div style="padding:18px">
          <div style="text-align:center;padding:8px 0 2px">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;color:${INK}">${doneTotal} done today</div>
            <div style="font-size:12px;color:#5f5647;margin-top:3px">${sub}</div>
          </div>
          ${doneBlock}
          ${tomorrowBlock}
          <div style="text-align:center;margin-top:20px">
            <a href="${PORTAL}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:10px 20px;border-radius:8px">See every task in the portal</a>
          </div>
        </div>
      </div>
    </body></html>`;

    const textLines = [
      `Aari Transactions · End of day · ${dateLabel}`,
      ``,
      `${doneTotal} done today · ${overdueCount > 0 ? overdueCount + " overdue" : "nothing overdue"}`,
      ``,
      ...(doneTotal > 0 ? ["What got done:", ...Array.from(byActor.entries()).sort((a, b) => b[1].count - a[1].count).map(([id, v]) => `  ${nameById.get(id) || "Team"} · ${v.count} across ${v.files.size} files: ${Array.from(v.files).join(", ")}`)] : ["A quiet day. Nothing was checked off."]),
      ``,
      ...(tomorrowItems.length ? [`${tomorrowItems.length} for tomorrow:`, ...tomorrowItems.slice(0, 6).map(t => `  ${t.name} · ${t.addr}${t.tc ? " · " + t.tc : ""}`)] : ["Nothing due tomorrow."]),
      ``,
      `See every task: ${PORTAL}`,
    ];
    const text = textLines.join("\n");

    if (dryRun) return json(200, { ok: true, dry_run: true, doneTotal, overdueCount, recipients, actors: Array.from(byActor.entries()).map(([id, v]) => ({ name: nameById.get(id), count: v.count, files: Array.from(v.files) })), tomorrow: tomorrowItems, html });

    await sendEmail(recipients, subject, html, text);
    return json(200, { ok: true, sent: recipients.length, doneTotal, overdueCount, tomorrow: tomorrowItems.length });
  } catch (err) {
    // Never fail silently · tell the broker the pull broke.
    try {
      const { data: b } = await admin.from("agents").select("email").eq("role", "broker").limit(1).maybeSingle();
      if (b?.email && RESEND_API_KEY) {
        await sendEmail([b.email], "Aari end-of-day report did not run", `<p>The end-of-day report hit an error:</p><pre>${esc(String((err as Error).message || err))}</pre>`, `EOD report error: ${(err as Error).message || err}`);
      }
    } catch { /* ignore */ }
    return json(500, { ok: false, error: String((err as Error).message || err) });
  }
});
