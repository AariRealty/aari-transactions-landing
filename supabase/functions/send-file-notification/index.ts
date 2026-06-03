// ============================================================================
// Aari Transactions · send-file-notification Edge Function (May 2026)
// ============================================================================
// Triggered by Path A's actualSubmit() after files land in Supabase Storage.
// Takes the file-submission payload (metadata + signed URLs) and sends a
// branded HTML email to the configured TC inbox via Resend.
//
// REQUIRED ENV VARS (set via Supabase Dashboard · Project Settings · Edge Functions):
//   · RESEND_API_KEY   · Resend API key (re_xxxxxxxxxx)
//   · TC_INBOX         · default agreements@aaritransactions.com
//   · FROM_ADDRESS     · default files@aaritransactions.com (must be a
//                        domain you've verified in Resend)
//
// Deploy:  supabase functions deploy send-file-notification --no-verify-jwt
// (--no-verify-jwt because we want unauthenticated browser calls · the
//  signed URLs in the payload are already pre-authenticated.)
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TC_INBOX       = Deno.env.get("TC_INBOX")       ?? "agreements@aaritransactions.com";
const FROM_ADDRESS   = Deno.env.get("FROM_ADDRESS")   ?? "files@aaritransactions.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRep(rep: string): string {
  const map: Record<string, string> = {
    buyer: "Buyer",
    seller: "Seller",
    both_sides: "Both Sides",
  };
  return map[rep] || rep || "—";
}

interface FileSubmission {
  agent_email?: string;
  agent_name?: string;
  agent_phone?: string;
  agent_license?: string;
  agent_brokerage?: string;
  service_type?: string;
  service_package?: string;
  service_id?: string;
  representation?: string;
  preferred_tc?: string;
  property_address?: string;
  effective_date?: string;
  closing_date?: string;
  title_company?: string;
  title_company_address?: string;
  title_contact_name?: string;
  title_contact_email?: string;
  title_contact_phone?: string;
  lender?: string;
  lender_contact_name?: string;
  lender_contact_email?: string;
  lender_contact_phone?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  seller_name?: string;
  seller_email?: string;
  seller_phone?: string;
  listing_agent_name?: string;
  listing_agent_company?: string;
  listing_agent_phone?: string;
  listing_agent_email?: string;
  co_agent_name?: string;
  co_agent_company?: string;
  co_agent_phone?: string;
  co_agent_email?: string;
  commission_notes?: string;
  agent_notes?: string;
  contract_url?: string;
  contract_filename?: string;
  additional_docs?: Array<{ filename: string; url: string }>;
  submission_id?: string;
  submitted_at_display?: string;
}

function buildEmailHTML(d: FileSubmission): string {
  const e = escapeHtml;
  const rep = formatRep(d.representation || "");
  const closingDate = d.closing_date ? new Date(d.closing_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric"
  }) : "—";
  const effectiveDate = d.effective_date ? new Date(d.effective_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric"
  }) : "";

  const titleBlock = d.title_company ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Title Company</div>
      <div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.title_company)}</div>
      ${d.title_company_address ? `<div style="font-size:13px;color:#5f5e5a;margin-top:2px">${e(d.title_company_address)}</div>` : ""}
      ${d.title_contact_name ? `<div style="font-size:13px;color:#3a3a38;margin-top:6px">${e(d.title_contact_name)}</div>` : ""}
      ${d.title_contact_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.title_contact_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.title_contact_email)}</a></div>` : ""}
      ${d.title_contact_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.title_contact_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const lenderBlock = d.lender ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Lender</div>
      <div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.lender)}</div>
      ${d.lender_contact_name ? `<div style="font-size:13px;color:#3a3a38;margin-top:6px">${e(d.lender_contact_name)}</div>` : ""}
      ${d.lender_contact_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.lender_contact_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.lender_contact_email)}</a></div>` : ""}
      ${d.lender_contact_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.lender_contact_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const buyerBlock = d.buyer_name ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Buyer Client</div>
      <div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.buyer_name)}</div>
      ${d.buyer_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.buyer_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.buyer_email)}</a></div>` : ""}
      ${d.buyer_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.buyer_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const sellerBlock = d.seller_name ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Seller Client</div>
      <div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.seller_name)}</div>
      ${d.seller_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.seller_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.seller_email)}</a></div>` : ""}
      ${d.seller_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.seller_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const otherAgentBlock = (d.listing_agent_name || d.listing_agent_company || d.listing_agent_email || d.listing_agent_phone) ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Other-Side Agent</div>
      ${d.listing_agent_name ? `<div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.listing_agent_name)}</div>` : ""}
      ${d.listing_agent_company ? `<div style="font-size:13px;color:#3a3a38;margin-top:2px">${e(d.listing_agent_company)}</div>` : ""}
      ${d.listing_agent_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.listing_agent_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.listing_agent_email)}</a></div>` : ""}
      ${d.listing_agent_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.listing_agent_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const coAgentBlock = (d.co_agent_name || d.co_agent_company || d.co_agent_email || d.co_agent_phone) ? `
    <tr><td style="padding:12px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Co-Agent (Our Side)</div>
      ${d.co_agent_name ? `<div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.co_agent_name)}</div>` : ""}
      ${d.co_agent_company ? `<div style="font-size:13px;color:#3a3a38;margin-top:2px">${e(d.co_agent_company)}</div>` : ""}
      ${d.co_agent_email ? `<div style="font-size:13px;color:#5f5e5a"><a href="mailto:${e(d.co_agent_email)}" style="color:#0f0f0f;text-decoration:underline">${e(d.co_agent_email)}</a></div>` : ""}
      ${d.co_agent_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.co_agent_phone)}</div>` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  const additionalDocsBlock = (d.additional_docs && d.additional_docs.length) ? `
    <div style="margin-top:14px;padding-top:14px;border-top:0.5px dashed rgba(15,15,15,0.18)">
      <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:8px">Additional documents (${d.additional_docs.length})</div>
      ${d.additional_docs.map(doc => `
        <div style="margin:6px 0">
          <a href="${e(doc.url)}" style="color:#0f0f0f;text-decoration:underline;font-size:13.5px;font-weight:500">${e(doc.filename)}</a>
        </div>
      `).join("")}
    </div>
  ` : "";

  const notesBlock = (d.commission_notes || d.agent_notes) ? `
    <tr><td style="padding:14px 16px;background:#f5f0e8;border-radius:8px">
      ${d.commission_notes ? `
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:4px">Commission notes</div>
        <div style="font-size:13.5px;color:#0f0f0f;white-space:pre-wrap;margin-bottom:10px">${e(d.commission_notes)}</div>
      ` : ""}
      ${d.agent_notes ? `
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:4px">Agent notes</div>
        <div style="font-size:13.5px;color:#0f0f0f;white-space:pre-wrap">${e(d.agent_notes)}</div>
      ` : ""}
    </td></tr>
    <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>
  ` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New file from ${e(d.agent_name || "agent")}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0f0f0f;line-height:1.5;font-size:14px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f0e8">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%">

        <!-- Brand header -->
        <tr><td align="center" style="padding:24px 0 28px">
          <div style="display:inline-block;font-family:Georgia,'Cormorant Garamond',serif;font-weight:500;font-size:24px;letter-spacing:4px;color:#0f0f0f;border:1.5px solid #0f0f0f;border-radius:6px;padding:6px 12px">AARI</div>
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5f5e5a;margin-top:10px">Transactions &middot; file received</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:0 4px 18px">
          <div style="font-family:Georgia,'Cormorant Garamond',serif;font-size:28px;font-weight:500;line-height:1.15;color:#0f0f0f;margin-bottom:6px;letter-spacing:-0.01em">New file from ${e(d.agent_name || "Agent")}</div>
          <div style="font-size:14.5px;color:#3a3a38">${e(d.property_address || "—")}</div>
          <div style="font-size:12.5px;color:#8a8580;margin-top:4px">Submitted ${e(d.submitted_at_display || "—")}</div>
        </td></tr>

        <!-- Service banner -->
        <tr><td style="padding:14px 18px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
          <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:4px">Service</div>
          <div style="font-size:15px;font-weight:500;color:#0f0f0f">${e(d.service_package || d.service_type || "—")}</div>
          <div style="font-size:12.5px;color:#5f5e5a;margin-top:2px">Representing: ${e(rep)}${effectiveDate ? " &middot; Effective: " + e(effectiveDate) : ""} &middot; Closing: ${e(closingDate)}</div>
          ${d.preferred_tc ? `<div style="font-size:12.5px;color:#5f5e5a;margin-top:2px">Requested TC: <strong>${e(d.preferred_tc)}</strong></div>` : ""}
        </td></tr>
        <tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>

        <!-- Files -->
        <tr><td style="padding:18px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
          <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:14px">Files</div>
          <a href="${e(d.contract_url || "#")}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:13px 24px;border-radius:6px;text-decoration:none;font-weight:500;font-size:13.5px;letter-spacing:0.01em">Download executed contract &darr;</a>
          <div style="font-size:11.5px;color:#8a8580;margin-top:6px">${e(d.contract_filename || "")} &middot; link valid 7 days</div>
          ${additionalDocsBlock}
        </td></tr>
        <tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>

        <!-- Agent contact -->
        <tr><td style="padding:14px 16px;background:#fff;border:0.5px solid rgba(15,15,15,0.12);border-radius:8px">
          <div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f5e5a;margin-bottom:6px">Submitting agent</div>
          <div style="font-size:14px;font-weight:500;color:#0f0f0f">${e(d.agent_name || "—")}</div>
          <div style="font-size:13px;color:#5f5e5a">${e(d.agent_brokerage || "")}${d.agent_license ? ` &middot; ${e(d.agent_license)}` : ""}</div>
          <div style="font-size:13px;color:#5f5e5a;margin-top:4px"><a href="mailto:${e(d.agent_email || "")}" style="color:#0f0f0f;text-decoration:underline">${e(d.agent_email || "—")}</a></div>
          ${d.agent_phone ? `<div style="font-size:13px;color:#5f5e5a">${e(d.agent_phone)}</div>` : ""}
        </td></tr>
        <tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>

        ${titleBlock}
        ${lenderBlock}
        ${buyerBlock}
        ${sellerBlock}
        ${otherAgentBlock}
        ${coAgentBlock}
        ${notesBlock}

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 16px 12px;border-top:1px solid rgba(15,15,15,0.12);margin-top:12px">
          <div style="font-size:11.5px;color:#8a8580;line-height:1.55">
            Files hosted in Supabase Storage &middot; download links expire after 7 days<br>
            Submission ID: <span style="font-family:monospace;font-size:11px">${e(d.submission_id || "—")}</span>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }

  if (!RESEND_API_KEY) {
    console.error("[send-file-notification] RESEND_API_KEY env var not set");
    return jsonResp({ error: "Server misconfigured · RESEND_API_KEY missing" }, 500);
  }

  let data: FileSubmission;
  try {
    data = await req.json();
  } catch (err) {
    return jsonResp({ error: "Invalid JSON body" }, 400);
  }

  const subject =
    `New file · ${data.agent_name || "Agent"} · ${data.property_address || "Property"}`;

  const html = buildEmailHTML(data);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Aari Transactions <${FROM_ADDRESS}>`,
        to: [TC_INBOX],
        reply_to: data.agent_email || undefined,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("[send-file-notification] Resend API failed", resp.status, errBody);
      return jsonResp({ error: "Email send failed", detail: errBody }, 502);
    }

    const result = await resp.json();
    console.log("[send-file-notification] sent", result?.id);
    return jsonResp({ success: true, email_id: result?.id });
  } catch (err: any) {
    console.error("[send-file-notification] exception", err);
    return jsonResp({ error: String(err?.message || err) }, 500);
  }
});
