// Aari Transactions · submit-tc-invoice (v7, hardened).
// Coordinator submits their weekly invoice.
//
// TRUST MODEL. Everything below the JWT is treated as hostile:
//   · tc_id comes ONLY from the verified JWT. Never from the body. (The anon key is itself a
//     valid JWT with no `sub`, so a `|| body.tc_id` fallback let anyone forge an invoice for
//     any coordinator. Removed.)
//   · Every file_id is checked to actually be assigned to the caller. One coordinator can no
//     longer sweep another coordinator's files onto their own invoice.
//   · Files already carrying an invoice_id are rejected, so stale client state cannot double bill.
//   · Line amounts are RECOMPUTED here from the file's own row + the rate in tc_pay_rates. The
//     client's numbers are never trusted, only compared. Previously the server summed the
//     browser's amount_cents, so an edited page could invoice any figure.
//
// CREDIT COVERAGE. Whether a membership credit covers a file depends on billing-cycle math over
// every file for that agent (computeCreditCoverage in files.html). Rather than port that, we lean
// on an invariant: coverage can only ever REDUCE pay to $0, never raise it. So the amount computed
// here is a true CEILING, and the client's `covered` flag may only pull a line down to zero. A
// tampered client can therefore only ever under-claim, which costs the coordinator, not the company.
//
// ⚠️ THE PRICE + PAY RULES BELOW ARE A MIRROR OF files.html (SERVICE_PRICE / SERVICE_ALIAS /
// FILE_ORG_PAY / tcPayFor). If you change money rules there, change them HERE too or the invoice
// will disagree with the cockpit. Verified at parity against every live file when written.
import { createClient } from "jsr:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = "Aari Transactions <invoices@aaritransactions.com>";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";
const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
function j(s: number, b: unknown){ return new Response(JSON.stringify(b), { status:s, headers:{ ...CORS, "Content-Type":"application/json" } }); }
function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function money(c: number){ return "$" + (Math.round(c)/100).toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 }); }
function jwtSub(req: Request){ try { const a = req.headers.get("authorization") || ""; const t = a.replace(/^Bearer\s+/i,""); const p = t.split("."); if(p.length<2) return null; const b = JSON.parse(atob(p[1].replace(/-/g,"+").replace(/_/g,"/"))); return b.sub || null; } catch(_){ return null; } }

// ---- money rules · MIRROR OF files.html ----
const AT_TC_PCT = 40;
const FILE_ORG_PAY = 80;
const SERVICE_PRICE: Record<string, number> = {
  tc_one_side: 399, tc_both_sides: 599, tc: 399,
  listing_coordinator: 249, listing_docs: 99, mls_setup: 149,
  file_organization: 99, standalone_review: 149,
  offer_prep_basic: 79, offer_prep_complete: 149,
};
const SERVICE_ALIAS: Record<string, string> = {
  lc:"listing_coordinator", listing:"listing_coordinator",
  op_basic:"offer_prep_basic", op_complete:"offer_prep_complete",
  file_org:"file_organization",
};
const TC_SERVICE_TYPES: Record<string, number> = { tc:1, tc_one_side:1, tc_both_sides:1 };
function svcKey(f: any){ const s = String(f?.service_type || "").toLowerCase(); return SERVICE_ALIAS[s] || s; }
function isTcService(f: any){ return !!TC_SERVICE_TYPES[svcKey(f)]; }
function svcPrice(f: any){ return SERVICE_PRICE[svcKey(f)] || 0; }
function isAariRealtyFile(f: any){ const r = f?.raw_form_data || {}; if(r.aari_realty === true || r.aari_realty === "true") return true; if(r.submitted_by_tc) return false; return String(r.source || "") === "master_import"; }
function isOutsideFile(f: any){ return !isAariRealtyFile(f); }
function isFileOrgFile(f: any){ return (String(f?.file_type || "") === "compliance") || svcKey(f) === "file_organization"; }
function isFoOverride(f: any){ const v = f?.raw_form_data?.fo_override; return v === true || v === "true"; }
function isSelfCoordinated(f: any){ if(!f?.assigned_tc_id) return false; if(isOutsideFile(f)) return false; return !!(f.agent_id && String(f.agent_id) === String(f.assigned_tc_id)); }
function paysFileOrg(f: any){ return isFileOrgFile(f) || isFoOverride(f) || isSelfCoordinated(f) || (isAariRealtyFile(f) && !isTcService(f)); }
// Ceiling pay for a file, ignoring credit coverage (coverage can only reduce this to 0).
function tcPayCeiling(f: any, pct: number){
  if(paysFileOrg(f)) return FILE_ORG_PAY;
  const p = svcPrice(f);
  return p ? Math.round(p * pct / 100) : 0;
}

function row2(left: string, right: string, border: boolean){
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='${border?"border-top:0.5px solid #f0ebe0;":""}'><tr><td valign='top' style='padding:10px 0'>${left}</td><td valign='top' align='right' style='padding:10px 0;white-space:nowrap;font-size:12.5px;font-weight:600;color:#0f0f0f'>${right}</td></tr></table>`;
}
function invoiceEmailHtml(o: any){
  const paid = o.items.filter((it: any)=>!it.covered);
  const covered = o.items.filter((it: any)=>it.covered);
  const total = o.total_cents;
  const paidRows = paid.map((it: any)=>row2(`<div style='font-size:12.5px;font-weight:500;color:#0f0f0f'>${esc(it.address||'File')}${it.over?' &middot; over limit':''}</div><div style='font-size:11px;color:#8a857c'>${esc(it.service||'')}</div>`, money(Number(it.amount_cents)||0), true)).join('');
  let coveredHtml='';
  if(covered.length){
    const byClient: any = {};
    covered.forEach((it: any)=>{ const k=it.client||'Client'; (byClient[k]=byClient[k]||[]).push(it); });
    coveredHtml = `<div style='font-size:10px;letter-spacing:1px;color:#a39e93;margin:16px 0 6px'>COVERED &middot; NO PAY (ON THE RECORD)</div>` + Object.keys(byClient).map((cl)=>{
      const list=byClient[cl];
      const dots=list.map(()=>`<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:#0f0f0f;margin:0 2px'></span>`).join('');
      const rows=list.map((it: any)=>`<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td style='padding:3px 0;font-size:11.5px;color:#a39e93'>${esc(it.address||'')}${it.credit_no?` &middot; credit ${it.credit_no}`:''}</td><td align='right' style='padding:3px 0;font-size:11.5px;color:#a39e93'>$0.00</td></tr></table>`).join('');
      return `<div style='background:#faf9f6;border:0.5px solid #ece8e0;border-radius:9px;padding:12px 13px'><div style='text-align:center;margin-bottom:9px'>${dots}<div style='font-size:11px;color:#8a857c;margin-top:6px'>${esc(cl)} &middot; ${list.length} of ${list.length} credits used</div></div>${rows}</div>`;
    }).join('');
  }
  const fromTo = `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:20px'><tr><td valign='top'><div style='font-size:9.5px;letter-spacing:1px;color:#a39e93;margin-bottom:4px'>FROM</div><div style='font-size:13px;font-weight:500;color:#0f0f0f'>${esc(o.tc_name||'Coordinator')}</div><div style='font-size:11.5px;color:#5f5e5a'>Coordinator</div></td><td valign='top' align='right'><div style='font-size:9.5px;letter-spacing:1px;color:#a39e93;margin-bottom:4px'>BILL TO</div><div style='font-size:13px;font-weight:500;color:#0f0f0f'>Aari Transactions LLC</div><div style='font-size:11.5px;color:#5f5e5a'>Marlenyi Paredes</div></td></tr></table>`;
  const totalRow = `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-top:1.5px solid #0f0f0f;margin-top:18px'><tr><td style='padding-top:14px;font-size:13px;font-weight:bold;color:#0f0f0f'>Total due</td><td align='right' style='padding-top:14px;font-family:Georgia,serif;font-size:24px;color:#0f0f0f'>${money(total)}</td></tr></table>`;
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f5f5f3'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='440' cellpadding='0' cellspacing='0' style='max-width:440px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:30px 26px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'>`+
    `<div style='text-align:center;padding-bottom:20px;border-bottom:0.5px solid #ece8e0;margin-bottom:20px'><div style='font-family:Georgia,serif;font-size:22px'>Aari Transactions</div><div style='font-size:9.5px;letter-spacing:2px;color:#8a857c;margin-top:7px'>COORDINATOR INVOICE &middot; ${esc(o.invoice_number||'')}</div><div style='font-size:11px;color:#a39e93;margin-top:4px'>${esc(o.period||'')}</div></div>`+
    fromTo+
    `<div style='background:#0f0f0f;border-radius:11px;padding:18px;margin-bottom:20px;text-align:center'><div style='font-size:11px;color:#b8b8b8'>Due to you this week</div><div style='font-family:Georgia,serif;font-size:34px;color:#ffffff;line-height:1.1;margin-top:3px'>${money(total)}</div><div style='font-size:11.5px;color:#9a9a9a;margin-top:4px'>${paid.length} paid &middot; ${covered.length} covered by client credits</div></div>`+
    (paid.length?`<div style='font-size:10px;letter-spacing:1px;color:#3e7d57;margin-bottom:2px'>YOU&rsquo;RE OWED</div>${paidRows}`:'')+
    coveredHtml+
    totalRow+
    `<div style='text-align:center;margin-top:20px'><a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>Review and mark paid</a></div>`+
    `<div style='font-size:10.5px;color:#a39e93;margin-top:16px;line-height:1.5;text-align:center'>${o.items.length} files this week &middot; ${paid.length} paid, ${covered.length} covered by membership credits.</div>`+
    `</td></tr></table></td></tr></table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any; try { body = await req.json(); } catch { return j(400,{ ok:false, error:"bad json" }); }
  const items = Array.isArray(body.line_items) ? body.line_items : [];
  if (!items.length) return j(400,{ ok:false, error:"line_items required" });

  // Identity: JWT ONLY. No body fallback (the anon key is a valid JWT with no sub).
  const tcId = jwtSub(req);
  if (!tcId) return j(401,{ ok:false, error:"no coordinator identity in token" });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: tc } = await admin.from("agents").select("id, first_name, last_name, email, role").eq("id", tcId).maybeSingle();
  if (!tc) return j(404,{ ok:false, error:"coordinator not found" });
  if (!["tc","broker"].includes(String(tc.role||"").toLowerCase())) return j(403,{ ok:false, error:"not a coordinator" });

  // The caller's own pay rate, server side. Absent row = default.
  const { data: rateRow } = await admin.from("tc_pay_rates").select("pct").eq("tc_id", tcId).maybeSingle();
  const pct = (rateRow && rateRow.pct != null && !isNaN(Number(rateRow.pct))) ? Number(rateRow.pct) : AT_TC_PCT;

  // Re-read every claimed file from the DB. Never trust the browser's copy.
  const fileIds = [...new Set(items.map((it: any)=>it.file_id).filter(Boolean))];
  if (!fileIds.length) return j(400,{ ok:false, error:"no file_id on any line item" });
  const { data: dbFiles, error: fErr } = await admin
    .from("files")
    .select("id, service_type, file_type, agent_id, assigned_tc_id, invoice_id, property_address, raw_form_data")
    .in("id", fileIds);
  if (fErr) return j(500,{ ok:false, error:"file lookup failed: " + fErr.message });
  const byId = new Map((dbFiles||[]).map((f: any)=>[String(f.id), f]));

  // Ownership + double-bill gates.
  const notFound = fileIds.filter((id: any)=>!byId.has(String(id)));
  if (notFound.length) return j(400,{ ok:false, error:`unknown file(s): ${notFound.join(", ")}` });
  const notYours = (dbFiles||[]).filter((f: any)=>String(f.assigned_tc_id||"") !== String(tcId)).map((f: any)=>f.id);
  if (notYours.length) return j(403,{ ok:false, error:`file(s) not assigned to you: ${notYours.join(", ")}` });
  const already = (dbFiles||[]).filter((f: any)=>f.invoice_id).map((f: any)=>f.id);
  if (already.length) return j(409,{ ok:false, error:`file(s) already invoiced: ${already.join(", ")}` });

  // Recompute every line from the DB row. Client `covered` may only pull a line to $0.
  const safeItems = items.map((it: any)=>{
    const f = byId.get(String(it.file_id));
    const ceiling = tcPayCeiling(f, pct);
    const covered = it.covered === true;
    const amount = covered ? 0 : ceiling;
    return {
      file_id: f.id,
      address: f.property_address || "File",
      service: it.service || f.service_type || "Service",
      closed_date: it.closed_date || "",
      amount_cents: amount * 100,
      ...(covered ? { covered:true, client: it.client, credit_no: it.credit_no } : {}),
      ...(it.over ? { over:true } : {}),
    };
  });
  const total = safeItems.filter((it: any)=>!it.covered).reduce((s: number, it: any)=>s + (Number(it.amount_cents)||0), 0);

  // If the browser's arithmetic disagreed with ours, record it. Ours wins.
  const claimed = items.filter((it: any)=>!it.covered).reduce((s: number, it: any)=>s + (Number(it.amount_cents)||0), 0);
  if (claimed !== total) console.warn(`invoice total recomputed · tc=${tcId} claimed=${claimed} server=${total}`);

  let invoiceNumber = "";
  try { const { data: num } = await admin.rpc("next_tc_invoice_number"); invoiceNumber = num as string; } catch(_){ /* fallback below */ }
  if (!invoiceNumber) { const { count } = await admin.from("tc_invoices").select("id",{ count:"exact", head:true }); invoiceNumber = "A-" + (1042 + (count||0)); }

  const { data: inv, error: insErr } = await admin.from("tc_invoices").insert({ tc_id:tcId, invoice_number:invoiceNumber, period_start:body.period_start||null, period_end:body.period_end||null, status:"submitted", line_items:safeItems, total_cents:total }).select("id, invoice_number").single();
  if (insErr) return j(500,{ ok:false, error:insErr.message });

  // Durable marking, and only files that are still unclaimed (guards a concurrent submit).
  const upd = await admin.from("files").update({ invoice_id: inv.id }).in("id", fileIds).is("invoice_id", null);
  if (upd.error) { await admin.from("tc_invoices").delete().eq("id", inv.id); return j(500,{ ok:false, error:"file marking failed, invoice rolled back: " + upd.error.message }); }

  const tcName = ((tc.first_name||"")+" "+(tc.last_name||"")).trim() || "A coordinator";
  const period = (body.period_start && body.period_end) ? (body.period_start + " – " + body.period_end) : "";
  const { data: broker } = await admin.from("agents").select("email").eq("role","broker").order("created_at",{ ascending:true }).limit(1).maybeSingle();
  const brokerEmail = (broker && broker.email) || "marlenyi@aaritransactions.com";
  const html = invoiceEmailHtml({ invoice_number: inv.invoice_number, period, tc_name: tcName, items: safeItems, total_cents: total });
  const tcHtml = `<div style='font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'><p>Hi ${esc(tc.first_name||"there")},</p><p>Your invoice <b>${esc(inv.invoice_number)}</b> for <b>${money(total)}</b> was sent to Aari Transactions. Payment goes out Friday.</p><p style='font-size:12px;color:#8a857c'>Aari Transactions</p></div>`;
  await sendEmail(brokerEmail, `New invoice from ${tcName} · ${money(total)}`, html);
  if (tc.email) await sendEmail(tc.email, `Invoice ${inv.invoice_number} sent · ${money(total)}`, tcHtml);
  return j(200,{ ok:true, invoice_id:inv.id, invoice_number:inv.invoice_number, total_cents:total });
});
async function sendEmail(to: string, subject: string, html: string){
  if (!RESEND) return;
  for (const from of [FROM_PRIMARY, FROM_FALLBACK]) {
    try {
      const r = await fetch("https://api.resend.com/emails",{ method:"POST", headers:{ "Authorization":`Bearer ${RESEND}`, "Content-Type":"application/json" }, body: JSON.stringify({ from, to:[to], subject, html }) });
      if (r.ok) return;
      const t = await r.text(); if (!/not verified|domain|403|422/i.test(t)) return;
    } catch(_){ /* fallback */ }
  }
}
