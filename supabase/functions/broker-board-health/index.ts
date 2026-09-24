// Aari Transactions · broker-board-health (v1)
// ============================================================================
// Daily 7am ET digest to marlenyi@aarirealty.com listing every anomaly the
// system caught in the last 24h that a human should look at. Written after
// tonight's Samantha addendum leak (Sep 20 2026) sat on Milennys's board for
// six days because no one noticed. The broker should never learn about a
// glitch from the TC.
//
// Categories:
//   1. Claim-pool orphans     · assigned_tc_id IS NULL > 12h
//   2. Triage backlog         · raw_form_data.triage_reason set > 24h
//   3. Duplicate addresses    · same address on 2+ TCs (excludes the broker's
//                               allowed dual-invoice pair, e.g. 1219 Hibiscus)
//   4. Closed uninvoiced      · per TC, closed > 3 days, no invoice_id
//   5. Self-transactions      · file whose agent_name matches its own TC and
//                               is billable (should never happen after the
//                               fileIsBillable() guard, so flag any that slip)
//   6. Signed-with-no-contract · stage_tasks.new_signatures_verified done but
//                               no contract_path attached
//   7. Manual paid attempts   · files where paid_at was flipped without a
//                               Stripe payment (checked against payments table)
//                               within the last 24h · surfaces the guard's
//                               refusals + any real manual marks the broker
//                               didn't do herself
//
// Fires by cron "broker-board-health-daily" (0 11 * * * UTC = 7am ET).
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

const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
function j(s: number, b: unknown){ return new Response(JSON.stringify(b), { status:s, headers:{ ...CORS, "Content-Type":"application/json" } }); }
function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function money(c: number){ return "$" + (Math.round(c)/100).toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 }); }
function normAddr(a: string){ return String(a || "").toUpperCase().replace(/\s+/g," ").split(",")[0].trim(); }
function hoursSince(iso: string | null){ if(!iso) return null; try { return (Date.now() - new Date(iso).getTime()) / 3600000; } catch { return null; } }
function daysSince(iso: string | null){ const h = hoursSince(iso); return h == null ? null : Math.floor(h / 24); }

const SERVICE_PRICE: Record<string, number> = {
  tc_one_side:399, tc_both_sides:599, tc:399, listing_coordinator:199,
  listing_docs:99, mls_setup:99, file_organization:99, standalone_review:149,
  offer_prep_basic:79, offer_prep_complete:149,
};
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

// Allow-list of duplicate-address pairs the broker deliberately keeps
// double-billed. Any duplicate involving both a Milennys and an Eileen row on
// 1219 Hibiscus is Marlenyi's Alied co-invoice rule and gets skipped.
const DUP_ADDRESS_ALLOWLIST = ["1219 HIBISCUS AVE"];

// ------- section rendering -----------------------------------------------
// deno-lint-ignore no-explicit-any
function sectionHtml(title: string, subtitle: string, items: string[]){
  if(!items.length) return "";
  return `<div style="margin:22px 0 0">
    <div style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#8a857c;font-weight:700">${esc(title)} · <span style="color:#a3402f">${items.length}</span></div>
    <div style="font-size:11.5px;color:#5f5e5a;margin:3px 0 8px;line-height:1.55">${esc(subtitle)}</div>
    <div style="border:0.5px solid #ece8e0;border-radius:11px;overflow:hidden">${items.join('<div style="height:0.5px;background:#f1ede6"></div>')}</div>
  </div>`;
}
// deno-lint-ignore no-explicit-any
function rowHtml(head: string, sub: string, href: string, meta?: string){
  return `<div style="padding:11px 14px;background:#fff">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
      <div style="font-size:13px;font-weight:600;color:#0f0f0f;min-width:0">${head}</div>
      ${meta ? `<div style="font-size:11.5px;color:#8a857c;white-space:nowrap">${meta}</div>` : ""}
    </div>
    <div style="font-size:11.5px;color:#5f5e5a;margin-top:3px;line-height:1.55">${sub}</div>
    <div style="margin-top:6px"><a href="${href}" style="font-size:11.5px;font-weight:600;color:#0f0f0f;text-decoration:underline;text-underline-offset:2px">Investigate →</a></div>
  </div>`;
}

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if(req.method !== "POST" && req.method !== "GET") return j(405, { ok:false, error:"Method not allowed" });
  let body: { to?: string; dry_run?: boolean } = {};
  if(req.method === "POST"){ try { body = await req.json(); } catch { body = {}; } }
  const dryRun = !!body.dry_run;
  const toAddr = body.to || BROKER_EMAIL;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const now = Date.now();

  // Roster · needed for TC names + self-transaction checks + pay-rate math
  const { data: tcs } = await admin.from("agents").select("id, first_name, last_name, email, role").in("role", ["tc","broker"]);
  const tcById: Record<string, any> = {};
  (tcs || []).forEach((t: any) => { tcById[t.id] = t; });
  const { data: rates } = await admin.from("tc_pay_rates").select("tc_id, pct");
  (rates || []).forEach((r: any) => { if(tcById[r.tc_id]) tcById[r.tc_id].tc_pay_pct = r.pct; });

  // Files load · one round-trip, all filters applied client-side.
  const { data: files } = await admin.from("files").select("id, assigned_tc_id, fg_tc_id, agent_id, property_address, service_type, file_type, status, transaction_stage, invoice_id, archived_at, closing_date, actual_closing_date, paid_at, amount_paid_cents, stage_tasks, raw_form_data, created_at, updated_at").order("created_at", { ascending:false });

  // ------ 1. Claim-pool orphans (assigned_tc_id IS NULL > 12h, live) ------
  const orphans = (files || []).filter((f: any) => {
    if(f.assigned_tc_id) return false;
    if(["archived","cancelled","closed"].includes(String(f.status||"").toLowerCase())) return false;
    if((f.raw_form_data||{}).test_pool) return false;
    const h = hoursSince(f.created_at);
    return h != null && h > 12;
  });
  const orphanItems = orphans.slice(0, 12).map((f: any) => {
    const via = (f.raw_form_data||{}).source === "email_import" ? "email import" : "intake";
    const subj = (f.raw_form_data||{}).import_subject || "";
    const age = Math.round((hoursSince(f.created_at) || 0));
    return rowHtml(
      esc(shortAddr(f)),
      `${via}${subj ? " · " + esc(String(subj).slice(0,80)) : ""}`,
      fileLink(f),
      `${age}h in claim pool`
    );
  });

  // ------ 2. Triage backlog ------
  const triage = (files || []).filter((f: any) => {
    const r = (f.raw_form_data||{}).triage_reason;
    if(!r) return false;
    if(["archived","cancelled"].includes(String(f.status||"").toLowerCase())) return false;
    const h = hoursSince(f.updated_at || f.created_at);
    return h != null && h > 24;
  });
  const triageItems = triage.slice(0, 12).map((f: any) => {
    const r = String((f.raw_form_data||{}).triage_reason || "");
    const d = Math.round(hoursSince(f.updated_at || f.created_at) || 0);
    return rowHtml(
      esc(shortAddr(f)),
      `reason: ${esc(r)}`,
      fileLink(f),
      `${d}h stuck`
    );
  });

  // ------ 3. Duplicate addresses across TCs ------
  const byAddr: Record<string, any[]> = {};
  (files || []).forEach((f: any) => {
    if(["archived","cancelled"].includes(String(f.status||"").toLowerCase())) return;
    if((f.raw_form_data||{}).test_pool) return;
    if(!f.assigned_tc_id) return;
    const k = normAddr(f.property_address);
    if(!k || /^NEW FILE/i.test(k)) return;
    (byAddr[k] = byAddr[k] || []).push(f);
  });
  const dupItems: string[] = [];
  Object.keys(byAddr).forEach((k) => {
    const rows = byAddr[k];
    const tcs = new Set(rows.map(r => r.assigned_tc_id));
    if(tcs.size < 2) return;
    if(DUP_ADDRESS_ALLOWLIST.some(a => k.startsWith(a))) return;
    const who = Array.from(tcs).map(id => {
      const t = tcById[id]; return t ? ((t.first_name || "") + " " + (t.last_name || "")).trim() : "unassigned";
    }).join(" and ");
    dupItems.push(rowHtml(
      esc(rows[0].property_address || k),
      `on ${esc(who)}'s boards (${rows.length} file rows)`,
      `${SITE_URL}/files.html?search=${encodeURIComponent(rows[0].property_address || k)}`,
      `${tcs.size} TCs`
    ));
  });

  // ------ 4. Closed uninvoiced > 3 days (per TC) ------
  // Two filters added Sep 24 after Marlenyi's own 11162 Sunset Preserve (she is
  // TC and broker, so she does not invoice herself) and Milennys's 844 Bell
  // (self-listing, already shown in section 5) both cluttered the list:
  //   * skip role='broker' TCs entirely (broker never invoices herself)
  //   * skip self-transactions (same helper as fileIsBillable on the portal),
  //     so a self-listing appears exactly once in the digest — in section 5.
  const readyByTc: Record<string, any[]> = {};
  (files || []).forEach((f: any) => {
    if(!f.assigned_tc_id) return;
    if(f.invoice_id) return;
    if(String(f.status||"").toLowerCase() !== "closed") return;
    if((f.raw_form_data||{}).test_pool || f.archived_at) return;
    const tc = tcById[f.assigned_tc_id];
    if(!tc) return;
    if(String(tc.role||"").toLowerCase() === "broker") return;
    // Self-transaction: TC's own listing/sale. Same check as fileIsBillable on
    // the portal — either agent_id matches the TC or agent_name matches TC's
    // first + last name (case- and whitespace-normalized).
    if(f.agent_id && String(f.agent_id) === String(tc.id)) return;
    const nm = String((f.raw_form_data||{}).agent_name || "").trim().toLowerCase().replace(/\s+/g," ");
    const tcNm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim().toLowerCase().replace(/\s+/g," ");
    if(nm && tcNm && nm === tcNm) return;
    const closedAt = f.actual_closing_date || f.closing_date || f.updated_at || f.created_at;
    const d = daysSince(closedAt);
    if(d == null || d < 3) return;
    (readyByTc[f.assigned_tc_id] = readyByTc[f.assigned_tc_id] || []).push(f);
  });
  const stuckItems: string[] = [];
  Object.keys(readyByTc).forEach((tcId) => {
    const tc = tcById[tcId] || { first_name: "TC" };
    const rows = readyByTc[tcId];
    const total = rows.reduce((s: number, f: any) => s + payCents(f, tc.tc_pay_pct), 0);
    const nm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim();
    const oldest = Math.max(...rows.map(r => daysSince(r.actual_closing_date || r.closing_date || r.updated_at || r.created_at) || 0));
    stuckItems.push(rowHtml(
      `${esc(nm)} · ${rows.length} file${rows.length===1?"":"s"} · ${money(total)}`,
      esc(rows.map(r => shortAddr(r)).join(" · ")),
      `${SITE_URL}/files.html?as_tc=${tcId}&view=invoice`,
      `oldest ${oldest}d`
    ));
  });

  // ------ 5. Self-transactions currently billable (guard leak) ------
  const selfLeak = (files || []).filter((f: any) => {
    if(!f.assigned_tc_id) return false;
    if(f.invoice_id) return false;
    if(String(f.status||"").toLowerCase() !== "closed") return false;
    const tc = tcById[f.assigned_tc_id]; if(!tc) return false;
    if(f.agent_id && String(f.agent_id) === String(tc.id)) return true;
    const nm = String((f.raw_form_data||{}).agent_name || "").trim().toLowerCase().replace(/\s+/g," ");
    const tcNm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim().toLowerCase().replace(/\s+/g," ");
    return !!(nm && tcNm && nm === tcNm);
  });
  const selfItems = selfLeak.slice(0, 8).map((f: any) => {
    const tc = tcById[f.assigned_tc_id];
    const nm = tc ? ((tc.first_name || "") + " " + (tc.last_name || "")).trim() : "TC";
    return rowHtml(esc(shortAddr(f)), `${esc(nm)}'s own listing sitting on her billable queue`, fileLink(f), "self-tx");
  });

  // ------ 6. Signed without contract attached ------
  // Marlenyi Sep 21 · the 15 historical files with signatures verified but no
  // PDF were already closed/moved on before the check existed. Don't nag her
  // about the past; only flag files created on or after this cutoff so the
  // check applies to every TC's future uploads. TCs are expected to upload the
  // executed listing agreement to the file going forward.
  const SIG_CHECK_CUTOFF = "2026-09-21T00:00:00Z";
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
  const signedNoContractItems = signedNoContract.slice(0, 8).map((f: any) => rowHtml(
    esc(shortAddr(f)),
    "TC marked signatures verified but no contract PDF is attached to the file",
    fileLink(f),
    "no PDF"
  ));

  // ------ 7. Manual paid marks in last 24h (real ones, not guard-blocked) ------
  // Files where paid_at is set within the last 24h AND no matching Stripe row
  // in payments · same check the trg_platform_alert_on_files trigger runs, but
  // gathered as a daily summary so a manual mark you didn't do stands out.
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const { data: pays } = await admin.from("payments").select("file_id, stripe_payment_intent_id, stripe_checkout_session_id, stripe_charge_id");
  const stripeFileIds = new Set<string>((pays || []).filter((p: any) => p.stripe_payment_intent_id || p.stripe_checkout_session_id || p.stripe_charge_id).map((p: any) => p.file_id));
  const recentManual = (files || []).filter((f: any) => {
    if(!f.paid_at) return false;
    if(f.paid_at < since) return false;
    if(stripeFileIds.has(f.id)) return false;
    return true;
  });
  const manualItems = recentManual.slice(0, 8).map((f: any) => {
    const rw = f.raw_form_data || {};
    return rowHtml(
      esc(shortAddr(f)),
      `${esc(String(rw.paid_method || "manual"))} · ${money(f.amount_paid_cents || 0)}`,
      fileLink(f),
      "manual"
    );
  });

  const totalIssues = orphanItems.length + triageItems.length + dupItems.length + stuckItems.length + selfItems.length + signedNoContractItems.length + manualItems.length;

  const body_html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;background:#faf6ec;padding:24px">
  <table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#fff;border:0.5px solid #ece8e0;border-radius:14px;padding:26px">
    <tr><td>
      <div style="font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:#8a857c;font-weight:700">Aari Transactions · Board health</div>
      <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;margin:6px 0 4px;font-weight:600;color:#0f0f0f">${totalIssues === 0 ? "All clear this morning" : totalIssues + " thing" + (totalIssues===1?"":"s") + " to look at"}</h1>
      <div style="font-size:13px;color:#5f5e5a;margin:0 0 6px">Snapshot as of ${new Date(now).toLocaleString("en-US", { timeZone:"America/New_York", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })} ET</div>
      ${totalIssues === 0 ? `<div style="background:#f4faf4;border:0.5px solid #d9ecd9;border-radius:11px;padding:14px 16px;margin-top:14px;font-size:12.5px;color:#2f6b4f;line-height:1.55">Nothing sitting in the claim pool, no triage backlog, no duplicate addresses across TCs, no closed uninvoiced older than three days, no self-transactions on a billable queue, every signature-verified file has a contract PDF, no manual paid marks overnight. Nice.</div>` : ""}
      ${sectionHtml("Claim-pool orphans", "Files that landed unassigned and no TC has claimed them. Every TC can see these; if they linger they leak client info into the wrong board (Sep 20 · Samantha addendum).", orphanItems)}
      ${sectionHtml("Triage backlog", "Files the auto-importer couldn't finish setting up. They sit until a human decides.", triageItems)}
      ${sectionHtml("Duplicate addresses across TCs", "The same property is on 2+ TCs' boards. Usually a dupe intake; the 1219 Hibiscus co-invoice pair is allow-listed and won't appear here.", dupItems)}
      ${sectionHtml("Ready to invoice, not submitted", "TC has closed files sitting billable for 3+ days. The daily bill-ready nudge already pings her — this is your view.", stuckItems)}
      ${sectionHtml("Self-transactions on a billable queue", "A TC's own listing showing up as billable to Aari. The billable filter should hide these; anything here slipped through.", selfItems)}
      ${sectionHtml("Signatures verified, no contract attached", "TC checked the box, but the file has no PDF. Contract may have been removed or was never uploaded.", signedNoContractItems)}
      ${sectionHtml("Manual paid marks in the last 24h", "paid_at was flipped and no matching Stripe row exists. If it's not one you approved for Marlenyi to enter, something skipped the broker guard.", manualItems)}
      <div style="font-size:11.5px;color:#a39e93;margin-top:22px;text-align:center;line-height:1.6">Reply to this email with any category name to have me pause it (e.g. reply "pause self-transactions").<br>Sent daily at 7am ET. Adjust with cron.unschedule('broker-board-health-daily').</div>
    </td></tr>
  </table>
</div>`;

  const digest = { totalIssues, orphans: orphans.length, triage: triage.length, duplicates: dupItems.length, stuckInvoices: stuckItems.length, selfTx: selfLeak.length, signedNoContract: signedNoContract.length, manualPaid: recentManual.length };
  if(dryRun) return j(200, { ok:true, dry_run:true, digest, html_length: body_html.length });
  if(!RESEND) return j(500, { ok:false, error:"RESEND_API_KEY missing" });

  const subject = totalIssues === 0
    ? "Aari board · all clear"
    : `Aari board · ${totalIssues} to look at`;
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
