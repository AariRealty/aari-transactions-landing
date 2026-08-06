// Aari Transactions · send-broker-escalation-sms-to-agent (EMAIL transport)
// Fires when a file flips to 'awaiting_broker_review'. Emails the BROKER that
// the file has landed on her desk (the key ask: owned-client rejections come to
// the broker, never the next TC), and sends the agent a short reassurance.
// Free (Resend), replaces the paid SMS. Body: { file_id: uuid }
//
// Name kept for backward compat with the DB trigger; transport is email now,
// not SMS. The short 4-char file-id prefix ("File 3BC4 needs you") that used
// to open every subject line was Marlenyi-requested-out on 2026-08-05
// — property address is the primary identifier now.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <notifications@aaritransactions.com>";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";
const COCKPIT_URL = Deno.env.get("TC_COCKPIT_URL") ?? "https://aaritransactions.com/files.html";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function j(s: number, b: unknown){ return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
function esc(s: string){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function sendEmail(to: string, subject: string, text: string, html: string){
  if(!RESEND_API_KEY) return { ok:false, error:"RESEND_API_KEY not set" };
  for(const from of [FROM_PRIMARY, FROM_FALLBACK]){
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "Authorization":`Bearer ${RESEND_API_KEY}`, "Content-Type":"application/json" }, body: JSON.stringify({ from, to:[to], subject, text, html }) });
    } catch(e){ return { ok:false, error:"Network: "+(e instanceof Error?e.message:String(e)) }; }
    if(res.ok){ let d:{id?:string}={}; try{ d = await res.json(); }catch(_){} return { ok:true, id:d.id }; }
    let t=""; try{ t = await res.text(); }catch(_){}
    if(!/not verified|domain|403|422/i.test(t)) return { ok:false, error:`Resend ${res.status}: ${t.slice(0,200)}` };
  }
  return { ok:false, error:"send failed" };
}

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { file_id?: string };
  try { body = await req.json(); } catch { return j(400, { ok:false, error:"Invalid JSON" }); }
  if(!body.file_id) return j(400, { ok:false, error:"file_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: f } = await admin.from("files").select("id, agent_id, assigned_tc_id, property_address").eq("id", body.file_id).maybeSingle();
  if(!f) return j(404, { ok:false, error:"File not found" });

  const propertyShort = (f.property_address || "a file").split(",")[0].trim();

  // Names + owner TC + escalation reason.
  const { data: agent } = await admin.from("agents").select("first_name, last_name, email").eq("id", f.agent_id).maybeSingle();
  const agentName = `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim() || "an agent";
  let ownerName = "the assigned coordinator";
  if(f.assigned_tc_id){ const { data: tc } = await admin.from("agents").select("first_name").eq("id", f.assigned_tc_id).maybeSingle(); if(tc?.first_name) ownerName = tc.first_name; }
  let reason = "";
  try { const { data: h } = await admin.from("file_tc_history").select("metadata").eq("file_id", f.id).eq("event_type","broker_escalated").order("created_at",{ascending:false}).limit(1).maybeSingle(); reason = String((h?.metadata as any)?.reason || ""); } catch(_){}
  const owned = reason === "owned_client_timeout";
  const reasonLine = owned
    ? `${ownerName} is the coordinator for this client and did not accept it in time, so it came straight to you as the rule requires.`
    : `No coordinator accepted it, so it escalated to you.`;

  // Broker email · property address as the primary identifier (no file-id prefix).
  const { data: broker } = await admin.from("agents").select("email").eq("role","broker").not("email","is",null).limit(1).maybeSingle();
  const brokerEmail = broker?.email || "marlenyi@aarirealty.com";
  const bSubject = `File needs you · ${propertyShort}`;
  const bText = `Hi,\n\nThe file at ${propertyShort} from ${agentName} has come to you.\n\n${reasonLine}\n\nIt has not been sent to any other coordinator. Open your cockpit to assign or handle it: ${COCKPIT_URL}\n\nAari Transactions`;
  const bHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.6;font-size:15px;">`+
    `<p>Hi,</p>`+
    `<p>The file at <strong>${esc(propertyShort)}</strong> from ${esc(agentName)} has come to you.</p>`+
    `<p>${esc(reasonLine)}</p>`+
    `<p><a href="${esc(COCKPIT_URL)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Open cockpit</a></p>`+
    `<p style="color:#555;">It has not been sent to any other coordinator.</p>`+
    `<p style="color:#555;">Aari Transactions</p></div>`;
  const rb = await sendEmail(brokerEmail, bSubject, bText, bHtml);

  // Agent reassurance (best-effort). Also property-first, no id prefix.
  if(agent?.email){
    const aText = `Hi ${agent?.first_name || "there"},\n\nYour file at ${propertyShort} is going straight to Marlenyi. No further action needed from you.\n\nAari Transactions`;
    const aHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.6;font-size:15px;"><p>Hi ${esc(agent?.first_name||"there")},</p><p>Your file at <strong>${esc(propertyShort)}</strong> is going straight to Marlenyi. No further action needed from you.</p><p style="color:#555;">Aari Transactions</p></div>`;
    try { await sendEmail(agent.email, `Your file is with the broker · ${propertyShort}`, aText, aHtml); } catch(_){}
  }

  if(!rb.ok){ console.error("[broker-escalation]", rb.error); return j(500, { ok:false, error: rb.error }); }
  return j(200, { ok:true, messageId: rb.id, brokerEmail });
});
