// Aari Transactions · submit-tc-invoice (v10, hardened + server-verified credit coverage).
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
// CREDIT COVERAGE. Decided HERE, against membership_credit_uses, not taken from the browser.
//
// The old reasoning was: coverage can only REDUCE pay to $0, so the figure computed here is a
// true CEILING and a tampered client can only ever under-claim, which costs the coordinator and
// not the company. That is sound about TAMPERING and it misses the accident. If `covered` arrives
// false or missing for an innocent reason (stale tab, membership load that failed, a race on the
// credit query) the server bills the FULL amount on a file a member already paid for with a
// credit, and stamps it legitimate. Aari pays twice for one job and the invoice looks perfect.
//
// A consumed credit is a fact in a table this function can read with the service role. So it
// reads it. `covered` from the client is still honoured on the way DOWN (a coordinator may waive
// their own pay), but it can no longer raise a line off $0 by staying silent. The lookup fails
// closed: if coverage cannot be established either way, the invoice is refused rather than
// priced at full.
//
// MONEY RULES COME FROM THE SHARED ENGINE — /js/pay-engine.js, the same file the cockpit loads.
// This function ships that exact file in its bundle, so there is ONE place to change a price and
// the invoice can never disagree with the screen the coordinator was looking at. (An earlier
// version hand-copied SERVICE_PRICE here, which is how /js/deadline-engine.js already ended up
// with two drifting "keep in sync" ports in friday-summary and loan-deadline-ping.)
// ⚠️ The bundle pins the copy it was deployed with: after editing a price in pay-engine.js,
// REDEPLOY this function or the server keeps the old number. `node js/pay-engine.test.js` guards it.
import { createClient } from "jsr:@supabase/supabase-js@2";
import "./pay-engine.js";
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

// ---- money rules · from the shared engine, not a copy ----
// pay-engine.js declares no import/export, so it is valid as BOTH a browser <script> and an ES
// module. Importing it for side effects hangs AariPayEngine off globalThis here exactly as it
// hangs off window in the cockpit.
const PAY = (globalThis as any).AariPayEngine;
if (!PAY) throw new Error("pay-engine.js did not load · refusing to price an invoice without the shared rules");
const AT_TC_PCT: number = PAY.AT_TC_PCT;

function row2(left: string, right: string, border: boolean){
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='${border?"border-top:0.5px solid #f0ebe0;":""}'><tr><td valign='top' style='padding:10px 0'>${left}</td><td valign='top' align='right' style='padding:10px 0;white-space:nowrap;font-size:12.5px;font-weight:600;color:#0f0f0f'>${right}</td></tr></table>`;
}
// Prior-unpaid banner · Marlenyi 2026-08-07 · Eileen sent a $400 invoice while
// her earlier $100 invoice (A-1044, July 24-30) was still unpaid. The new email
// gave no signal that a prior balance was pending, so Marlenyi paid the new one
// blind and had to be told separately about the old one. Broker email now shows
// a red block listing every outstanding invoice from THIS coordinator so the
// pending balance is impossible to miss.
function priorUnpaidBannerHtml(prior: any[]){
  if (!prior || !prior.length) return "";
  const rows = prior.map((p: any)=>{
    const num = esc(p.invoice_number || "");
    const period = p.period_start && p.period_end ? esc(p.period_start + " – " + p.period_end) : "";
    const sub = period ? `<div style='font-size:11px;color:#a36b58;margin-top:2px'>${period}</div>` : "";
    return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td style='padding:8px 0;border-top:0.5px solid #f6e3dc'><div style='font-size:12.5px;color:#0f0f0f;font-weight:600'>Invoice ${num}</div>${sub}</td><td align='right' valign='top' style='padding:8px 0;border-top:0.5px solid #f6e3dc;font-size:12.5px;font-weight:600;color:#993c1d;white-space:nowrap'>${money(Number(p.total_cents)||0)}</td></tr></table>`;
  }).join('');
  const owedNow = prior.reduce((s: number, p: any)=>s + (Number(p.total_cents)||0), 0);
  return `<div style='background:#fdf4f1;border:0.5px solid #f3d9d0;border-radius:11px;padding:14px 16px;margin-bottom:18px'>` +
    `<div style='display:flex;align-items:baseline;justify-content:space-between'>` +
      `<span style='font-family:Georgia,serif;font-size:14px;font-weight:600;color:#993c1d'>Still owed from prior invoices</span>` +
      `<span style='font-size:12px;font-weight:700;color:#993c1d'>${money(owedNow)}</span>` +
    `</div>` +
    `<div style='font-size:11.5px;color:#a36b58;margin:3px 0 8px;line-height:1.5'>${prior.length} invoice${prior.length===1?'':'s'} from this coordinator ${prior.length===1?'is':'are'} still marked submitted and unpaid.</div>` +
    rows +
  `</div>`;
}
function invoiceEmailHtml(o: any){
  const paid = o.items.filter((it: any)=>!it.covered);
  const covered = o.items.filter((it: any)=>it.covered);
  const total = o.total_cents;
  const priorBanner = (o.audience === 'broker') ? priorUnpaidBannerHtml(o.prior_unpaid || []) : "";
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
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#ffffff'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='440' cellpadding='0' cellspacing='0' style='max-width:440px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:30px 26px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'>`+
    `<div style='text-align:center;padding-bottom:20px;border-bottom:0.5px solid #ece8e0;margin-bottom:20px'><div style='font-family:Georgia,serif;font-size:22px'>Aari Transactions</div><div style='font-size:9.5px;letter-spacing:2px;color:#8a857c;margin-top:7px'>COORDINATOR INVOICE &middot; ${esc(o.invoice_number||'')}</div><div style='font-size:11px;color:#a39e93;margin-top:4px'>${esc(o.period||'')}</div></div>`+
    fromTo+
    priorBanner+
    `<div style='background:#0f0f0f;border-radius:11px;padding:18px;margin-bottom:20px;text-align:center'><div style='font-size:11px;color:#b8b8b8'>Due to you this week</div><div style='font-family:Georgia,serif;font-size:34px;color:#ffffff;line-height:1.1;margin-top:3px'>${money(total)}</div><div style='font-size:11.5px;color:#9a9a9a;margin-top:4px'>${paid.length} paid &middot; ${covered.length} covered by client credits</div></div>`+
    (paid.length?`<div style='font-size:10px;letter-spacing:1px;color:#3e7d57;margin-bottom:2px'>YOU&rsquo;RE OWED</div>${paidRows}`:'')+
    coveredHtml+
    totalRow+
    // ONE invoice design, two audiences. The coordinator used to get a two-line plain note while
    // the broker got this full invoice. Marlenyi: "make the email send out to Eileen like the one
    // I get." Same document for both; only the call to action differs, because "Review and mark
    // paid" is the BROKER's action. A coordinator cannot mark her own invoice paid, so hers points
    // at her invoice screen and states when payment goes out.
    (o.audience === 'tc'
      ? `<div style='text-align:center;margin-top:20px'><a href='https://aaritransactions.com/files.html?view=invoice' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>View my invoice</a></div>`
      : `<div style='text-align:center;margin-top:20px'><a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>Review and mark paid</a></div>`)+
    (o.audience === 'tc'
      ? `<div style='font-size:10.5px;color:#a39e93;margin-top:16px;line-height:1.5;text-align:center'>Submitted to Aari Transactions. Payment goes out Friday.<br>${o.items.length} files this week &middot; ${paid.length} paid, ${covered.length} covered by membership credits.</div>`
      : `<div style='font-size:10.5px;color:#a39e93;margin-top:16px;line-height:1.5;text-align:center'>${o.items.length} files this week &middot; ${paid.length} paid, ${covered.length} covered by membership credits.</div>`)+
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
    .select("id, service_type, file_type, agent_id, assigned_tc_id, invoice_id, property_address, raw_form_data, status, archived_at")
    .in("id", fileIds);
  if (fErr) return j(500,{ ok:false, error:"file lookup failed: " + fErr.message });
  const byId = new Map((dbFiles||[]).map((f: any)=>[String(f.id), f]));

  // Ownership + double-bill gates.
  const notFound = fileIds.filter((id: any)=>!byId.has(String(id)));
  if (notFound.length) return j(400,{ ok:false, error:`unknown file(s): ${notFound.join(", ")}` });

  // ARCHIVED AND TEST FILES ARE NOT BILLABLE, AND THE SERVER SAYS SO TOO.
  //
  // deriveStage() in the cockpit maps 'archived' onto the stage 'closed', and a TC file bills when
  // it closes. So archiving a mistake INVOICED it. Eileen's first invoice was $1,600 across 8
  // lines: seven were archived tests and duplicate email imports ("ROUTING TEST - Samantha to
  // Eileen", "Not Valid", 313 NE 5th Ter twice, 3815 NW 22nd Ter twice, 1130 NW 14th Ter). One was
  // real. $1,400 of nothing, and THIS function would have accepted every line, because it checked
  // ownership and double-billing but never whether the file still counts.
  //
  // The client now filters them. That is not enough: the client is also what produced this list.
  // A rule this expensive belongs where it cannot be skipped.
  const dead = (dbFiles||[]).filter((f: any)=>
    f.status === "archived" || f.archived_at || (f.raw_form_data && f.raw_form_data.test_pool));
  if (dead.length) return j(422,{ ok:false,
    error: "archived or test file(s) cannot be invoiced: " + dead.map((f: any)=>f.property_address || f.id).join(", ") });
  const notYours = (dbFiles||[]).filter((f: any)=>String(f.assigned_tc_id||"") !== String(tcId)).map((f: any)=>f.id);
  if (notYours.length) return j(403,{ ok:false, error:`file(s) not assigned to you: ${notYours.join(", ")}` });
  const already = (dbFiles||[]).filter((f: any)=>f.invoice_id).map((f: any)=>f.id);
  if (already.length) return j(409,{ ok:false, error:`file(s) already invoiced: ${already.join(", ")}` });

  // MEMBERSHIP CREDIT COVERAGE · decided HERE, from the database, not from the browser.
  //
  // This used to be `const covered = it.covered === true` and nothing else: the server took the
  // page's word for whether a membership credit had already paid for a file. The ceiling above
  // stops a line being inflated, so the risk was never someone over-billing. It was the quiet
  // opposite. If `covered` arrived false or missing for ANY reason (a stale tab, a membership
  // lookup that failed, a race on the credit query, an edited page) the server billed the full
  // amount on a file the member had already paid for with a credit, and recorded it as
  // legitimate. Aari pays twice for one job and nothing on the invoice looks wrong.
  //
  // A consumed credit is a FACT in membership_credit_uses, and this function holds the service
  // role, so it can just look. It does. The client no longer gets a vote on the way down.
  const { data: creditRows, error: cErr } = await admin
    .from("membership_credit_uses")
    .select("file_id, agent_id, service_id")
    .in("file_id", fileIds);
  // Fail closed. If we cannot prove coverage either way, do NOT silently bill the full amount.
  if (cErr) return j(500,{ ok:false, error:"credit lookup failed, refusing to price this invoice: " + cErr.message });
  const coveredByServer = new Set((creditRows||[]).map((r: any)=>String(r.file_id)));

  // Recompute every line from the DB row.
  const tcName = ((tc.first_name||"")+" "+(tc.last_name||"")).trim();
  const disagreed: string[] = [];
  const safeItems = items.map((it: any)=>{
    const f = byId.get(String(it.file_id));
    // Same call the cockpit makes. The TC's name lets the engine catch imported files whose agent
    // is stored as free text — the old hand-copy here omitted that branch, so the server and the
    // screen already disagreed on self-coordinated files.
    const ceiling = PAY.tcPayCeiling(f, pct, tcName);
    const serverCovered = coveredByServer.has(String(f.id));
    // The client may still pull a line to $0 on its own (it can only ever REDUCE, and a
    // coordinator waiving their own pay is allowed). It can no longer raise one off $0 by
    // forgetting to say "covered".
    const covered = serverCovered || it.covered === true;
    if (serverCovered && it.covered !== true) disagreed.push(String(f.id));
    const amount = covered ? 0 : ceiling;
    return {
      file_id: f.id,
      address: f.property_address || "File",
      service: it.service || f.service_type || "Service",
      closed_date: it.closed_date || "",
      amount_cents: Math.round(amount * 100),
      ...(covered ? { covered:true, covered_source: serverCovered ? "membership_credit_uses" : "client", client: it.client, credit_no: it.credit_no } : {}),
      ...(it.over ? { over:true } : {}),
    };
  });
  // Loud, because this means a screen showed a coordinator money they were never owed.
  if (disagreed.length) console.error(`CREDIT COVERAGE MISMATCH · tc=${tcId} · server says covered, page did not: ${disagreed.join(", ")} · billed $0 per the database`);
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

  // Co-invoice detection · a file on THIS invoice shares its address with an active
  // file assigned to a DIFFERENT TC. This is Hibiscus's approved case (Milennys and
  // Eileen both run File Org on 1219 Hibiscus), but usually a signal the broker
  // should look and archive the dupe. Fires platform-alert (best-effort — a failure
  // here never blocks the invoice; the alert is a heads-up, not a gate).
  try {
    const invoicedIds = new Set(fileIds.map(String));
    const seen = new Set<string>();
    for (const it of safeItems) {
      const f = byId.get(String(it.file_id));
      const addr = f?.property_address ? normAddr(String(f.property_address)) : "";
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      const { data: siblings } = await admin
        .from("files")
        .select("id, assigned_tc_id, status, raw_form_data")
        .ilike("property_address", addressPrefixLike(String(f.property_address)))
        .neq("assigned_tc_id", tcId)
        .not("status", "in", "(archived,cancelled)")
        .limit(5);
      const otherTc = (siblings || []).find((s: any) => !!s.assigned_tc_id && !invoicedIds.has(String(s.id)));
      if (!otherTc) continue;
      const approved = !!(f?.raw_form_data && (f.raw_form_data as any).co_invoice_approved)
                    || !!(otherTc.raw_form_data && (otherTc.raw_form_data as any).co_invoice_approved);
      const otherTcName = await lookupTcName(admin, otherTc.assigned_tc_id);
      const week = (body.period_start && body.period_end) ? `${body.period_start} – ${body.period_end}` : "this week";
      // Fire and forget — never await the fetch, never let a failure surface.
      admin.functions.invoke("platform-alert", {
        body: { kind: "co_invoice", file_id: f.id, extra: { tc_id: tcId, other_tc_name: otherTcName, other_file_id: otherTc.id, week, approved } },
      }).catch(() => {});
    }
  } catch (e) { console.warn("co-invoice alert skipped:", (e as any)?.message || e); }

  const tcLabel = tcName || "A coordinator";
  const period = (body.period_start && body.period_end) ? (body.period_start + " – " + body.period_end) : "";
  const { data: broker } = await admin.from("agents").select("email").eq("role","broker").order("created_at",{ ascending:true }).limit(1).maybeSingle();
  const brokerEmail = (broker && broker.email) || "marlenyi@aaritransactions.com";

  // Prior-unpaid lookup · every previously-submitted invoice from THIS same
  // coordinator that hasn't been marked paid yet (excludes the one we just
  // inserted). If any exist, the broker email leads with a red "Still owed"
  // banner listing them so the pending balance can't be missed. Best-effort
  // — if the lookup fails we still send the invoice, just without the flag.
  let priorUnpaid: any[] = [];
  try {
    const { data: outstanding } = await admin
      .from("tc_invoices")
      .select("invoice_number, period_start, period_end, total_cents, created_at")
      .eq("tc_id", tcId)
      .eq("status", "submitted")
      .neq("id", inv.id)
      .order("created_at", { ascending: true });
    priorUnpaid = outstanding || [];
  } catch (_) { priorUnpaid = []; }
  const priorSum = priorUnpaid.reduce((s: number, p: any)=>s + (Number(p.total_cents)||0), 0);

  const html = invoiceEmailHtml({ invoice_number: inv.invoice_number, period, tc_name: tcLabel, items: safeItems, total_cents: total, audience: 'broker', prior_unpaid: priorUnpaid });
  // The coordinator now gets the SAME invoice document the broker gets (audience:'tc' swaps only
  // the call to action). It used to be a two-line plain note, which gave her no record of what she
  // actually billed — she had to take the total on faith.
  const tcHtml = invoiceEmailHtml({ invoice_number: inv.invoice_number, period, tc_name: tcLabel, items: safeItems, total_cents: total, audience: 'tc' });
  // Subject line carries the running-balance flag too. A skimmed inbox now shows
  // "New invoice from Eileen · $400 · $100 still unpaid" instead of just $400.
  const brokerSubject = priorSum > 0
    ? `New invoice from ${tcLabel} · ${money(total)} · ${money(priorSum)} still unpaid`
    : `New invoice from ${tcLabel} · ${money(total)}`;
  await sendEmail(brokerEmail, brokerSubject, html);
  if (tc.email) await sendEmail(tc.email, `Invoice ${inv.invoice_number} sent · ${money(total)}`, tcHtml);
  return j(200,{ ok:true, invoice_id:inv.id, invoice_number:inv.invoice_number, total_cents:total, prior_unpaid_cents: priorSum });
});
// Address normalization for co-invoice detection. We match on the first token
// of the address (street + number), lowercased, so "1219 Hibiscus Ave, Lehigh
// Acres, FL 33972" and "1219 Hibiscus Ave, Lehigh Acres, Florida 33972" collide.
function normAddr(s: string): string {
  const first = String(s || "").split(",")[0] || "";
  return first.toLowerCase().replace(/\s+/g, " ").trim();
}
function addressPrefixLike(s: string): string {
  const first = String(s || "").split(",")[0] || "";
  return first.replace(/[%_]/g, "\\$&").trim() + "%";
}
async function lookupTcName(admin: any, id: string | null): Promise<string> {
  if (!id) return "another TC";
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    const email = data?.user?.email;
    if (!email) return id.slice(0, 8);
    const local = String(email).split("@")[0] || email;
    return local.split(/[._-]+/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  } catch (_) { return id.slice(0, 8); }
}

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
