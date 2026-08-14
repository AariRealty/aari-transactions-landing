// Edge function: closed-payment-reminder
// ============================================================================
// POST-CLOSING TC-fee payment email for TC services billed at closing.
// Kill-switched by org_settings.payment_reminders_enabled (default false).
// Day 1 (20-28h post-close) = the closing payment email; Day 7 (168-192h) = a
// gentle nudge if still unpaid. Uses the approved branded template (cream pill,
// company sign-off, dark footer). Pay link is file-bound (client_reference_id)
// with the agent's member discount pre-applied. Broker is always CC'd; the
// assigned TC is CC'd on their own clients, and replies route to both.
// Safety: the query skips any file with paid_at set, so a paid agent is never
// emailed even if payment_status lags.
//
// PREVIEW MODE: POST { "preview_to": "<email>" } sends the Day 1 and Day 7
// samples (subject prefixed "TEST · ") to that address, bypassing the kill
// switch and DB query. Sample data only — no real file, no agent contacted.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "resend";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
if (!RESEND_KEY) throw new Error("RESEND_API_KEY is not set in Supabase edge function secrets.");
const resend = new Resend(RESEND_KEY);
const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";
const FROM_ADDR = (FROM.match(/<([^>]+)>/) || [])[1] ?? "hello@aaritransactions.com";
const BROKER_EMAIL = "marlenyi@aarirealty.com";

const STRIPE_LINKS: Record<string, string> = {
  tc_one_side:   "https://buy.stripe.com/8x23cn8bZ9uzc0H6EGcAo04",
  tc_both_sides: "https://buy.stripe.com/cNi4grdwj9uz3ubfbccAo03",
};

// Per-agent member promo — mirrors MEMBER_PROMO in files.html so the file-bound
// link is also discounted. Scoped by service so a code can't misapply.
const MEMBER_PROMO: Record<string, { code: string; services: string[] }> = {
  "2635cd0e-45ee-415e-b0d0-91251b5af6bf": { code: "SAMANTHA50", services: ["tc_one_side"] },
};

const TC_SERVICES = ["tc_one_side", "tc_both_sides"];
const HOUR = 60 * 60 * 1000;
const P = "font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;color:#000000;font-weight:400;line-height:1.55;margin:12px 0";

function payLinkFor(fileId: string, serviceType: string, agentId: string | null): string {
  const base = STRIPE_LINKS[serviceType];
  if (!base) return "";
  const sep = base.indexOf("?") === -1 ? "?" : "&";
  let url = `${base}${sep}client_reference_id=${encodeURIComponent(fileId)}`;
  const mp = agentId ? MEMBER_PROMO[agentId] : undefined;
  if (mp && mp.services.includes(serviceType)) url += `&prefilled_promo_code=${encodeURIComponent(mp.code)}`;
  return url;
}

function payButton(address: string, payLink: string): string {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0"><tbody><tr><td bgcolor="#f1efe8" style="background-color:#f1efe8;border-radius:999px"><a href="${payLink}" target="_blank" style="display:inline-block;font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:bold;color:#141210;text-decoration:none;padding:12px 24px">Pay for ${address}</a></td></tr></tbody></table>`;
}

function buildEmail(rung: number, first: string, address: string, payLink: string, testBanner = false): { subject: string; text: string; html: string } {
  const lead = rung === 1
    ? { htmlLine: `<strong style="font-weight:bolder">${address}</strong> is closed and ready to settle up.`, textLine: `${address} is closed and ready to settle up.`, subject: `Your closing is ready to settle · ${address}` }
    : { htmlLine: `Just a quick nudge, the payment for <strong style="font-weight:bolder">${address}</strong> is still open on our end.`, textLine: `Just a quick nudge, the payment for ${address} is still open on our end.`, subject: `Still open · ${address}` };
  const subject = (testBanner ? "TEST · " : "") + lead.subject;
  const banner = testBanner ? `<div style="background:#fbf3e2;border:0.5px solid #ecdfc4;border-left:3px solid #b7791f;border-radius:8px;padding:11px 14px;margin:0 0 10px;font-family:Arial,sans-serif;font-size:12.5px;color:#8a6d1b;line-height:1.5"><b>TEST PREVIEW</b><br>Sample of the automatic post-close email. No agent was contacted.</div>` : "";
  const bannerText = testBanner ? "[TEST PREVIEW — sample only, no agent contacted]\n\n" : "";
  const text = `${bannerText}Hi ${first},\n\n${lead.textLine}\n\nYour link is tied to this property. Just tap to pay:\n${payLink}\n\nReply here once it is sent, so we can confirm on our end.\n\nThank you!\nThe Aari Transactions Team`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:0;background:#ffffff}p{margin:12px 0}</style></head><body>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;width:100%" bgcolor="#ffffff"><tbody><tr><td>`
    + `<div style="padding:0 0 24px 0;margin:0 auto;max-width:100%">`
    + `<div style="margin:20px auto"><center><table cellpadding="0" cellspacing="0" style="width:100%;margin:0 auto;max-width:100%"><tbody><tr>`
    + `<td width="100%" style="background-color:#FFFFFF;box-sizing:border-box" bgcolor="#FFFFFF"><div style="padding:26px 40px"><div style="margin-left:auto;margin-right:auto;max-width:600px">`
    + banner
    + `<p style="${P}">Hi ${first},</p>`
    + `<p style="${P}">${lead.htmlLine}</p>`
    + `<p style="${P}">Your link is tied to this property, so it is already set. Just tap to pay.</p>`
    + payButton(address, payLink)
    + `<p style="${P}">Reply here once it is sent, so we can confirm on our end.</p>`
    + `<p style="font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;color:#000000;font-weight:400;line-height:1.55;margin:16px 0 12px">Thank you!<br>The Aari Transactions Team</p>`
    + `</div></div></td></tr></tbody></table></center></div>`
    + `<div style="margin:20px auto"><center><table cellpadding="0" cellspacing="0" style="width:100%;margin:0 auto;max-width:100%"><tbody><tr>`
    + `<td width="100%" style="background-color:#141210;box-sizing:border-box" bgcolor="#141210"><div style="padding:24px 40px"><div style="margin-left:auto;margin-right:auto;max-width:600px">`
    + `<p style="font-family:Arial,-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#ffffff;font-weight:400;line-height:1.7;text-align:center;margin:0"><strong style="font-weight:bolder">Aari Transactions</strong><br>Fort Myers · Cape Coral · Lehigh Acres · Southwest Florida<br><a href="mailto:hello@aaritransactions.com" style="color:#ffffff;text-decoration:underline">hello@aaritransactions.com</a></p>`
    + `</div></div></td></tr></tbody></table></center></div>`
    + `</div></td></tr></tbody></table></body></html>`;
  return { subject, text, html };
}

async function sendPreview(to: string, first: string, addr: string): Promise<{ ok: boolean; err?: string }> {
  const payLink = payLinkFor("SAMPLE-PREVIEW-NO-REAL-FILE", "tc_one_side", null);
  const d1 = buildEmail(1, first, addr, payLink, true);
  const d7 = buildEmail(2, first, addr, payLink, true);
  try {
    await resend.emails.send({ from: `Aari Transactions <${FROM_ADDR}>`, to, subject: d1.subject, text: d1.text, html: d1.html });
    await resend.emails.send({ from: `Aari Transactions <${FROM_ADDR}>`, to, subject: d7.subject, text: d7.text, html: d7.html });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.clone().json().catch(() => null);
      const previewTo = body && typeof body.preview_to === "string" ? body.preview_to.trim() : "";
      if (previewTo) {
        const first = (body && typeof body.first === "string" && body.first.trim()) || "there";
        const addr = (body && typeof body.address === "string" && body.address.trim()) || "[Sample address]";
        const res = await sendPreview(previewTo, first, addr);
        return new Response(JSON.stringify({ ok: res.ok, mode: "preview", to: previewTo, error: res.err || null }), { status: 200 });
      }
    }
  } catch (_e) { /* fall through */ }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: os, error: osErr } = await supabase.from("org_settings").select("payment_reminders_enabled").eq("id", 1).maybeSingle();
    if (osErr) { console.warn("[closed-payment-reminder] org_settings read failed", osErr.message); return new Response(JSON.stringify({ ok: true, skipped: "org_settings_read_error" }), { status: 200 }); }
    if (!os || os.payment_reminders_enabled !== true) { return new Response(JSON.stringify({ ok: true, skipped: "disabled_by_broker", sent: 0 }), { status: 200 }); }
  } catch (e) { console.warn("[closed-payment-reminder] kill-switch threw", e); return new Response(JSON.stringify({ ok: true, skipped: "kill_switch_exception" }), { status: 200 }); }

  const { data: files, error } = await supabase
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address, service_type, actual_closing_date, closing_date, payment_status, payment_reminder_last_sent_at")
    .eq("status", "closed").eq("payment_status", "pending").is("paid_at", null).in("service_type", TC_SERVICES).limit(200);

  if (error) { console.error("[closed-payment-reminder] query failed", error.message); return new Response(JSON.stringify({ ok: false }), { status: 200 }); }

  let sent = 0;
  for (const f of files ?? []) {
    const payLink = payLinkFor(f.id as string, f.service_type as string, (f.agent_id as string) ?? null);
    if (!payLink) continue;
    const closedSource = f.actual_closing_date || f.closing_date;
    if (!closedSource) continue;
    const closedMs = new Date(closedSource).getTime();
    if (!Number.isFinite(closedMs)) continue;
    const hrs = (Date.now() - closedMs) / HOUR;
    let rung = 0, windowStartH = 0;
    if (hrs >= 20 && hrs <= 28) { rung = 1; windowStartH = 20; }
    else if (hrs >= 168 && hrs <= 192) { rung = 2; windowStartH = 168; }
    if (rung === 0) continue;
    if (f.payment_reminder_last_sent_at && new Date(f.payment_reminder_last_sent_at).getTime() >= closedMs + windowStartH * HOUR) continue;
    const { data: agent } = await supabase.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
    if (!agent?.email) continue;
    let tcEmail: string | undefined;
    if (f.assigned_tc_id) {
      const { data: tc } = await supabase.from("agents").select("email").eq("id", f.assigned_tc_id).maybeSingle();
      if (tc) tcEmail = tc.email ?? undefined;
    }
    const first = agent.first_name ?? "there";
    const address = (f.property_address as string) ?? "your closing";
    const { subject, text, html } = buildEmail(rung, first, address, payLink);
    const cc = [BROKER_EMAIL, ...(tcEmail && tcEmail !== agent.email ? [tcEmail] : [])];
    const replyTo = [...(tcEmail ? [tcEmail] : []), BROKER_EMAIL];
    try {
      await resend.emails.send({ from: `Aari Transactions <${FROM_ADDR}>`, to: agent.email, cc, reply_to: replyTo, subject, text, html });
      await supabase.from("files").update({ payment_reminder_last_sent_at: new Date().toISOString() }).eq("id", f.id);
      sent++;
    } catch (e) { console.warn("[closed-payment-reminder] send failed for", f.id, e); }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
});
