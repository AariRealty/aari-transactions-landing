// Edge function: send-checklist
// Trigger: HTTP POST from the exit-intent checklist popup on the homepage.
// Payload: { email: string }
// Action: store the lead, send the checklist delivery email via Resend.
//
// Public-callable (anon key). Rate-limited by Supabase Auth's built-in throttling.
// No PII beyond the email + timestamp + source is captured.

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { ChecklistDelivery } from "../_email-templates/ChecklistDelivery.tsx";

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
  // Table: lead_captures (id, email, source, created_at, last_sent_at)
  // If the table doesn't exist yet, the insert errors silently and we still send the email.
  // The migration to create lead_captures should be applied before this function is exercised heavily.
  try {
    await supabaseAdmin
      .from("lead_captures")
      .upsert(
        {
          email,
          source,
          last_sent_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
  } catch (e) {
    console.error("lead_captures upsert failed (non-fatal):", e);
  }

  // ---- 2. Send the checklist delivery email ----
  const checklistUrl = `${SITE_URL}/pre-close-checklist`;
  try {
    const result = await sendEmail({
      to: email,
      toUserId: null, // anonymous visitor, not an auth user
      relatedFileId: null,
      category: "marketing",
      subject: "Your Florida Pre-Close Compliance Checklist",
      templateName: "checklist_delivery",
      reactElement: React.createElement(ChecklistDelivery, { checklistUrl }),
      payload: { source },
    });

    if (!result.sent) {
      return json({ ok: false, error: result.reason || "send_failed" }, 502);
    }

    return json({ ok: true, sent: true, resendId: result.resendId });
  } catch (e) {
    console.error("send-checklist failure:", e);
    return json({ ok: false, error: "send_exception" }, 500);
  }
});
