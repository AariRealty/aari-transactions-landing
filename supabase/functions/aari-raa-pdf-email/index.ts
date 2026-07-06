// Edge function: aari-raa-pdf-email (DB-backed agreement text)
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = (SUPABASE_URL && SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function loadRaaText(version: string): Promise<string> {
  if (!supabaseAdmin) return "";
  try {
    const { data, error } = await supabaseAdmin
      .from("agreement_templates")
      .select("body")
      .eq("agreement_type", "referral_associate")
      .eq("version", version)
      .maybeSingle();
    if (error) { console.warn("[aari-raa-pdf-email] template load failed:", error); return ""; }
    return (data?.body as string) || "";
  } catch (e) {
    console.warn("[aari-raa-pdf-email] template load threw:", e);
    return "";
  }
}

interface RaaPayload {
  associate_name?: string;
  associate_email?: string;
  associate_phone?: string;
  associate_license?: string;
  jury_initials?: string;
  signed_at_iso?: string;
  signed_at_display?: string;
  signature_data_url?: string;
  agreement_version?: string;
  user_agent?: string;
  locale?: string;
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeForWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[ ]/g, " ")
    .replace(/[•]/g, "*")
    .replace(/[§]/g, "Section ")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") { lines.push(""); continue; }
    const words = para.split(/\s+/);
    let current = "";
    for (const w of words) {
      const test = current ? current + " " + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) { current = test; }
      else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) { lines.push(chunk); chunk = ch; }
            else { chunk += ch; }
          }
          current = chunk;
        } else { current = w; }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function slugForFilename(name: string, email: string): string {
  const fromName = (name || "").trim();
  if (fromName) {
    const parts = fromName.split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "associate";
  }
  const local = (email || "").split("@")[0] || "associate";
  return local.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "associate";
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpe?g));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, "");
  try {
    const binStr = atob(b64);
    const out = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
    return { bytes: out, mime };
  } catch { return null; }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
  }
  return btoa(binary);
}

async function buildPdf(p: RaaPayload, raaText: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const PAGE_W = 612, PAGE_H = 792, MARGIN_L = 54, MARGIN_R = 54, MARGIN_T = 60, MARGIN_B = 60;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const BODY_SIZE = 9.5, BODY_LEADING = 12.5, HEAD_SIZE = 14, SUB_SIZE = 10;
  const BLACK = rgb(0, 0, 0), GREY = rgb(0.35, 0.35, 0.35);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_T;
  function ensureSpace(needed: number) { if (y - needed < MARGIN_B) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_T; } }
  function drawHeading(text: string) { ensureSpace(HEAD_SIZE + 6); page.drawText(sanitizeForWinAnsi(text), { x: MARGIN_L, y: y - HEAD_SIZE, size: HEAD_SIZE, font: fontBold, color: BLACK }); y -= HEAD_SIZE + 4; }
  function drawSub(text: string) { ensureSpace(SUB_SIZE + 6); page.drawText(sanitizeForWinAnsi(text), { x: MARGIN_L, y: y - SUB_SIZE, size: SUB_SIZE, font: fontItalic, color: GREY }); y -= SUB_SIZE + 8; }
  function drawBody(text: string, opts: { bold?: boolean; size?: number } = {}) {
    const f = opts.bold ? fontBold : font; const s = opts.size ?? BODY_SIZE;
    const lines = wrapText(sanitizeForWinAnsi(text), f, s, CONTENT_W);
    for (const ln of lines) { ensureSpace(BODY_LEADING); page.drawText(ln, { x: MARGIN_L, y: y - s, size: s, font: f, color: BLACK }); y -= BODY_LEADING; }
  }
  function drawSpacer(h: number) { y -= h; ensureSpace(0); }

  drawHeading("Aari Referrals LLC - Referral Associate Agreement");
  drawSub("Version " + (p.agreement_version || "RAA-2026-01") + " - Florida referral-only brokerage - License CQ1073724");
  drawSpacer(6);

  drawBody("ASSOCIATE INFORMATION", { bold: true, size: 10 });
  drawSpacer(2);
  drawBody("Name: " + (p.associate_name || ""));
  drawBody("Email: " + (p.associate_email || ""));
  drawBody("Phone: " + (p.associate_phone || ""));
  drawBody("Florida License: " + (p.associate_license || ""));
  drawSpacer(10);

  const paragraphs = (raaText || "(Agreement text unavailable at generation time.)").split(/\n\n+/);
  for (const para of paragraphs) { drawBody(para); drawSpacer(4); }

  drawSpacer(10);
  ensureSpace(160);
  drawBody("ASSOCIATE SIGNATURE", { bold: true, size: 11 });
  drawSpacer(4);
  const sig = p.signature_data_url ? dataUrlToBytes(p.signature_data_url) : null;
  if (sig) {
    try {
      const img = sig.mime === "image/png" ? await pdf.embedPng(sig.bytes) : await pdf.embedJpg(sig.bytes);
      const ratio = Math.min(240 / img.width, 70 / img.height, 1);
      const w = img.width * ratio, h = img.height * ratio;
      ensureSpace(h + 4);
      page.drawImage(img, { x: MARGIN_L, y: y - h, width: w, height: h });
      page.drawLine({ start: { x: MARGIN_L, y: y - h - 2 }, end: { x: MARGIN_L + Math.max(w, 240), y: y - h - 2 }, thickness: 0.5, color: GREY });
      y -= h + 8;
    } catch (err) { console.warn("[aari-raa-pdf-email] signature embed failed:", err); drawBody("(Signature image could not be rendered)"); }
  } else { drawBody("(No drawn signature provided)"); }

  drawBody("Typed Name: " + (p.associate_name || ""));
  drawBody("Jury Trial Waiver initials (Section 22): " + (p.jury_initials || ""));
  drawBody("Signed at: " + (p.signed_at_display || p.signed_at_iso || ""));
  drawBody("Consent: Signer adopted the above as a binding electronic signature and consented to do business electronically.");
  drawBody("Signing Law: Fla. Stat. Section 668.50 (Uniform Electronic Transaction Act) and the federal E-SIGN Act.");
  drawSpacer(8);
  drawBody("Audit metadata: user_agent=" + (p.user_agent || "n/a") + " | locale=" + (p.locale || "n/a"), { size: 7.5 });

  drawSpacer(16);
  ensureSpace(60);
  drawBody("AARI REFERRALS LLC", { bold: true, size: 11 });
  drawSpacer(4);
  drawBody("Broker: Marlenyi L. Paredes, Qualifying Broker (BK3648207)");
  drawBody("Countersignature on file with the Company upon acceptance of the referral relationship.");

  const pages = pdf.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const pg = pages[i];
    pg.drawText("Page " + (i + 1) + " of " + total, { x: PAGE_W - MARGIN_R - 70, y: 30, size: 8, font, color: GREY });
    pg.drawText("Aari Referrals LLC - Referral Associate Agreement " + (p.agreement_version || "RAA-2026-01"), { x: MARGIN_L, y: 30, size: 8, font, color: GREY });
  }
  return await pdf.save();
}

async function sendEmail(pdfBytes: Uint8Array, filename: string, p: RaaPayload): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY_missing" };
  if (!p.associate_email) return { ok: false, error: "associate_email_missing" };

  const subject = "Signed: Aari Referrals Associate Agreement - " + (p.associate_name || "Associate");
  const html =
    '<div style="font-family:Inter,Arial,sans-serif;color:#0f0f0f;line-height:1.5">' +
    '<h2 style="margin:0 0 12px;font-weight:600">Your signed Aari Referrals Associate Agreement</h2>' +
    "<p>Hi " + escapeHtml(p.associate_name || "there") + ",</p>" +
    "<p>Thanks for signing the Referral Associate Agreement on <strong>" + escapeHtml(p.signed_at_display || p.signed_at_iso || "") + "</strong>. Your signed PDF is attached for your records. It includes the full agreement, the Commission Structure Addendum, and Exhibit A.</p>" +
    '<p style="font-size:12px;color:#5f5e5a;border-left:3px solid #e6e2d8;padding-left:10px">Associate: ' + escapeHtml(p.associate_name || "") + " &middot; License: " + escapeHtml(p.associate_license || "n/a") + " &middot; Signed: " + escapeHtml(p.signed_at_display || p.signed_at_iso || "") + "</p>" +
    '<p style="margin-top:24px">Next step is your membership. Questions? Reply to this email or text 239.688.1770.</p>' +
    '<hr style="border:none;border-top:1px solid #e6e2d8;margin:20px 0"/>' +
    '<p style="font-size:11px;color:#5f5e5a">Aari Referrals LLC &middot; Florida referral-only brokerage &middot; License CQ1073724 &middot; Fort Myers, FL</p>' +
    "</div>";

  const body: Record<string, unknown> = {
    from: Deno.env.get("FROM_EMAIL") ?? "Aari Referrals <hello@aaritransactions.com>",
    to: [p.associate_email],
    bcc: [Deno.env.get("REFERRALS_BCC") ?? "Referrals@aarirealty.com", "marlenyi@aarirealty.com"],
    subject, html,
    attachments: [{ filename, content: bytesToBase64(pdfBytes) }],
  };
  const send = (payload: Record<string, unknown>) =>
    fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) });

  let resp = await send(body);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.warn("[aari-raa-pdf-email] domain send failed (" + resp.status + ") - retrying sandbox:", text.slice(0, 200));
    const fallback = { ...body, from: "Aari Referrals <onboarding@resend.dev>" } as Record<string, unknown>;
    delete (fallback as { bcc?: unknown }).bcc;
    resp = await send(fallback);
    if (!resp.ok) { const t2 = await resp.text().catch(() => ""); return { ok: false, error: "resend_failed_" + resp.status + ":" + t2.slice(0, 200) }; }
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const headerIp =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") || null;
  const ipAddress = headerIp && /^[0-9a-fA-F:.]+$/.test(headerIp) ? headerIp : null;

  let payload: RaaPayload;
  try { payload = (await req.json()) as RaaPayload; } catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }
  if (!payload.associate_email || !payload.associate_name) return jsonResponse({ ok: false, error: "associate_name_and_email_required" }, 400);

  try {
    const version = payload.agreement_version || "RAA-2026-01";
    const raaText = await loadRaaText(version);
    const pdfBytes = await buildPdf(payload, raaText);
    const slug = slugForFilename(payload.associate_name || "", payload.associate_email || "");
    const filename = "Aari-Referral-Associate-Agreement-" + version + "-" + slug + "-signed.pdf";

    let agentId: string | null = null;
    if (supabaseAdmin) {
      try {
        const { data: agentRow } = await supabaseAdmin.from("agents").select("id").ilike("email", payload.associate_email || "").maybeSingle();
        agentId = agentRow?.id ?? null;
      } catch (e) { console.warn("[aari-raa-pdf-email] agent lookup failed:", e); }
    }

    const safeVersion = version.replace(/[^a-z0-9.]/gi, "");
    const tsSlug = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = (agentId || "anonymous") + "/raa_" + safeVersion + "_" + tsSlug + ".pdf";
    let signedPdfUrl: string | null = null;
    if (supabaseAdmin) {
      try {
        const { error: upErr } = await supabaseAdmin.storage.from("signed-agreements").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
        if (upErr) console.warn("[aari-raa-pdf-email] storage upload failed:", upErr);
        else {
          signedPdfUrl = storagePath;
          if (agentId) { const { error: pErr } = await supabaseAdmin.from("agents").update({ agreement_pdf_path: storagePath }).eq("id", agentId); if (pErr) console.warn("[aari-raa-pdf-email] agreement_pdf_path update failed:", pErr); }
        }
      } catch (e) { console.warn("[aari-raa-pdf-email] storage threw:", e); }
    }

    if (supabaseAdmin) {
      try {
        const { error: insErr } = await supabaseAdmin.from("agreement_signatures").insert({
          agent_id: agentId,
          file_id: null,
          agreement_type: "referral_associate",
          agreement_version: version,
          typed_full_name: payload.associate_name || "",
          drawn_signature_data: payload.signature_data_url || null,
          signature_image_url: null,
          ip_address: ipAddress,
          user_agent: payload.user_agent || null,
          signed_at: payload.signed_at_iso || new Date().toISOString(),
          signed_agreement_pdf_url: signedPdfUrl,
          pdf_generation_status: signedPdfUrl ? "succeeded" : "failed",
          signer_email: payload.associate_email || null,
          signer_license: payload.associate_license || null,
          signer_phone: payload.associate_phone || null,
          signer_initials: payload.jury_initials || null,
        });
        if (insErr) console.warn("[aari-raa-pdf-email] agreement_signatures insert failed:", insErr);
      } catch (e) { console.warn("[aari-raa-pdf-email] agreement_signatures insert threw:", e); }
    }

    if (supabaseAdmin) {
      try {
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
        if (twilioSid && twilioToken && twilioFrom) {
          const { data: brokers } = await supabaseAdmin.from("agents").select("phone").eq("role", "broker").not("phone", "is", null);
          if (brokers && brokers.length > 0) {
            const who = payload.associate_name || payload.associate_email || "an associate";
            const smsBody = "Aari Referrals - " + who + " just signed the Referral Associate Agreement (" + version + ").";
            for (const broker of brokers) {
              if (!broker.phone) continue;
              try {
                await fetch("https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json", {
                  method: "POST",
                  headers: { "Authorization": "Basic " + btoa(twilioSid + ":" + twilioToken), "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({ From: twilioFrom, To: broker.phone, Body: smsBody }).toString(),
                });
              } catch (e) { console.warn("[aari-raa-pdf-email] broker SMS failed:", e); }
            }
          }
        }
      } catch (e) { console.warn("[aari-raa-pdf-email] broker notify threw:", e); }
    }

    const sendResult = await sendEmail(pdfBytes, filename, payload);
    return jsonResponse({
      ok: true,
      bytes: pdfBytes.length,
      filename,
      recipient: payload.associate_email,
      storage_path: signedPdfUrl,
      agent_id: agentId,
      ...(sendResult.ok ? {} : { email_warning: sendResult.error || "email_send_failed" }),
    });
  } catch (err) {
    console.error("[aari-raa-pdf-email] handler error:", err);
    return jsonResponse({ ok: false, error: (err as Error).message || "unknown_error" }, 500);
  }
});
