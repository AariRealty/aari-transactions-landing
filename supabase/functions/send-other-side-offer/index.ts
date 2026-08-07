// Aari Transactions · send-other-side-offer (v1)
// ============================================================================
// Fires when a TC taps "Yes, send it" on the other-side-agent chip inside a
// file drawer. Generates a single-use $50 promo code scoped to TC coordination,
// stores it in at_promo_codes, and emails the other-side agent a warm
// thank-you + the code, sent from the TC's Aari email so reply-to is the
// coordinator who actually worked the deal (not a no-reply).
//
// Body: { file_id: uuid, agent: { first_name, last_name, email } }
// Auth: JWT-authenticated. Caller must be the file's assigned_tc_id OR broker.
// Response: 200 { ok: true, code, id, sent_to } · 4xx { ok: false, error }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Code shape: {FIRSTNAME}-TC-{4 char base32}. e.g. SARAH-TC-3B2K. Skips 0/O/1/I to keep it readable.
function generateCode(firstName: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const first = String(firstName || "AGENT").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "AGENT";
  return `${first}-TC-${rand}`;
}

async function sendEmail(from: string, replyTo: string, to: string, subject: string, html: string, text: string) {
  if (!RESEND) return { ok: false, error: "RESEND_API_KEY not set" };
  for (const fromCandidate of [from, FROM_FALLBACK]) {
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromCandidate, reply_to: replyTo, to: [to], subject, html, text }),
      });
    } catch (e) { return { ok: false, error: "Network: " + (e instanceof Error ? e.message : String(e)) }; }
    if (res.ok) { let d: { id?: string } = {}; try { d = await res.json(); } catch (_) {} return { ok: true, id: d.id }; }
    let body = ""; try { body = await res.text(); } catch (_) {}
    if (!/not verified|domain|403|422/i.test(body)) return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: false, error: "send failed" };
}

function buildEmail(opts: { tcFirst: string; agentFirst: string; street: string; code: string; intakeUrl: string; }) {
  const { tcFirst, agentFirst, street, code, intakeUrl } = opts;
  const subject = `A thank you for ${street} 💛`;
  const text = [
    `Hi ${agentFirst},`,
    ``,
    `Thank you for the smooth ride on ${street}.`,
    ``,
    `Working the file with you was a real pleasure.`,
    ``,
    `Everything on your side was on time and professional. It showed.`,
    ``,
    `✨ If you ever want a TC on your next one, we would love to earn your business.`,
    ``,
    `Here is $50 off your first file with Aari Transactions:`,
    ``,
    `    ${code}`,
    `    Apply at checkout. TC coordination only. One time use.`,
    ``,
    `Get started: ${intakeUrl}`,
    ``,
    `Looking forward to the next closing table 🤝`,
    ``,
    tcFirst,
  ].join("\n");
  const codeCard = `<div style="background:#fdf6ea;border:0.5px solid #efe1c2;border-radius:10px;padding:14px 16px;margin:22px 0;text-align:center">`
    + `<div style="font-family:'SF Mono',Menlo,Monaco,monospace;font-size:16px;font-weight:700;letter-spacing:2px;color:#0f0f0f">${esc(code)}</div>`
    + `<div style="font-size:11px;color:#7a5c12;margin-top:6px">Apply at checkout. Valid on TC coordination. One time use.</div>`
    + `</div>`;
  const bodyStyle = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#14110c";
  const emStyle = "font-style:italic;color:#0f0f0f;font-weight:600";
  const html = `<div style="max-width:560px;margin:0 auto;background:#fff;border:0.5px solid #e6ddca;border-radius:14px;overflow:hidden">`
    + `<div style="padding:26px 26px;${bodyStyle}">`
    + `<p style="margin:0 0 20px">Hi ${esc(agentFirst)},</p>`
    + `<p style="margin:0 0 20px"><span style="${emStyle}">Thank you for the smooth ride on ${esc(street)}.</span></p>`
    + `<p style="margin:0 0 20px">Working the file with you was a real pleasure.</p>`
    + `<p style="margin:0 0 20px">Everything on your side was on time and professional. It showed.</p>`
    + `<p style="margin:0 0 20px">✨ If you ever want a TC on your next one, we would love to earn your business.</p>`
    + `<p style="margin:0 0 20px">Here is $50 off your first file with Aari Transactions:</p>`
    + codeCard
    + `<p style="margin:0 0 20px"><a href="${esc(intakeUrl)}" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600">Start a file</a></p>`
    + `<p style="margin:0 0 20px">Looking forward to the next closing table 🤝</p>`
    + `<div style="font-family:Georgia,serif;font-size:16px;margin-top:24px;color:#0f0f0f">${esc(tcFirst)}</div>`
    + `<div style="font-size:10px;letter-spacing:2px;color:#8a857c;margin-top:4px;text-transform:uppercase">Aari Transactions</div>`
    + `</div></div>`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { ok: false, error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return j(401, { ok: false, error: "auth_required" });

  let body: { file_id?: string; agent?: { first_name?: string; last_name?: string; email?: string; }; };
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "invalid_json" }); }
  const fileId = String(body.file_id || "").trim();
  const agentFirst = String(body.agent?.first_name || "").trim();
  const agentLast = String(body.agent?.last_name || "").trim();
  const agentEmail = String(body.agent?.email || "").trim().toLowerCase();
  if (!fileId) return j(400, { ok: false, error: "file_id_required" });
  if (!agentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentEmail)) return j(400, { ok: false, error: "valid_agent_email_required" });
  if (!agentFirst) return j(400, { ok: false, error: "agent_first_name_required" });

  const asUser = createClient(SUPABASE_URL, SERVICE, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await asUser.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return j(401, { ok: false, error: "auth_invalid" });

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Authorize · caller must be the file's assigned TC or a broker.
  const { data: caller } = await admin.from("agents").select("id, first_name, last_name, email, role").eq("id", uid).maybeSingle();
  if (!caller) return j(403, { ok: false, error: "caller_not_found" });
  const { data: file } = await admin.from("files").select("id, assigned_tc_id, property_address").eq("id", fileId).maybeSingle();
  if (!file) return j(404, { ok: false, error: "file_not_found" });
  const isBroker = String(caller.role || "") === "broker";
  const isAssigned = String(file.assigned_tc_id || "") === uid;
  if (!isBroker && !isAssigned) return j(403, { ok: false, error: "not_authorized_for_file" });

  // Dedupe · one active (unredeemed) code per (agent_email, file_id).
  const { data: existing } = await admin
    .from("at_promo_codes")
    .select("id, code, created_at, redeemed_at")
    .eq("file_id", fileId)
    .ilike("agent_email", agentEmail)
    .is("redeemed_at", null)
    .maybeSingle();
  if (existing) return j(200, { ok: true, code: existing.code, id: existing.id, already_sent: true, sent_to: agentEmail });

  // Generate a code that isn't already used. Retry a few times if the random collides.
  let code = generateCode(agentFirst);
  for (let i = 0; i < 5; i++) {
    const { data: hit } = await admin.from("at_promo_codes").select("id").eq("code", code).maybeSingle();
    if (!hit) break;
    code = generateCode(agentFirst);
  }

  // Insert · sent_by_tc_id is the caller uid (broker sends land as broker uid).
  const { data: inserted, error: insErr } = await admin
    .from("at_promo_codes")
    .insert({
      code,
      agent_email: agentEmail,
      agent_first_name: agentFirst,
      agent_last_name: agentLast || null,
      amount_cents: 5000,
      service_scope: 'tc_coordination',
      file_id: fileId,
      sent_by_tc_id: uid,
    })
    .select("id, code")
    .single();
  if (insErr || !inserted) return j(500, { ok: false, error: "db_insert_failed", detail: insErr?.message });

  // Build email · from TC's Aari email so reply-to lands with them, not a no-reply.
  const tcFirst = caller.first_name || "Aari Transactions";
  const tcEmail = String(caller.email || "").trim();
  const displayName = `${tcFirst} at Aari Transactions`;
  const from = tcEmail ? `${displayName} <${tcEmail}>` : `Aari Transactions <notifications@aaritransactions.com>`;
  const replyTo = tcEmail || "hello@aaritransactions.com";
  const street = String(file.property_address || "").split(",")[0].trim() || "your closing";
  const intakeUrl = `https://aaritransactions.com/submit.html?promo=${encodeURIComponent(inserted.code)}`;

  const { subject, html, text } = buildEmail({ tcFirst, agentFirst, street, code: inserted.code, intakeUrl });
  const sent = await sendEmail(from, replyTo, agentEmail, subject, html, text);
  if (!sent.ok) return j(502, { ok: false, error: sent.error, code: inserted.code, id: inserted.id });

  return j(200, { ok: true, code: inserted.code, id: inserted.id, sent_to: agentEmail, message_id: sent.id });
});
