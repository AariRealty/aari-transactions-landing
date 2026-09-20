// Aari Transactions · tc-bill-ready-nudge (v1)
// ============================================================================
// A single closed file with no invoice lands as $50-$400 in the coordinator's
// billable queue the moment it closes. The old flow relied on the Thursday
// weekly digest to nudge her toward the Invoice tab, which meant a Monday
// closing sat waiting for four days with nothing pinging her. Milennys's
// 1219 Hibiscus (closed Sep 1) went three weeks uninvoiced for exactly this
// reason. This function fires daily and pings each coordinator with a
// short "you have a bill ready" email when at least one of her files is
// billable but unbilled.
//
// Fires by cron "tc-bill-ready-nudge-daily" (0 13 * * 0-3,5-6 UTC · every
// day at 9am ET EXCEPT Thursday, so it does not double up with the Thursday
// pipeline digest tc-invoice-reminder already sends).
//
// {"to":"email"} previews the email for that one TC (their real files).
// {"dry_run":true} lists what would send without hitting Resend.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = "Aari Transactions <invoices@aaritransactions.com>";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://aaritransactions.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(s: number, b: unknown){ return new Response(JSON.stringify(b), { status:s, headers:{ ...CORS, "Content-Type":"application/json" } }); }
function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function money(c: number){ return "$" + (Math.round(c)/100).toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 }); }

// Pay math ported from /js/pay-engine.js. Kept minimal — this function only
// needs to name a rough total on the email; the invoice screen recomputes on
// submit. If the catalog changes here, keep it aligned with the shared engine.
const SERVICE_PRICE: Record<string, number> = {
  tc_one_side:399, tc_both_sides:599, tc:399, listing_coordinator:199,
  listing_docs:99, mls_setup:99, file_organization:99, standalone_review:149,
  offer_prep_basic:79, offer_prep_complete:149,
};
const SERVICE_ALIAS: Record<string, string> = {
  lc:"listing_coordinator", listing:"listing_coordinator",
  op_basic:"offer_prep_basic", op_complete:"offer_prep_complete",
  file_org:"file_organization",
};
// deno-lint-ignore no-explicit-any
function svcKey(f: any){ const s = String(f?.service_type||"").toLowerCase(); return SERVICE_ALIAS[s] || s; }
const SERVICE_LABEL: Record<string, string> = {
  tc:"Full TC", tc_one_side:"TC · one side", tc_both_sides:"TC · both sides",
  listing_coordinator:"Listing Coordinator", listing_docs:"Listing Docs",
  mls_setup:"MLS Setup", file_organization:"File Organization",
  standalone_review:"Standalone Review", offer_prep_basic:"Offer Prep",
  offer_prep_complete:"Offer Prep Complete",
};
// deno-lint-ignore no-explicit-any
function svcLabel(f: any){ return SERVICE_LABEL[svcKey(f)] || f?.service_type || "Service"; }
// deno-lint-ignore no-explicit-any
function isFileOrg(f: any){ return (f?.file_type||"") === "compliance" || svcKey(f) === "file_organization"; }
// deno-lint-ignore no-explicit-any
function payCents(f: any, pct: number){
  if(isFileOrg(f)) return Math.round(SERVICE_PRICE.file_organization * 50 / 100 * 100);
  const p = SERVICE_PRICE[svcKey(f)] || 0;
  const n = (pct != null && !isNaN(pct)) ? Number(pct) : 40;
  return p ? Math.round(Math.round(p * n / 100) * 100) : 0;
}

// Self-transaction check — same logic the portal uses to keep a TC's own
// listings off her billable queue. Match by agent_id first, then by name.
// deno-lint-ignore no-explicit-any
function isSelfTx(f: any, tc: any){
  if(!tc) return false;
  if(f.agent_id && String(f.agent_id) === String(tc.id)) return true;
  const nm = String((f.raw_form_data || {}).agent_name || "").trim().toLowerCase().replace(/\s+/g," ");
  const tcNm = ((tc.first_name || "") + " " + (tc.last_name || "")).trim().toLowerCase().replace(/\s+/g," ");
  return !!(nm && tcNm && nm === tcNm);
}

// deno-lint-ignore no-explicit-any
function stageDone(f: any){
  if(String(f.status||"").toLowerCase() === "closed") return true;
  if(f.transaction_stage === "closed") return true;
  return false;
}

// deno-lint-ignore no-explicit-any
function nudgeEmailHtml(tc: any, files: any[], totalCents: number){
  const tcFirst = esc(tc.first_name || "there");
  const lines = files.map((f: any) => {
    const closed = f.actual_closing_date || f.closing_date || null;
    const closedStr = closed ? new Date(String(closed).slice(0,10) + "T12:00:00").toLocaleDateString("en-US",{ month:"short", day:"numeric" }) : "recently closed";
    const agent = (f.raw_form_data || {}).agent_name || "";
    return `<tr>
      <td valign="top" style="padding:11px 0;border-top:0.5px solid #f0ebe0">
        <div style="font-size:13px;font-weight:500;color:#0f0f0f">${esc((f.property_address || "File").split(",")[0])}</div>
        <div style="font-size:11.5px;color:#8a857c;margin-top:2px">${esc(svcLabel(f))} · ${esc(closedStr)}${agent ? " · " + esc(agent) : ""}</div>
      </td>
      <td valign="top" align="right" style="padding:11px 0;border-top:0.5px solid #f0ebe0;font-size:13px;font-weight:600;color:#0f0f0f;white-space:nowrap">${money(payCents(f, tc.tc_pay_pct))}</td>
    </tr>`;
  }).join("");
  const many = files.length > 1;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;background:#faf6ec;padding:24px">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:0.5px solid #ece8e0;border-radius:14px;padding:26px">
    <tr><td>
      <div style="font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:#8a857c;font-weight:700">Ready to invoice</div>
      <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;margin:6px 0 4px;font-weight:600;color:#0f0f0f">${many ? files.length + " files" : "1 file"} ready · ${money(totalCents)}</h1>
      <div style="font-size:13px;color:#5f5e5a;margin:0 0 18px">Hi ${tcFirst} — ${many ? "these have closed" : "this closed"} and ${many ? "are" : "is"} sitting on the Invoice tab waiting to be submitted.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px">${lines}
        <tr>
          <td style="padding:11px 0;border-top:0.5px solid #f0ebe0;font-size:12px;color:#8a857c;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Total</td>
          <td align="right" style="padding:11px 0;border-top:0.5px solid #f0ebe0;font-size:14px;font-weight:700;color:#0f0f0f;white-space:nowrap">${money(totalCents)}</td>
        </tr>
      </table>
      <div style="margin:18px 0 0"><a href="${SITE_URL}/files.html?view=invoice" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 18px;border-radius:9px">Open my Invoice tab</a></div>
      <div style="font-size:11.5px;color:#8a857c;margin-top:16px;line-height:1.55">Submit Thursday, paid Friday. Every day this sits, Marlenyi is not paying you — no reason to leave money on the board.</div>
    </td></tr>
  </table>
</div>`;
}

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if(req.method !== "POST" && req.method !== "GET") return j(405, { ok:false, error:"Method not allowed" });
  let body: { to?: string; dry_run?: boolean } = {};
  if(req.method === "POST"){ try { body = await req.json(); } catch { body = {}; } }
  const dryRun = !!body.dry_run;
  const previewTo = body.to ? String(body.to).toLowerCase() : "";

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Only coordinators get this nudge. A broker technically has closed files on
  // her own board too, but she is the payer — reminding the person cutting the
  // check to invoice herself is noise, and the broker already sees the Ready
  // to invoice card on her own portal. TCs are the audience.
  const { data: tcs, error: tcsErr } = await admin.from("agents").select("id, first_name, last_name, email, role").eq("role", "tc");
  if(tcsErr) return j(500, { ok:false, error:"agents load: " + tcsErr.message });
  const { data: rates } = await admin.from("tc_pay_rates").select("tc_id, pct");
  const rateBy: Record<string, number> = {};
  (rates || []).forEach((r: any) => { rateBy[r.tc_id] = r.pct; });

  const { data: files, error: filesErr } = await admin.from("files").select("id, assigned_tc_id, agent_id, property_address, service_type, file_type, status, transaction_stage, invoice_id, archived_at, closing_date, actual_closing_date, raw_form_data").is("invoice_id", null);
  if(filesErr) return j(500, { ok:false, error:"files load: " + filesErr.message });

  const sent: any[] = [];
  const skipped: any[] = [];
  for(const tc of (tcs || [])){
    if(previewTo && String(tc.email || "").toLowerCase() !== previewTo) continue;
    if(!tc.email){ skipped.push({ tc: tc.id, reason:"no email" }); continue; }
    (tc as any).tc_pay_pct = rateBy[tc.id];
    // A TC's ready-to-bill = closed, not archived, not test-pool, not on any
    // invoice, not a self-transaction, pay > 0. Same shape as fileIsBillable()
    // on the portal, minus the completed-stage check (a closed file passes
    // that automatically per fileCompleted()).
    const ready = (files || []).filter((f: any) => {
      if(f.assigned_tc_id !== tc.id) return false;
      // Older archived rows have status='archived' but archived_at was never
      // stamped, so both checks are needed to reject them.
      if(f.archived_at || String(f.status || "").toLowerCase() === "archived") return false;
      if((f.raw_form_data || {}).test_pool) return false;
      if(!stageDone(f)) return false;
      if(isSelfTx(f, tc)) return false;
      return payCents(f, (tc as any).tc_pay_pct) > 0;
    });
    if(!ready.length){ skipped.push({ tc: tc.id, reason:"no ready-to-bill files" }); continue; }
    const total = ready.reduce((s: number, f: any) => s + payCents(f, (tc as any).tc_pay_pct), 0);
    const subject = ready.length === 1
      ? "One file ready to invoice · " + money(total)
      : ready.length + " files ready to invoice · " + money(total);
    if(dryRun){ sent.push({ tc: tc.id, email: tc.email, files: ready.length, total_cents: total, subject }); continue; }
    if(!RESEND){ skipped.push({ tc: tc.id, reason:"RESEND_API_KEY missing" }); continue; }
    const html = nudgeEmailHtml(tc, ready, total);
    let ok = false; let lastBody = "";
    for(const from of [FROM_PRIMARY, FROM_FALLBACK]){
      try {
        const r = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":`Bearer ${RESEND}`, "Content-Type":"application/json" }, body: JSON.stringify({ from, to:[tc.email], subject, html }) });
        lastBody = await r.text();
        if(r.ok){ ok = true; break; }
        if(!/not verified|domain|403|422/i.test(lastBody)) break;
      } catch(_){ /* try fallback */ }
    }
    if(ok) sent.push({ tc: tc.id, email: tc.email, files: ready.length, total_cents: total, subject });
    else skipped.push({ tc: tc.id, reason:"resend failed", body: lastBody.slice(0, 200) });
  }
  return j(200, { ok:true, sent, skipped, dry_run: dryRun });
});
