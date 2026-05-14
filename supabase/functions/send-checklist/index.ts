// Edge function: send-checklist
// Trigger: HTTP POST from the exit-intent checklist popup on the homepage.
// Payload: { email: string }
// Action: store the lead, send the checklist delivery email via Resend.
//
// MAY 2026 REWRITE: bypasses React rendering entirely. Sends hardcoded HTML
// directly to Resend. @react-email/render was returning empty <template> tags
// in Deno edge runtime even after removing all @react-email/components imports.

import { supabaseAdmin } from "../_shared/supabase.ts";
import { resend, FROM, REPLY_TO, SITE_URL } from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function buildChecklistHtml(checklistUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Florida Pre-Close Compliance Checklist</title>
</head>
<body style="background:#fafaf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:32px 16px;color:#444;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e2d8;border-radius:12px;overflow:hidden;">

    <div style="padding:24px 36px 18px;border-bottom:1px solid #e6e2d8;">
      <span style="font-family:Georgia,serif;font-weight:600;font-size:22px;color:#0f0f0f;letter-spacing:3px;display:inline-block;padding:4px 12px;border:1.5px solid #0f0f0f;border-radius:5px;line-height:1;">AARI</span>
      <div style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#6b6b6b;font-weight:600;margin-top:10px;">FLORIDA TC &middot; BROKER-OWNED</div>
    </div>

    <div style="padding:32px 36px;">
      <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:500;color:#0f0f0f;margin:0 0 18px;line-height:1.15;">Your checklist. Inside.</h1>

      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 14px;">
        Thanks for grabbing the Florida Pre-Close Compliance Checklist. 15 items, 5 sections,
        built from real files we've closed in Lehigh, Cape Coral, and Fort Myers.
      </p>

      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 14px;">
        Use it the next time you're 72 hours from closing. Run every item. Escalate anything
        missing by phone, not email. That's the difference between a clean close and a deal
        that slips three days.
      </p>

      <div style="margin:22px 0;">
        <a href="${checklistUrl}" style="display:inline-block;background:#0f0f0f;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">Open the checklist &rarr;</a>
      </div>

      <p style="font-size:13px;color:#666;line-height:1.55;margin:0 0 12px;">
        You can also print it as a PDF for closing-day prep &mdash; there's a Print button at the top of the page.
      </p>

      <p style="font-size:13px;color:#666;line-height:1.55;margin:0 0 12px;">
        If you ever want a broker-owned TC to run this for you on every file, hit reply.
        That's how this whole thing started.
      </p>

      <p style="font-size:14px;color:#0f0f0f;margin:26px 0 0;line-height:1.5;">
        <strong style="color:#0f0f0f;">&mdash; Marlenyi Paredes</strong><br>
        <span style="font-size:11px;color:#888;letter-spacing:0.3px;">Florida Real Estate Broker &middot; Aari Transactions</span>
      </p>
    </div>

    <div style="padding:18px 36px 28px;border-top:1px solid #e6e2d8;">
      <p style="font-size:12px;color:#6b6b6b;margin:0 0 8px;line-height:1.6;">
        <a href="mailto:hello@aaritransactions.com" style="color:#0f0f0f;text-decoration:underline;">hello@aaritransactions.com</a>
        &nbsp;&middot;&nbsp;
        <a href="tel:+12396881770" style="color:#0f0f0f;text-decoration:underline;">239.688.1770</a>
        &nbsp;&middot;&nbsp;
        <a href="https://aaritransactions.com" style="color:#0f0f0f;text-decoration:underline;">aaritransactions.com</a>
      </p>
      <p style="font-size:11px;color:#888;margin:0;line-height:1.5;">
        Aari Transactions LLC
      </p>
    </div>

  </div>
</body>
</html>`;
}

function buildChecklistText(checklistUrl: string): string {
  return `Your checklist. Inside.

Thanks for grabbing the Florida Pre-Close Compliance Checklist. 15 items, 5 sections, built from real files we've closed in Lehigh, Cape Coral, and Fort Myers.

Use it the next time you're 72 hours from closing. Run every item. Escalate anything missing by phone, not email. That's the difference between a clean close and a deal that slips three days.

Open the checklist: ${checklistUrl}

You can also print it as a PDF for closing-day prep — there's a Print button at the top of the page.

If you ever want a broker-owned TC to run this for you on every file, hit reply. That's how this whole thing started.

— Marlenyi Paredes
Florida Real Estate Broker · Aari Transactions

hello@aaritransactions.com · 239.688.1770 · aaritransactions.com
Aari Transactions LLC`;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: { email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const source = (body.source || "exit_intent_florida_checklist").trim().slice(0, 80);

  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: "invalid_email" }, 400);
  }

  // ---- 1. Store the lead (idempotent on email) ----
  try {
    await supabaseAdmin
      .from("lead_captures")
      .upsert(
        { email, source, last_sent_at: new Date().toISOString() },
        { onConflict: "email" }
      );
  } catch (e) {
    console.error("lead_captures upsert failed (non-fatal):", e);
  }

  // ---- 2. Build HTML + plaintext, send via Resend directly (no React render) ----
  const checklistUrl = `${SITE_URL}/pre-close-checklist`;
  const html = buildChecklistHtml(checklistUrl);
  const text = buildChecklistText(checklistUrl);

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: [email],
      replyTo: REPLY_TO,
      subject: "Your Florida Pre-Close Compliance Checklist",
      html,
      text,
      tags: [
        { name: "template", value: "checklist_delivery" },
        { name: "category", value: "marketing" },
      ],
    });

    if (result.error) {
      console.error("Resend rejected send:", result.error);
      return json({ ok: false, error: String(result.error) }, 502);
    }

    // Best-effort email_log row (non-fatal if table missing or insert fails)
    try {
      await supabaseAdmin.from("email_log").insert({
        email_type: "checklist_delivery",
        to_address: email,
        status: "sent",
        subject: "Your Florida Pre-Close Compliance Checklist",
        template: "checklist_delivery",
        payload: { source },
        resend_id: result.data?.id ?? null,
      });
    } catch (logErr) {
      console.error("email_log insert failed (non-fatal):", logErr);
    }

    return json({ ok: true, sent: true, resendId: result.data?.id });
  } catch (e) {
    console.error("send-checklist failure:", e);
    return json({ ok: false, error: "send_exception" }, 500);
  }
});
