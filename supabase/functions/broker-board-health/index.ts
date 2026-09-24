// Aari Transactions · broker-board-health (v5 · Style B, red/yellow/green)
// ============================================================================
// Sep 24 rebuild:
//   * Style B layout Marlenyi picked · red counter chips at top, only red
//     items expanded, yellow rolled into a "Also on the board" line, green
//     categories rolled into a "Quiet" line at the bottom.
//   * Severity rethought · RED = things Marlenyi personally has to fix
//     (send a payment, resolve triage, archive a dupe). YELLOW = ecosystem
//     status she should see but is not hers to do (a TC has files ready
//     to submit, a self-listing sits on a TC's billable queue, a signature
//     was checked without a PDF). GREEN = quiet categories.
//   * NEW red section · "Payments to send" · lists every submitted+unpaid
//     invoice whose first pay-Friday after submission has already passed.
//     Fires every day the digest runs, so a missed Friday gets a Sat/Sun/Mon/
//     Tue... daily reminder until paid. Marlenyi pays weekly Fridays.
//
// Fires daily at 11:00 UTC (7am ET) via cron "broker-board-health-daily".
// {"dry_run":true} returns the digest JSON without sending.
// {"to":"other@email"} previews it to a different address.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = "Aari Platform <alerts@aaritransactions.com>";
const FROM_FALLBACK = "Aari Platform <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://aaritransactions.com";
const BROKER_EMAIL = "marlenyi@aarirealty.com";
const SIG_CHECK_CUTOFF = "2026-09-21T00:00:00Z";

const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
function j(s: number, b: unknown){ return new Response(JSON.stringify(b), { status:s, headers:{ ...CORS, "Content-Type":"application/json" } }); }
function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function money(c: number){ return "$" + (Math.round(c)/100).toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 }); }
function normAddr(a: string){ return String(a || "").toUpperCase().replace(/\s+/g," ").split(",")[0].trim(); }
function hoursSince(iso: string | null){ if(!iso) return null; try { return (Date.now() - new Date(iso).getTime()) / 3600000; } catch { return null; } }
function daysSince(iso: string | null){ const h = hoursSince(iso); return h == null ? null : Math.floor(h / 24); }

// Has the first pay-Friday after the given date already passed?
// Marlenyi pays on Fridays. If an invoice was submitted Mon Sep 15, its first
// pay-Friday is Fri Sep 19. On Sat Sep 20 (and every day after) this returns
// true until paid. If submitted Sat Sep 20, first pay-Friday is Fri Sep 26,
// so Sat Sep 27 onward.
function payFridayPassed(submittedAt: string | null): boolean {
  if(!submittedAt) return false;
  const submitted = new Date(submittedAt);
  const day = submitted.getUTCDay(); // 0=Sun ... 5=Fri ... 6=Sat
  // days to next Friday (5). If submitted ON a Friday, next pay-Friday is 7 days later.
  const daysToFri = day === 5 ? 7 : ((5 - day + 7) % 7 || 7);
  const nextFri = new Date(submitted.getTime() + daysToFri * 86400000);
  // End of pay-Friday (23:59:59 UTC that day).
  nextFri.setUTCHours(23, 59, 59, 999);
  return Date.now() > nextFri.getTime();
}

const SERVICE_PRICE: Record<string, number> = { tc_one_side:399, tc_both_sides:599, tc:399, listing_coordinator:199, listing_docs:99, mls_setup:99, file_organization:99, standalone_review:149, offer_prep_basic:79, offer_prep_complete:149 };
// deno-lint-ignore no-explicit-any
function svcKey(f: any){ const s = String(f?.service_type||"").toLowerCase(); return { lc:"listing_coordinator", listing:"listing_coordinator", op_basic:"offer_prep_basic", op_complete:"offer_prep_complete", file_org:"file_organization" }[s] || s; }
// deno-lint-ignore no-explicit-any
function isFileOrg(f: any){ return (f?.file_type||"") === "compliance" || svcKey(f) === "file_organization"; }
// deno-lint-ignore no-explicit-any
function payCents(f: any, pct: number){
  if(isFileOrg(f)) return Math.round(SERVICE_PRICE.file_organization * 50 / 100 * 100);
  const p = SERVICE_PRICE[svcKey(f)] || 0;
  const n = (pct != null && !isNaN(pct)) ? Number(pct) : 40;
  return p ? Math.round(Math.round(p * n / 100) * 100) : 0;
}
// deno-lint-ignore no-explicit-any
function fileLink(f: any){ return `${SITE_URL}/files.html?open=${f.id}`; }
// deno-lint-ignore no-explicit-any
function shortAddr(f: any){ return (f.property_address || "File").split(",")[0]; }
// deno-lint-ignore no-explicit-any
function isSelfTx(f: any, tc: any){
  if(!tc) return false;
  if(f.agent_id && String(f.agent_id) === String(tc.id)) return true;
  const nm = String((f.raw_form_data||{}).agent_name || "").trim().toLowerCase().replace(/\s+/g," ");
  const tcNm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim().toLowerCase().replace(/\s+/g," ");
  return !!(nm && tcNm && nm === tcNm);
}

const DUP_ADDRESS_ALLOWLIST = ["1219 HIBISCUS AVE"];

// ---- rendering helpers -------------------------------------------------

type RedItem = { h: string; s?: string; href: string };
function redItemHtml(it: RedItem){
  return `<div style="background:#fff;border:0.5px solid #ece8e0;border-left:3px solid #a3402f;border-radius:8px;padding:12px 14px;margin-bottom:8px">
    <div style="font-size:13.5px;font-weight:600;color:#0f0f0f;line-height:1.35">${it.h}</div>
    ${it.s ? `<div style="font-size:11.5px;color:#8a857c;margin-top:4px;line-height:1.5">${it.s}</div>` : ""}
    <a href="${it.href}" style="display:inline-block;margin-top:8px;font-size:11.5px;font-weight:600;color:#0f0f0f;text-decoration:underline;text-underline-offset:2px">Open →</a>
  </div>`;
}

// ============================================================================

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if(req.method !== "POST" && req.method !== "GET") return j(405, { ok:false, error:"Method not allowed" });
  let body: { to?: string; dry_run?: boolean } = {};
  if(req.method === "POST"){ try { body = await req.json(); } catch { body = {}; } }
  const dryRun = !!body.dry_run;
  const toAddr = body.to || BROKER_EMAIL;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const now = Date.now();

  // Roster (need name + role for filtering)
  const { data: tcs } = await admin.from("agents").select("id, first_name, last_name, email, role").in("role", ["tc","broker"]);
  const tcById: Record<string, any> = {};
  (tcs || []).forEach((t: any) => { tcById[t.id] = t; });
  const { data: rates } = await admin.from("tc_pay_rates").select("tc_id, pct");
  (rates || []).forEach((r: any) => { if(tcById[r.tc_id]) tcById[r.tc_id].tc_pay_pct = r.pct; });

  const { data: files } = await admin.from("files").select("id, assigned_tc_id, fg_tc_id, agent_id, property_address, service_type, file_type, status, transaction_stage, invoice_id, archived_at, closing_date, actual_closing_date, paid_at, amount_paid_cents, stage_tasks, raw_form_data, created_at, updated_at").order("created_at", { ascending:false });

  // -----------------------------------------------------------------
  // RED · things Marlenyi personally has to fix
  // -----------------------------------------------------------------
  const red: RedItem[] = [];

  // 1. Payments to send · submitted invoices whose pay-Friday has passed.
  const { data: submittedInvoices } = await admin.from("tc_invoices").select("id, invoice_number, tc_id, submitted_at, total_cents").eq("status", "submitted");
  const payDue = (submittedInvoices || []).filter((inv: any) => payFridayPassed(inv.submitted_at));
  payDue.sort((a: any, b: any) => new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime());
  payDue.forEach((inv: any) => {
    const tc = tcById[inv.tc_id];
    const nm = tc ? ((tc.first_name || "") + " " + (tc.last_name || "")).trim() : "a TC";
    const days = daysSince(inv.submitted_at) || 0;
    red.push({
      h: `Pay ${esc(nm)} ${money(inv.total_cents || 0)} · ${esc(inv.invoice_number || "invoice")}`,
      s: `Submitted ${days}d ago · past Friday`,
      href: `${SITE_URL}/files.html?view=invoice`,
    });
  });

  // 2. Claim-pool orphans (unassigned files sitting > 12h). Broker reassigns.
  const orphans = (files || []).filter((f: any) => {
    if(f.assigned_tc_id) return false;
    if(["archived","cancelled","closed"].includes(String(f.status||"").toLowerCase())) return false;
    if((f.raw_form_data||{}).test_pool) return false;
    const h = hoursSince(f.created_at);
    return h != null && h > 12;
  });
  orphans.slice(0, 6).forEach((f: any) => {
    const via = (f.raw_form_data||{}).source === "email_import" ? "email import" : "intake";
    const subj = (f.raw_form_data||{}).import_subject || "";
    const age = Math.round((hoursSince(f.created_at) || 0));
    red.push({
      h: `Reassign · ${esc(shortAddr(f))}`,
      s: `${via}${subj ? " · " + esc(String(subj).slice(0,80)) : ""} · ${age}h in claim pool`,
      href: fileLink(f),
    });
  });

  // 3. Triage backlog (broker decides what to do)
  const triage = (files || []).filter((f: any) => {
    const r = (f.raw_form_data||{}).triage_reason;
    if(!r) return false;
    if(["archived","cancelled"].includes(String(f.status||"").toLowerCase())) return false;
    const h = hoursSince(f.updated_at || f.created_at);
    return h != null && h > 24;
  });
  triage.slice(0, 6).forEach((f: any) => {
    const r = String((f.raw_form_data||{}).triage_reason || "");
    const d = Math.round(hoursSince(f.updated_at || f.created_at) || 0);
    red.push({
      h: `Triage · ${esc(shortAddr(f))}`,
      s: `${esc(r)} · ${d}h stuck`,
      href: fileLink(f),
    });
  });

  // 4. Duplicate addresses across TCs (broker archives dupe)
  const byAddr: Record<string, any[]> = {};
  (files || []).forEach((f: any) => {
    if(["archived","cancelled"].includes(String(f.status||"").toLowerCase())) return;
    if((f.raw_form_data||{}).test_pool) return;
    if(!f.assigned_tc_id) return;
    const k = normAddr(f.property_address);
    if(!k || /^NEW FILE/i.test(k)) return;
    (byAddr[k] = byAddr[k] || []).push(f);
  });
  Object.keys(byAddr).forEach((k) => {
    const rows = byAddr[k];
    const tcs = new Set(rows.map(r => r.assigned_tc_id));
    if(tcs.size < 2) return;
    if(DUP_ADDRESS_ALLOWLIST.some(a => k.startsWith(a))) return;
    const who = Array.from(tcs).map(id => { const t = tcById[id]; return t ? ((t.first_name || "") + " " + (t.last_name || "")).trim() : "unassigned"; }).join(" and ");
    red.push({
      h: `Duplicate · ${esc(rows[0].property_address || k)}`,
      s: `On ${esc(who)}'s boards · archive the dupe`,
      href: `${SITE_URL}/files.html?search=${encodeURIComponent(rows[0].property_address || k)}`,
    });
  });

  // 5. Manual paid marks in last 24h with no matching Stripe row
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const { data: pays } = await admin.from("payments").select("file_id, stripe_payment_intent_id, stripe_checkout_session_id, stripe_charge_id");
  const stripeFileIds = new Set<string>((pays || []).filter((p: any) => p.stripe_payment_intent_id || p.stripe_checkout_session_id || p.stripe_charge_id).map((p: any) => p.file_id));
  const recentManual = (files || []).filter((f: any) => {
    if(!f.paid_at) return false;
    if(f.paid_at < since) return false;
    if(stripeFileIds.has(f.id)) return false;
    return true;
  });
  recentManual.slice(0, 6).forEach((f: any) => {
    const rw = f.raw_form_data || {};
    red.push({
      h: `Verify payment · ${esc(shortAddr(f))}`,
      s: `${esc(String(rw.paid_method || "manual"))} · ${money(f.amount_paid_cents || 0)} · no Stripe row`,
      href: fileLink(f),
    });
  });

  // -----------------------------------------------------------------
  // YELLOW · watch · TC's job / informational
  // -----------------------------------------------------------------
  const yellow: string[] = [];

  // Ready to invoice · TC has closed uninvoiced files > 3 days.
  const readyByTc: Record<string, any[]> = {};
  (files || []).forEach((f: any) => {
    if(!f.assigned_tc_id) return;
    if(f.invoice_id) return;
    if(String(f.status||"").toLowerCase() !== "closed") return;
    if((f.raw_form_data||{}).test_pool || f.archived_at) return;
    const tc = tcById[f.assigned_tc_id];
    if(!tc) return;
    if(String(tc.role||"").toLowerCase() === "broker") return;
    if(isSelfTx(f, tc)) return;
    const closedAt = f.actual_closing_date || f.closing_date || f.updated_at || f.created_at;
    const d = daysSince(closedAt);
    if(d == null || d < 3) return;
    (readyByTc[f.assigned_tc_id] = readyByTc[f.assigned_tc_id] || []).push(f);
  });
  Object.keys(readyByTc).forEach((tcId) => {
    const tc = tcById[tcId] || { first_name: "TC" };
    const rows = readyByTc[tcId];
    const total = rows.reduce((s: number, f: any) => s + payCents(f, tc.tc_pay_pct), 0);
    const nm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim();
    yellow.push(`${esc(nm)} has ${rows.length} file${rows.length===1?"":"s"} ready to invoice (${money(total)})`);
  });

  // Self-transactions currently billable
  const selfLeak = (files || []).filter((f: any) => {
    if(!f.assigned_tc_id) return false;
    if(f.invoice_id) return false;
    if(String(f.status||"").toLowerCase() !== "closed") return false;
    const tc = tcById[f.assigned_tc_id]; if(!tc) return false;
    return isSelfTx(f, tc);
  });
  selfLeak.slice(0, 3).forEach((f: any) => {
    const tc = tcById[f.assigned_tc_id];
    const nm = tc ? ((tc.first_name || "") + " " + (tc.last_name || "")).trim() : "TC";
    yellow.push(`${esc(nm)}'s own listing on her billable queue (${esc(shortAddr(f))})`);
  });

  // Signatures verified but no contract PDF (post Sep 21 cutoff)
  const signedNoContract = (files || []).filter((f: any) => {
    if(["archived","cancelled"].includes(String(f.status||"").toLowerCase())) return false;
    if(!f.created_at || f.created_at < SIG_CHECK_CUTOFF) return false;
    const t = (f.stage_tasks && typeof f.stage_tasks === "object") ? f.stage_tasks : {};
    const sv = t.new_signatures_verified;
    if(!(sv && (sv.done || sv.at))) return false;
    const rw = f.raw_form_data || {};
    if(rw.contract_path) return false;
    return true;
  });
  if(signedNoContract.length){
    yellow.push(`${signedNoContract.length} file${signedNoContract.length===1?"":"s"} marked signed with no PDF · TC to upload`);
  }

  // -----------------------------------------------------------------
  // GREEN · quiet categories (for the "all clear" chip counter)
  // -----------------------------------------------------------------
  const greenLabels: string[] = [];
  if(!payDue.length) greenLabels.push("payments");
  if(!orphans.length) greenLabels.push("claim pool");
  if(!triage.length) greenLabels.push("triage");
  if(!Object.keys(byAddr).some(k => new Set(byAddr[k].map(r => r.assigned_tc_id)).size >= 2 && !DUP_ADDRESS_ALLOWLIST.some(a => k.startsWith(a)))) greenLabels.push("duplicates");
  if(!recentManual.length) greenLabels.push("manual paid marks");

  const redCount = red.length;
  const yellowCount = yellow.length;
  const greenCount = greenLabels.length;

  // -----------------------------------------------------------------
  // RENDER (Style B)
  // -----------------------------------------------------------------
  const heads = redCount === 0
    ? (yellowCount === 0 ? "All quiet this morning" : "Nothing needs you today")
    : `${redCount} thing${redCount===1?"":"s"} need${redCount===1?"s":""} you today`;

  const chip = (bg: string, border: string, fg: string, n: number, label: string) => `
    <td style="width:33%;padding:0 4px">
      <div style="background:${bg};border:0.5px solid ${border};border-radius:12px;padding:14px 10px;text-align:center;color:${fg}">
        <div style="font-family:Georgia,serif;font-weight:600;font-size:28px;line-height:1;font-variant-numeric:tabular-nums">${n}</div>
        <div style="font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;font-weight:700;margin-top:5px">${label}</div>
      </div>
    </td>`;

  const chipRow = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-collapse:separate">
      <tr>
        ${chip("#fbecea", "#f2ddd8", "#a3402f", redCount, "Do now")}
        ${chip("#fbf7ee", "#efe4cf", "#7a5c12", yellowCount, "Watch")}
        ${chip("#f4faf4", "#d9ecd9", "#2f6b4f", greenCount, "All clear")}
      </tr>
    </table>`;

  const redBlock = redCount === 0 ? "" : `
    <div style="margin-top:18px">
      <div style="font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:#a3402f;font-weight:700;margin-bottom:8px">Do now</div>
      ${red.map(redItemHtml).join("")}
    </div>`;

  const yellowBlock = yellowCount === 0 ? "" : `
    <div style="margin-top:16px;padding:12px 14px;background:#fbf7ee;border:0.5px solid #efe4cf;border-radius:10px;font-size:12px;color:#7a5c12;line-height:1.6">
      <span style="font-weight:700;letter-spacing:.4px;text-transform:uppercase;font-size:10.5px">Watch</span><br>
      ${yellow.map(y => `&middot; ${y}`).join("<br>")}
    </div>`;

  const greenBlock = greenCount === 0 ? "" : `
    <div style="margin-top:12px;padding:10px 14px;background:#f4faf4;border:0.5px solid #d9ecd9;border-radius:10px;font-size:11.5px;color:#2f6b4f;line-height:1.55">
      <span style="font-weight:700;letter-spacing:.4px;text-transform:uppercase;font-size:10.5px">All clear</span> · ${greenLabels.join(", ")}
    </div>`;

  const body_html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;background:#faf6ec;padding:22px">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:0.5px solid #ece8e0;border-radius:14px;padding:22px">
      <tr><td>
        <div style="font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:#8a857c;font-weight:700">Aari Transactions · Board health</div>
        <h1 style="font-family:Georgia,serif;font-size:22px;line-height:1.2;margin:6px 0 0;font-weight:600;color:#0f0f0f">${esc(heads)}</h1>
        <div style="font-size:12px;color:#8a857c;margin-top:4px">${new Date(now).toLocaleString("en-US", { timeZone:"America/New_York", weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })} ET</div>
        ${chipRow}
        ${redBlock}
        ${yellowBlock}
        ${greenBlock}
        <div style="font-size:11px;color:#a39e93;margin-top:22px;text-align:center;line-height:1.6">Sent daily 7am ET. Red = your job. Yellow = a TC's job, shown so you see it. Green = quiet.</div>
      </td></tr>
    </table>
  </div>`;

  const digest = { redCount, yellowCount, greenCount, payments_due: payDue.length, orphans: orphans.length, triage: triage.length, duplicates: red.filter(r => r.h.startsWith("Duplicate")).length, ready_to_invoice: Object.keys(readyByTc).length, self_tx: selfLeak.length, sig_no_pdf: signedNoContract.length, manual_paid: recentManual.length };
  if(dryRun) return j(200, { ok:true, dry_run:true, digest, html_length: body_html.length });
  if(!RESEND) return j(500, { ok:false, error:"RESEND_API_KEY missing" });

  const subject = redCount === 0
    ? (yellowCount === 0 ? "Aari board · all quiet" : `Aari board · ${yellowCount} to watch`)
    : `Aari board · ${redCount} to do${yellowCount ? " (+ " + yellowCount + " to watch)" : ""}`;
  let sent = false; let lastBody = "";
  for(const from of [FROM_PRIMARY, FROM_FALLBACK]){
    try {
      const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":`Bearer ${RESEND}`, "Content-Type":"application/json" }, body: JSON.stringify({ from, to:[toAddr], subject, html: body_html }) });
      lastBody = await r.text();
      if(r.ok){ sent = true; break; }
      if(!/not verified|domain|403|422/i.test(lastBody)) break;
    } catch(_){ /* try fallback */ }
  }
  return j(200, { ok:sent, digest, to: toAddr, subject, resend_body: lastBody.slice(0, 300) });
});
