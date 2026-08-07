// Aari Transactions · tc-invoice-unpaid-reminder (v1)
// ============================================================================
// Weekly nudge for the broker (Marlenyi) listing every coordinator invoice
// that is still status='submitted' more than 7 days after it was submitted.
// Prevents the "old invoice sat pending, forgot about it, paid the new one"
// bug Marlenyi ran into with Eileen 2026-08-07.
//
// Runs on a pg_cron schedule (Fri 9am America/New_York). Sends ONE email to
// the broker with a grouped-by-coordinator list of every unpaid invoice, plus
// the total owed and how many days each has been sitting.
//
// Silent when nothing is outstanding — no "you're all paid" noise every week.
// Manual trigger is allowed via authenticated POST for testing.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = "Aari Transactions <invoices@aaritransactions.com>";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (c: number) => "$" + (Math.round(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysSince = (iso: string) => {
  try { const d = new Date(iso); const now = new Date(); return Math.floor((now.getTime() - d.getTime()) / 86400000); } catch (_) { return 0; }
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND) return;
  for (const from of [FROM_PRIMARY, FROM_FALLBACK]) {
    try {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html }) });
      if (r.ok) return;
      const t = await r.text();
      if (!/not verified|domain|403|422/i.test(t)) return;
    } catch (_) { /* fallback */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Every coordinator invoice still submitted (not paid) that was created > 7 days ago
  // — plus any invoice with a held line whose snooze has passed (regardless of age),
  // since a snooze-expiry ping is what makes "Waiting on Samantha payment" actionable.
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: unpaid, error } = await admin
    .from("tc_invoices")
    .select("id, invoice_number, tc_id, total_cents, period_start, period_end, created_at, line_items")
    .eq("status", "submitted")
    .order("created_at", { ascending: true });
  if (error) return j(500, { ok: false, error: error.message });
  const eligible = (unpaid || []).filter((i: any) => {
    // Include if the invoice itself is older than 7 days OR any held line has a
    // snooze that landed today or earlier. Skip invoices where every non-covered
    // non-paid line is held with a snooze still in the future (silent).
    const olderThanWeek = String(i.created_at || "") <= cutoff;
    const lines = (i.line_items || []) as any[];
    const openLines = lines.filter((it) => it && !it.covered && !it.paid_at);
    if (!openLines.length) return false; // nothing to remind about
    if (olderThanWeek) {
      // Older invoice · include unless every open line is snoozed to a future date.
      const allSnoozedFuture = openLines.every((it) => it.held_at && it.snooze_until && String(it.snooze_until) > todayIso);
      return !allSnoozedFuture;
    }
    // Younger invoice · include only if it has at least one line whose snooze passed.
    return openLines.some((it) => it.held_at && it.snooze_until && String(it.snooze_until) <= todayIso);
  });
  if (!eligible.length) return j(200, { ok: true, sent: false, reason: "nothing_to_remind_about" });

  // Resolve coordinator display names.
  const tcIds = [...new Set(eligible.map((i: any) => i.tc_id).filter(Boolean))];
  const { data: tcs } = await admin.from("agents").select("id, first_name, last_name").in("id", tcIds);
  const nameById: Record<string, string> = {};
  (tcs || []).forEach((t: any) => {
    const nm = ((t.first_name || "") + " " + (t.last_name || "")).trim();
    nameById[t.id] = nm || "Coordinator";
  });

  // Group by coordinator. Effective total = sum of NON-paid non-covered line amounts,
  // not the original total_cents (which was set before any partial pay). Held lines
  // are annotated in the email row with their note + snooze.
  const byTc: Record<string, any> = {};
  eligible.forEach((i: any) => {
    const k = i.tc_id || "unknown";
    if (!byTc[k]) byTc[k] = { name: nameById[k] || "Coordinator", invoices: [], total: 0 };
    const lines = (i.line_items || []) as any[];
    const openTotal = lines.filter((it) => it && !it.covered && !it.paid_at).reduce((s, it) => s + (Number(it.amount_cents) || 0), 0);
    const heldLines = lines.filter((it) => it && it.held_at && !it.paid_at && !it.covered);
    byTc[k].invoices.push({ ...i, effective_total_cents: openTotal, held_lines: heldLines });
    byTc[k].total += openTotal;
  });
  const groups = Object.values(byTc) as any[];
  groups.sort((a, b) => b.total - a.total);
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const totalInvoices = eligible.length;

  // Broker email address.
  const { data: broker } = await admin.from("agents").select("email").eq("role", "broker").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const brokerEmail = (broker && (broker as any).email) || "marlenyi@aaritransactions.com";

  // ---- Email HTML ----
  const groupHtml = groups.map((g: any) => {
    const rows = g.invoices.map((iv: any) => {
      const period = iv.period_start && iv.period_end ? esc(iv.period_start + " – " + iv.period_end) : "";
      const age = daysSince(iv.created_at);
      const ageLbl = age === 1 ? "1 day" : `${age} days`;
      // Held lines rendered as small annotations right under the invoice line so
      // the broker sees "Waiting on Samantha payment · snoozed to Aug 15" in the
      // reminder itself — no need to open the app to remember why the line is held.
      const heldHtml = (iv.held_lines || []).map((hl: any) => {
        const addr = esc(String(hl.address || "File").split(",")[0]);
        const note = hl.held_note ? ` · ${esc(hl.held_note)}` : "";
        const snz = hl.snooze_until ? ` · snoozed to ${esc(new Date(String(hl.snooze_until).slice(0,10) + "T12:00:00").toLocaleDateString("en-US",{ month:"short", day:"numeric" }))}` : "";
        const amt = money(Number(hl.amount_cents) || 0);
        return `<div style='font-size:10.5px;color:#993c1d;margin-top:3px;line-height:1.4'>&#9633; Held · <b>${addr}</b> · ${amt}${note}${snz}</div>`;
      }).join("");
      return `<tr><td style='padding:9px 0;border-top:0.5px solid #f6e3dc'>` +
        `<div style='font-size:12.5px;font-weight:600;color:#0f0f0f'>Invoice ${esc(iv.invoice_number || "")}</div>` +
        `<div style='font-size:11px;color:#a36b58;margin-top:2px'>${period}${period ? " · " : ""}${ageLbl} pending</div>` +
        heldHtml +
        `</td><td align='right' valign='top' style='padding:9px 0;border-top:0.5px solid #f6e3dc;font-size:13px;font-weight:600;color:#993c1d;white-space:nowrap'>${money(iv.effective_total_cents)}</td></tr>`;
    }).join("");
    return `<div style='background:#fdf4f1;border:0.5px solid #f3d9d0;border-radius:11px;padding:14px 16px;margin:0 0 14px'>` +
      `<div style='display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px'>` +
        `<span style='font-family:Georgia,serif;font-size:15px;font-weight:600;color:#0f0f0f'>${esc(g.name)}</span>` +
        `<span style='font-size:13px;font-weight:700;color:#993c1d'>${money(g.total)}</span>` +
      `</div>` +
      `<div style='font-size:11.5px;color:#a36b58;margin-bottom:4px'>${g.invoices.length} invoice${g.invoices.length === 1 ? "" : "s"} pending</div>` +
      `<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>${rows}</table>` +
    `</div>`;
  }).join("");

  const html = `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#ffffff'><tr><td align='center' style='padding:26px 12px'>` +
    `<table role='presentation' width='500' cellpadding='0' cellspacing='0' style='max-width:500px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:26px 24px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'>` +
    `<div style='text-align:center;padding-bottom:18px;border-bottom:0.5px solid #ece8e0;margin-bottom:18px'>` +
      `<div style='font-family:Georgia,serif;font-size:20px'>Aari Transactions</div>` +
      `<div style='font-size:9.5px;letter-spacing:2px;color:#8a857c;margin-top:6px'>UNPAID COORDINATOR INVOICES</div>` +
    `</div>` +
    `<div style='background:#0f0f0f;border-radius:11px;padding:18px;margin-bottom:20px;text-align:center'>` +
      `<div style='font-size:11px;color:#b8b8b8'>Total owed to coordinators</div>` +
      `<div style='font-family:Georgia,serif;font-size:34px;color:#ffffff;line-height:1.1;margin-top:3px'>${money(grandTotal)}</div>` +
      `<div style='font-size:11.5px;color:#9a9a9a;margin-top:4px'>${totalInvoices} invoice${totalInvoices === 1 ? "" : "s"} pending &middot; ${groups.length} coordinator${groups.length === 1 ? "" : "s"}</div>` +
    `</div>` +
    `<div style='font-size:12.5px;color:#5f5e5a;line-height:1.55;margin-bottom:16px'>Each of these has been submitted for more than a week. Review and pay from your invoices tab.</div>` +
    groupHtml +
    `<div style='text-align:center;margin-top:16px'>` +
      `<a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>Open invoices</a>` +
    `</div>` +
    `<div style='font-size:10.5px;color:#a39e93;margin-top:20px;line-height:1.5;text-align:center'>Weekly reminder from Aari Transactions. Stops arriving as soon as everything is marked paid.</div>` +
    `</td></tr></table></td></tr></table>`;

  const subject = totalInvoices === 1
    ? `Unpaid: ${money(grandTotal)} owed to ${groups[0].name}`
    : `Unpaid: ${money(grandTotal)} owed across ${totalInvoices} invoices`;

  await sendEmail(brokerEmail, subject, html);
  return j(200, { ok: true, sent: true, total_cents: grandTotal, invoice_count: totalInvoices, coordinators: groups.length });
});
