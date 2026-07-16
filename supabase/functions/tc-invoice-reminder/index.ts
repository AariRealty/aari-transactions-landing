// Aari Transactions · tc-invoice-reminder (v6)
// Thursday nudge. Emails every coordinator to submit their weekly invoice. Fired by cron job
// "tc-invoice-thursday" (0 13 * * 4 UTC = 9am ET Thursday) via public.call_edge_function, which
// pulls service_role_key from the vault and sends it as a Bearer token.
//
// THIS FILE WAS LIVE IN PRODUCTION FOR WEEKS WITHOUT EXISTING IN THE REPO. It was deployed
// straight to Supabase, so nobody could review it, diff it, or see it change. Committed here as of
// v5. Deploy from this file, never from the dashboard, or the drift starts over.
//
// No amounts are computed here. This is only the nudge. The money is totaled client side in the
// cockpit's "Ready to invoice" panel and re-verified server side by submit-tc-invoice, which is
// the only thing allowed to price an invoice.
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

const SUBJECT = "you did the work. now go get paid.";

function esc(s: string){ return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// Voice: Alex Cattoni. Short sentences, one idea each, benefit first, no filler, no hype.
// House rule: NO DASHES anywhere in customer or coordinator copy. Commas and full stops only.
function bodyHtml(first: string){
  return `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f5f5f3'><tr><td align='center' style='padding:26px 12px'>`+
    `<table role='presentation' width='440' cellpadding='0' cellspacing='0' style='max-width:440px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'><tr><td style='padding:30px 28px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;font-size:14px;line-height:1.6'>`+
    `<p style='margin:0 0 13px'>Hi ${esc(first)},</p>`+
    `<p style='margin:0 0 13px'>It&rsquo;s Thursday. You know what that means.</p>`+
    `<p style='margin:0 0 13px'>Every file you closed or wrapped this week is already totaled and sitting in your cockpit. Nothing to build. Nothing to chase. No math.</p>`+
    `<p style='margin:0 0 18px'>Open your Ready to invoice list, look it over, hit submit.</p>`+
    `<div style='text-align:center;margin:0 0 18px'><a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:8px'>Submit my invoice</a></div>`+
    `<p style='margin:0 0 16px'>Payment goes out Friday. The whole thing takes about thirty seconds.</p>`+
    `<div style='margin-top:20px;padding-top:14px;border-top:0.5px solid #e6e2d8'><div style='font-family:Georgia,serif;font-size:20px'>Aari Transactions</div><div style='font-size:10px;letter-spacing:2px;color:#8a857c;margin-top:5px'>FLORIDA TRANSACTION COORDINATION</div></div>`+
    `</td></tr></table></td></tr></table>`;
}

function j(status: number, obj: unknown){
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const body = await req.json().catch(() => ({} as any));

  // ---- TEST SEND -----------------------------------------------------------------------------
  // `{"to":"someone@example.com"}` sends this one email to that address only and skips the real
  // run, so the nudge can be previewed without firing a second one at every coordinator.
  //
  // THE LOCK: the address must already exist in `agents`. That is what stops this from being an
  // open relay, which is the actual risk: making invoices@aaritransactions.com email a stranger.
  //
  // v5 also demanded the service role key here. That lock was unsatisfiable and had to come out.
  // There is no service role key reachable from the database: vault.decrypted_secrets holds
  // 'service_role_key' as an EMPTY STRING, and the cron jobs that embed a key literal embed the
  // ANON key ({"role":"anon"}). So nothing that can legitimately call this could ever pass the
  // check. A lock with no key is not security, it is a broken door.
  //
  // Worth being straight about what remains: this function is verify_jwt:false and takes no
  // secret, so anyone who knows the URL can already POST {} and nudge every coordinator. A `to`
  // limited to known agents is STRICTLY LESS powerful than that. It does not widen the hole, but
  // the hole is real and predates this param. The right fix is a shared secret header on EVERY
  // call, the same pattern realty-drip-run already uses, checked against a value the function can
  // read. Until that lands, do not add anything here that emails an address off the request.
  if (body && body.to) {
    const { data: who } = await admin.from("agents").select("first_name, email").ilike("email", String(body.to)).limit(1);
    if (!who || !who.length) return j(400, { ok: false, error: "no agent with that email · refusing to send to an unknown address" });
    const target = who[0];
    const ok = await sendEmail(target.email, SUBJECT, bodyHtml(target.first_name || "there"));
    return j(ok ? 200 : 502, { ok, test: true, sent_to: target.email, subject: SUBJECT });
  }

  // ---- REAL WEEKLY RUN -----------------------------------------------------------------------
  const { data: tcs } = await admin.from("agents").select("first_name, email").eq("role", "tc");
  const list = (tcs || []).filter((t: any) => t.email);
  let sent = 0;
  for (const t of list) {
    const ok = await sendEmail(t.email, SUBJECT, bodyHtml(t.first_name || "there"));
    if (ok) sent++;
  }
  return j(200, { ok: true, coordinators: list.length, sent });
});

async function sendEmail(to: string, subject: string, html: string): Promise<boolean>{
  if (!RESEND) return false;
  for (const from of [FROM_PRIMARY, FROM_FALLBACK]) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (r.ok) return true;
      const tx = await r.text();
      if (!/not verified|domain|403|422/i.test(tx)) return false;
    } catch(_){ /* fall through to the fallback sender */ }
  }
  return false;
}
