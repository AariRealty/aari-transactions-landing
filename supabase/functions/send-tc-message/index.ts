// Edge function: send-tc-message
// Trigger: HTTP POST from portal.html "Message TC" modal.
// Payload: { file_id: uuid, body: string, agent_id?: uuid }
// Action: insert into messages table, send email notification to TC team.
//
// Auth: requires a logged-in agent (Bearer token). RLS enforces that the
// agent owns the file they're messaging about.

import * as React from "react";
import { createClient } from "supabase";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { TcMessageNotification } from "../_email-templates/TcMessageNotification.tsx";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};
const TC_INBOX = Deno.env.get("TC_INBOX_EMAIL") ?? "hello@aaritransactions.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // ---- 1. Verify caller is an authenticated agent ----
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supaAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supaUrl, supaAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }
  const userId = userData.user.id;

  // ---- 2. Validate payload ----
  let body: { file_id?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const fileId = (body.file_id || "").trim();
  const msgBody = (body.body || "").trim();
  if (!fileId) return json({ ok: false, error: "missing_file_id" }, 400);
  if (msgBody.length < 2) return json({ ok: false, error: "body_too_short" }, 400);
  if (msgBody.length > 5000) return json({ ok: false, error: "body_too_long" }, 400);

  // ---- 3. Verify the file belongs to this agent + fetch context for the email ----
  const { data: file, error: fileErr } = await supabaseAdmin
    .from("files")
    .select("id, agent_id, property_address")
    .eq("id", fileId)
    .single();
  if (fileErr || !file) return json({ ok: false, error: "file_not_found" }, 404);
  if (file.agent_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("first_name, last_name, email")
    .eq("id", userId)
    .single();

  const agentName = agent ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() : "Agent";
  const agentEmail = agent?.email || userData.user.email || "(no email)";

  // ---- 4. Insert message row ----
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("messages")
    .insert({
      file_id: fileId,
      agent_id: userId,
      sender_type: "agent",
      body: msgBody,
    })
    .select("id")
    .single();
  if (insertErr) {
    console.error("messages insert failed:", insertErr);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  // ---- 5. Send TC notification email ----
  try {
    const portalUrl = `${SITE_URL}/portal#file-${fileId}`;
    const result = await sendEmail({
      to: TC_INBOX,
      toUserId: null,
      relatedFileId: fileId,
      category: "transactional",
      subject: `New message · ${agentName} · ${file.property_address || "file " + fileId.slice(0, 8)}`,
      templateName: "tc_message_notification",
      reactElement: React.createElement(TcMessageNotification, {
        agentName,
        agentEmail,
        propertyAddress: file.property_address || "(no address)",
        fileId: fileId,
        body: msgBody,
        portalUrl,
      }),
      payload: { message_id: inserted.id, agent_id: userId },
    });

    if (result.sent) {
      // Mark email_sent_at on the message row
      await supabaseAdmin
        .from("messages")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }

    return json({ ok: true, message_id: inserted.id, email_sent: result.sent });
  } catch (e) {
    console.error("send-tc-message email failure:", e);
    // Message is stored even if email fails. Return success on the storage side.
    return json({ ok: true, message_id: inserted.id, email_sent: false, email_error: "send_exception" });
  }
});
