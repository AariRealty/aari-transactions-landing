// Aari Transactions · send-mls-update-nudge (v1 · 2026-08-08)
// ============================================================================
// Companion to the tg_notify_mls_update_on_closing_change Postgres trigger.
// Same trigger that inserts the bell notification also fires this function
// via pg_net.http_post so the assigned TC gets an EMAIL as well as a bell —
// TCs may not open the app quickly enough for the bell alone to beat Zillow
// notifying the agent that the MLS date is stale.
//
// Body: { file_id: uuid, old_date: iso-date | null, new_date: iso-date }
// Resolves TC email + address server-side (not trusting the trigger to pass
// them) so the sender can't be spoofed via a hand-crafted invocation.
//
// Design: matches the v2 Milennys template Marlenyi approved on 2026-08-08 —
// cream card, black masthead, ink hero block with the file address, tight
// body, one CTA button.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_PRIMARY = "Aari Transactions <files@aaritransactions.com>";
const FROM_FALLBACK = "Aari Transactions <onboarding@resend.dev>";
const BROKER_CC = "marlenyi@aarirealty.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Match the FMMon FMDD format the trigger uses (e.g., "Aug 8") so the email
// speaks the same date language as the bell notification.
function fmtDate(iso: string | null): string {
  if (!iso) return "unset";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch (_) {
    return String(iso);
  }
}

async function sendResend(from: string, to: string, subject: string, html: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], cc: [BROKER_CC], subject, html, reply_to: [BROKER_CC] }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { ok: false, error: "method_not_allowed" });
  if (!RESEND) return j(500, { ok: false, error: "no_resend_key" });

  let body: { file_id?: string; old_date?: string | null; new_date?: string };
  try { body = await req.json(); } catch { return j(400, { ok: false, error: "invalid_json" }); }
  if (!body.file_id || !body.new_date) return j(400, { ok: false, error: "missing_payload" });

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Resolve TC + address server-side. Refuses to send if the file doesn't have
  // an assigned TC (bell already skipped it too) or the TC has no email.
  const { data: file, error } = await admin
    .from("files")
    .select("id, property_address, assigned_tc_id, agents:assigned_tc_id(first_name, email)")
    .eq("id", body.file_id)
    .maybeSingle();
  if (error) return j(500, { ok: false, error: "file_lookup_failed", detail: error.message });
  if (!file || !file.assigned_tc_id) return j(200, { ok: false, skipped: "no_assigned_tc" });

  // deno-lint-ignore no-explicit-any
  const tc: any = file.agents;
  if (!tc || !tc.email) return j(200, { ok: false, skipped: "tc_missing_email" });

  const addrShort = String(file.property_address || "").split(",")[0].trim() || "this listing";
  const newDateLbl = fmtDate(body.new_date);
  const oldDateLbl = fmtDate(body.old_date ?? null);
  const tcFirst = tc.first_name || "there";

  const subject = `MLS update needed · ${addrShort} closing moved to ${newDateLbl}`;

  const html =
    `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#ffffff'>` +
    `<tr><td align='center' style='padding:26px 12px'>` +
      `<table role='presentation' width='500' cellpadding='0' cellspacing='0' style='max-width:500px;width:100%;background:#ffffff;border:0.5px solid #e8e6e0;border-radius:14px'>` +
      `<tr><td style='padding:26px 24px;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f'>` +
        // Masthead
        `<div style='text-align:center;padding-bottom:18px;border-bottom:0.5px solid #ece8e0;margin-bottom:18px'>` +
          `<div style='font-family:Georgia,"Times New Roman",serif;font-size:20px'>Aari Transactions</div>` +
          `<div style='font-size:9.5px;letter-spacing:2px;color:#8a857c;margin-top:6px'>MLS UPDATE NEEDED</div>` +
        `</div>` +
        // Ink hero
        `<div style='background:#0f0f0f;border-radius:11px;padding:20px;margin-bottom:20px;text-align:center;color:#ffffff'>` +
          `<div style='font-family:Georgia,serif;font-size:20px;line-height:1.2;font-weight:600'>${esc(addrShort)}</div>` +
          `<div style='font-size:11px;color:#b8b8b8;margin-top:8px;letter-spacing:1px'>WAS&nbsp;${esc(oldDateLbl)} &nbsp;&middot;&nbsp; NOW&nbsp;${esc(newDateLbl)}</div>` +
        `</div>` +
        // Body
        `<div style='font-size:13.5px;color:#0f0f0f;line-height:1.55;margin-bottom:18px'>` +
          `Hi ${esc(tcFirst)},` +
          `<br><br>` +
          `Closing date changed on this listing. Please update the MLS today so the agent client doesn&rsquo;t see a stale date from Zillow before we tell them.` +
        `</div>` +
        // CTA
        `<div style='text-align:center;margin-bottom:22px'>` +
          `<a href='https://aaritransactions.com/files.html' style='display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px'>Open the file &rarr;</a>` +
        `</div>` +
        // Footer
        `<div style='font-size:10.5px;color:#a39e93;line-height:1.5;text-align:center;border-top:0.5px solid #ece8e0;padding-top:16px'>` +
          `Auto-sent when the file&rsquo;s closing date changed. Reply here if the file needs anything else.` +
        `</div>` +
      `</td></tr></table>` +
    `</td></tr></table>`;

  try {
    let r = await sendResend(FROM_PRIMARY, tc.email, subject, html);
    let text = await r.text();
    if (!r.ok && /not verified|domain|403|422/i.test(text)) {
      r = await sendResend(FROM_FALLBACK, tc.email, subject, html);
      text = await r.text();
    }
    return j(r.ok ? 200 : 500, { ok: r.ok, status: r.status, resend: text.slice(0, 200), to: tc.email });
  } catch (e) {
    return j(500, { ok: false, error: String(e) });
  }
});
