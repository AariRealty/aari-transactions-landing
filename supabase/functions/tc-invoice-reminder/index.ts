// Aari Transactions · tc-invoice-reminder (v8 · weekly STATUS email)
// ============================================================================
// Marlenyi (Jul 30): stop blasting every coordinator a "submit your invoice"
// nudge. A TC who just uploaded a file and has nothing checked has nothing to
// submit, so that ask is noise. Once a week, send each TC a STATUS of where
// their transactions stand: a stage stepper per file (Option B) with their pay
// at the end, a pipeline total, and a bit of motivation. The submit prompt only
// appears when they actually have billable work.
//
// Fired by cron "tc-invoice-thursday" (0 13 * * 4 UTC = 9am ET Thursday).
// {"to":"email"} previews the email for that one known agent (their real files).
//
// Pay is the SAME math as /js/pay-engine.js (price table x per-TC pct, File Org
// flat 50%), ported inline. Keep the numbers in sync if the catalog changes.
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
const SUBJECT = "Where your files stand this week";
const OWNER_SUBJECT = "Aari pipeline · Thursday";

function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
const INK = "#0f0f0f", LIGHT = "#e2ddd2", MUTED = "#8a857c", GREEN = "#2f6b4f";

// ---- pay · ported from /js/pay-engine.js (keep in sync) --------------------
const SERVICE_PRICE: Record<string, number> = {
  tc_one_side:399, tc_both_sides:599, tc:399, listing_coordinator:249,
  listing_docs:99, mls_setup:99, file_organization:99, standalone_review:149,
  offer_prep_basic:79, offer_prep_complete:149,
};
const SERVICE_ALIAS: Record<string,string> = {
  lc:"listing_coordinator", listing:"listing_coordinator", op_basic:"offer_prep_basic",
  op_complete:"offer_prep_complete", file_org:"file_organization",
};
// deno-lint-ignore no-explicit-any
function svcKey(f:any){ const s=String(f?.service_type||"").toLowerCase(); return SERVICE_ALIAS[s]||s; }
// deno-lint-ignore no-explicit-any
function isFileOrg(f:any){ const r=f?.raw_form_data||{}; return (f?.file_type||"")==="compliance" || svcKey(f)==="file_organization" || r.fo_override===true || r.fo_override==="true"; }
// deno-lint-ignore no-explicit-any
function payCents(f:any, pct:number){
  if(isFileOrg(f)) return Math.round(SERVICE_PRICE.file_organization * 50/100 * 100); // 49.5 -> 4950
  const p = SERVICE_PRICE[svcKey(f)] || 0;
  const n = (pct!=null && !isNaN(pct)) ? Number(pct) : 40;
  return p ? Math.round(Math.round(p*n/100) * 100) : 0; // atTcCut rounds to whole dollars first
}
const money = (c:number)=> "$" + (c/100).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2});

// ---- stage stepper + billable · mirrors the app's tracks -------------------
// deno-lint-ignore no-explicit-any
function trackFor(f:any){
  const svc = svcKey(f), ft = f.file_type||"sale";
  const saleIdx:Record<string,number> = { new:0, under_contract:1, ctc:2, closed:3 };
  if(ft==="sale" || svc==="tc"||svc==="tc_one_side"||svc==="tc_both_sides")
    return { stages:["New","Under contract","Clear to close","Closed"], idx: saleIdx[f.transaction_stage] ?? 0 };
  if(svc==="mls_setup")   return { stages:["Received","MLS input","Live"], idx:(({"Received":0,"MLS input":1,"Live":2}) as Record<string,number>)[f.service_stage] ?? 0 };
  if(svc==="listing_docs")return { stages:["Received","Package prep","Signed"], idx:(({"Received":0,"Package prep":1,"Signed":2}) as Record<string,number>)[f.service_stage] ?? (f.service_stage?2:0) };
  if(svc==="file_organization") return { stages:["Received","Uploading","Complete"], idx:(({"Received":0,"Uploading":1,"Complete":2}) as Record<string,number>)[f.service_stage] ?? (f.status==="closed"?2:0) };
  if(svc==="offer_prep_basic")  return { stages:["Received","Drafting","Delivered"], idx:(({"Received":0,"Drafting":1,"Delivered":2}) as Record<string,number>)[f.service_stage] ?? 0 };
  if(svc==="offer_prep_complete")return{ stages:["Received","Drafting","Counter","Executed"], idx:(({"Received":0,"Drafting":1,"Counter":2,"Executed":3}) as Record<string,number>)[f.service_stage] ?? 0 };
  // Marlenyi 2026-08-06: LC shares the 3-stage listing flow with MLS Setup and bills at Live.
  if(svc==="listing_coordinator")return{ stages:["Received","MLS input","Live"], idx:(({"Received":0,"MLS input":1,"Live":2}) as Record<string,number>)[f.service_stage] ?? 0 };
  return { stages:["New","In progress","Done"], idx:(({new:0,under_contract:1,closed:2}) as Record<string,number>)[f.transaction_stage] ?? 0 };
}
// deno-lint-ignore no-explicit-any
function isBillable(f:any){
  if(f.invoice_id || f.archived_at) return false;
  if((f.raw_form_data||{}).test_pool) return false;
  if(["archived","cancelled"].includes(f.status)) return false;
  if(f.transaction_stage==="closed" || f.status==="closed") return true;
  const t = trackFor(f), svc = svcKey(f);
  const upfront = ["mls_setup","listing_docs","file_organization","offer_prep_basic","offer_prep_complete","listing_coordinator"];
  return upfront.includes(svc) && t.idx >= t.stages.length-1;
}

// deno-lint-ignore no-explicit-any
function stepperHtml(f:any){
  const t = trackFor(f);
  const cells = t.stages.map((label, i) => {
    const done = i <= t.idx, current = i === t.idx;
    const barC = done ? INK : LIGHT, dotC = done ? INK : LIGHT;
    return `<td width='${Math.floor(100/t.stages.length)}%' style='text-align:center;vertical-align:top;padding:0 1px;font-family:Arial,Helvetica,sans-serif'>`+
      `<div style='height:3px;background:${barC};margin:0 0 6px;border-radius:2px'></div>`+
      `<div style='width:9px;height:9px;border-radius:50%;background:${dotC};margin:0 auto 4px'></div>`+
      `<div style='font-size:9px;line-height:1.2;color:${current?INK:MUTED};font-weight:${current?"bold":"normal"}'>${esc(label)}</div></td>`;
  }).join("");
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>${cells}</tr></table>`;
}

// deno-lint-ignore no-explicit-any
function fileRowHtml(f:any, pct:number){
  const street = esc(String(f.property_address||"File").split(",")[0]);
  const cents = payCents(f, pct);
  const bill = isBillable(f);
  const amt = cents>0 ? (bill ? `<span style='color:${GREEN};font-weight:bold'>${money(cents)} ready</span>` : `<span style='color:${MUTED}'>${money(cents)} at close</span>`) : "";
  return `<div style='margin:0 0 16px'>`+
    `<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>`+
      `<td style='font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${INK}'>${street}</td>`+
      `<td align='right' style='font-family:Arial,Helvetica,sans-serif;font-size:11px;white-space:nowrap'>${amt}</td>`+
    `</tr></table>`+
    `<div style='margin-top:7px'>${stepperHtml(f)}</div></div>`;
}

// deno-lint-ignore no-explicit-any
function bodyHtml(first:string, files:any[], pct:number){
  const shown = files.filter((f)=> payCents(f,pct)>0 || isBillable(f));
  const pipeline = shown.reduce((s,f)=> s + payCents(f,pct), 0);
  const readyCents = shown.filter(isBillable).reduce((s,f)=> s + payCents(f,pct), 0);
  const rows = shown.length
    ? shown.sort((a,b)=> (isBillable(b)?1:0)-(isBillable(a)?1:0)).map((f)=> fileRowHtml(f, pct)).join("")
    : `<p style='margin:0 0 16px;font-size:13px;color:${MUTED}'>Nothing active on your board right now. When a file comes in, you'll see it here.</p>`;
  const foot = readyCents>0
    ? `<p style='margin:0 0 10px;font-size:13px'><b style='color:${GREEN}'>${money(readyCents)} is ready to invoice.</b></p>`+
      `<div style='text-align:center;margin:0 0 2px'><a href='https://aaritransactions.com/files.html?view=invoice' style='display:inline-block;background:${INK};color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:11px 22px;border-radius:8px'>Submit my invoice</a></div>`
    : `<p style='margin:0;font-size:13px;color:${MUTED}'>Nothing is ready to invoice this week, so nothing to submit. You're all set.</p>`;
  const payRule = `<div style='margin-top:14px;background:#f7f5ef;border-radius:8px;padding:11px 13px;font-size:11px;line-height:1.55;color:#5f5e5a'><b style='color:#0f0f0f'>Submit by Thursday, paid Friday.</b> If your invoice isn't in by Thursday, it rolls to the next payment cycle.</div>`;
  const intro = pipeline>0
    ? `You've got <b>${money(pipeline)}</b> moving through your pipeline. Here's where each one is at.`
    : `Here's where your files stand this week.`;
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#fff'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='500' cellpadding='0' cellspacing='0' style='max-width:500px;width:100%;background:#fff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:28px 26px;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:14px;line-height:1.6'>`+
    `<p style='margin:0 0 12px'>Hi ${esc(first)},</p>`+
    `<p style='margin:0 0 20px;font-size:13px'>${intro}</p>`+
    rows +
    `<div style='margin-top:6px;padding-top:14px;border-top:0.5px solid #e6e2d8'>${foot}</div>`+
    payRule +
    `<div style='margin-top:20px;padding-top:12px;border-top:0.5px solid #e6e2d8'><div style='font-family:Georgia,serif;font-size:18px'>Aari Transactions</div><div style='font-size:10px;letter-spacing:2px;color:${MUTED};margin-top:4px'>FLORIDA TRANSACTION COORDINATION</div></div>`+
    `</td></tr></table></td></tr></table>`;
}

// ---- OWNER report · whole-team pipeline (Option A ledger + payables/flag line) ----
// deno-lint-ignore no-explicit-any
async function computeTeam(admin:any, pctById:Record<string,number>){
  // deno-lint-ignore no-explicit-any
  const roll = async (id:string, name:string, sendTo:string|null) => {
    const files = await filesForTc(admin, id);
    const pct = pctById[id] ?? 40;
    const shown = files.filter((f:any)=> payCents(f,pct)>0 || isBillable(f));
    const pipe = shown.reduce((s:number,f:any)=> s+payCents(f,pct), 0);
    const ready = shown.filter(isBillable).reduce((s:number,f:any)=> s+payCents(f,pct), 0);
    return { name, files:shown.length, pipe, ready, sendTo, allFiles:files, pct };
  };
  const { data: tcs } = await admin.from("agents").select("id, first_name, email").eq("role","tc");
  const perTc:{name:string;files:number;pipe:number;ready:number}[] = [];
  const tcRuns:{email:string;first:string;allFiles:any[];pct:number}[] = [];
  let teamCents=0, readyCents=0;
  for (const t of (tcs||[])) {
    if(!t.email) continue;
    const r = await roll(t.id, t.first_name||"TC", t.email);
    if(r.files>0){ perTc.push({name:r.name, files:r.files, pipe:r.pipe, ready:r.ready}); teamCents+=r.pipe; readyCents+=r.ready; }
    tcRuns.push({ email:t.email, first:t.first_name||"there", allFiles:r.allFiles, pct:r.pct });
  }
  // Broker's own coordinated files show as a "You" line (never a TC email).
  const { data: brokers } = await admin.from("agents").select("id, first_name").eq("role","broker");
  for (const b of (brokers||[])) {
    const r = await roll(b.id, "You", null);
    if(r.files>0){ perTc.push({name:"You", files:r.files, pipe:r.pipe, ready:r.ready}); teamCents+=r.pipe; readyCents+=r.ready; }
  }
  const { data: invs } = await admin.from("tc_invoices").select("total_cents,status").eq("status","submitted");
  const payablesCents = (invs||[]).reduce((s:number,i:any)=> s+(i.total_cents||0), 0);
  const { data: act } = await admin.from("files")
    .select("property_address, closing_date, transaction_stage, status")
    .not("status","in",'("archived","cancelled")').not("closing_date","is",null);
  const today = new Date(); today.setHours(0,0,0,0);
  const wk = new Date(today); wk.setDate(wk.getDate()+7);
  const closings:{street:string;date:Date}[] = []; const flagged:string[] = [];
  for (const f of (act||[])) {
    if(f.transaction_stage==="closed" || f.status==="closed") continue;
    const c = new Date(String(f.closing_date).slice(0,10)+"T12:00:00"); if(isNaN(c.getTime())) continue;
    const street = String(f.property_address||"").split(",")[0];
    if(c>=today && c<=wk) closings.push({ street, date:c });
    else if(c<today) flagged.push(street);
  }
  closings.sort((a,b)=> a.date.getTime()-b.date.getTime());
  return { perTc, teamCents, readyCents, payablesCents, closings, flagged, tcRuns };
}
// deno-lint-ignore no-explicit-any
function ownerReportHtml(first:string, team:any){
  const fmtD = (d:Date)=> d.toLocaleDateString("en-US",{ month:"short", day:"numeric" });
  const today = fmtD(new Date());
  // deno-lint-ignore no-explicit-any
  const ledger = team.perTc.length
    ? team.perTc.map((t:any)=>
        `<tr><td style='padding:8px 0;border-top:0.5px solid #e6e2d8;font-size:12px;font-family:Arial,Helvetica,sans-serif'>${esc(t.name)} <span style='color:${MUTED}'>&middot; ${t.files} file${t.files===1?"":"s"}</span></td>`+
        `<td align='right' style='padding:8px 0;border-top:0.5px solid #e6e2d8;font-size:12px;font-family:Arial,Helvetica,sans-serif'><b>${money(t.pipe)}</b>${t.ready>0?` <span style='color:${GREEN}'>&middot; ${money(t.ready)} ready</span>`:` <span style='color:${MUTED}'>&middot; 0 ready</span>`}</td></tr>`
      ).join("")
    : `<tr><td style='padding:8px 0;font-size:12px;color:${MUTED}'>No active coordinator files.</td></tr>`;
  const topLine = (team.payablesCents>0 || team.flagged.length)
    ? `<div style='background:#f2ede3;border-radius:8px;padding:11px 13px;margin:0 0 16px;font-size:12px;line-height:1.55'>`+
      (team.payablesCents>0 ? `<div><b>${money(team.payablesCents)} in payables go out Friday.</b> Approve in the invoice board.</div>` : "")+
      (team.flagged.length ? `<div style='color:#a3402f;margin-top:${team.payablesCents>0?"4px":"0"}'>${team.flagged.length} file${team.flagged.length===1?"":"s"} past a closing date: ${esc(team.flagged.slice(0,3).join(", "))}${team.flagged.length>3?"...":""}</div>` : "")+
      `</div>`
    : "";
  const closingLine = team.closings.length
    ? `<p style='margin:16px 0 3px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:${MUTED}'>Closing this week</p>`+
      `<p style='margin:0;font-size:11px;color:${MUTED}'>` + team.closings.slice(0,6).map((c:any)=> `${esc(c.street)} &middot; ${fmtD(c.date)}`).join("&nbsp;&nbsp;&nbsp;") + `</p>`
    : "";
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#fff'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='520' cellpadding='0' cellspacing='0' style='max-width:520px;width:100%;background:#fff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:28px 26px;font-family:Arial,Helvetica,sans-serif;color:${INK}'>`+
    `<div style='font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:${MUTED}'>Aari pipeline &middot; Thu ${today}</div>`+
    `<div style='font-family:Georgia,serif;font-size:30px;line-height:1.1;margin:3px 0 3px'>${money(team.teamCents)}</div>`+
    `<div style='font-size:11px;color:#5f5e5a;margin:0 0 18px'>across ${team.perTc.reduce((s:number,t:any)=>s+t.files,0)} active files &middot; <b style='color:${GREEN}'>${money(team.readyCents)} ready to invoice</b> &middot; ${money(team.payablesCents)} payables Friday</div>`+
    topLine +
    `<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>${ledger}</table>`+
    closingLine +
    `<div style='margin-top:22px;padding-top:12px;border-top:0.5px solid #e6e2d8'><div style='font-family:Georgia,serif;font-size:18px'>Aari Transactions</div><div style='font-size:10px;letter-spacing:2px;color:${MUTED};margin-top:4px'>OWNER PIPELINE REPORT</div></div>`+
    `</td></tr></table></td></tr></table>`;
}

function j(status:number, obj:unknown){ return new Response(JSON.stringify(obj), { status, headers:{...CORS,"Content-Type":"application/json"} }); }

// deno-lint-ignore no-explicit-any
async function filesForTc(admin:any, tcId:string){
  const { data } = await admin.from("files")
    .select("property_address, service_type, file_type, transaction_stage, service_stage, status, invoice_id, archived_at, raw_form_data")
    .eq("assigned_tc_id", tcId).not("status","in",'("archived","cancelled")').is("invoice_id", null);
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(()=> ({} as Record<string, unknown>));

  const { data: rates } = await admin.from("tc_pay_rates").select("tc_id, pct");
  const pctById: Record<string,number> = {};
  // deno-lint-ignore no-explicit-any
  (rates||[]).forEach((r:any)=>{ pctById[r.tc_id] = Number(r.pct); });

  // TEST · preview for one known agent. Broker gets the owner report, a TC gets their status.
  if (body && body.to) {
    const { data: who } = await admin.from("agents").select("id, first_name, email, role").ilike("email", String(body.to)).limit(1);
    if (!who || !who.length) return j(400, { ok:false, error:"no agent with that email" });
    const t = who[0];
    if (String(t.role||"")==="broker") {
      const team = await computeTeam(admin, pctById);
      const ok = await sendEmail(t.email, OWNER_SUBJECT, ownerReportHtml(t.first_name||"there", team));
      return j(ok?200:502, { ok, test:true, owner:true, sent_to:t.email, coordinators:team.perTc.length });
    }
    const files = await filesForTc(admin, t.id);
    const ok = await sendEmail(t.email, SUBJECT, bodyHtml(t.first_name||"there", files, pctById[t.id] ?? 40));
    return j(ok?200:502, { ok, test:true, sent_to:t.email, files:files.length });
  }

  // REAL weekly run · every coordinator gets a status, every broker gets the owner report.
  const { data: tcs } = await admin.from("agents").select("id, first_name, email").eq("role","tc");
  // deno-lint-ignore no-explicit-any
  const list = (tcs||[]).filter((t:any)=> t.email);
  let sent = 0;
  for (const t of list) {
    const files = await filesForTc(admin, t.id);
    const ok = await sendEmail(t.email, SUBJECT, bodyHtml(t.first_name||"there", files, pctById[t.id] ?? 40));
    if (ok) sent++;
  }
  const team = await computeTeam(admin, pctById);
  const { data: brokers } = await admin.from("agents").select("first_name, email").eq("role","broker");
  let ownerSent = 0;
  for (const b of (brokers||[])) { if(!b.email) continue; const ok = await sendEmail(b.email, OWNER_SUBJECT, ownerReportHtml(b.first_name||"there", team)); if(ok) ownerSent++; }
  return j(200, { ok:true, coordinators:list.length, sent, owner_reports:ownerSent });
});

async function sendEmail(to:string, subject:string, html:string): Promise<boolean>{
  if (!RESEND) return false;
  for (const from of [FROM_PRIMARY, FROM_FALLBACK]) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method:"POST", headers:{ "Authorization":`Bearer ${RESEND}`, "Content-Type":"application/json" },
        body: JSON.stringify({ from, to:[to], subject, html }),
      });
      if (r.ok) return true;
      const tx = await r.text();
      if (!/not verified|domain|403|422/i.test(tx)) return false;
    } catch(_){ /* try fallback */ }
  }
  return false;
}
