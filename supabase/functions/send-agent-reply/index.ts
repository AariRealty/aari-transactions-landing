// Edge function: send-agent-reply
// Trigger: HTTP POST from aari-crm.html Inbox tab "Send reply" button.
// Payload: { file_id: uuid, body: string }
// Action: verify caller is staff (TC or broker), insert TC reply into messages,
//   send Resend email to the agent who originated the thread.

import * as React from "react";
import { createClient } from "supabase";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { AgentMessageReply } from "../_email-templates/AgentMessageReply.tsx";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // ---- 1. Auth · caller must be staff (tc | broker) ----
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supaAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supaUrl, supaAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ ok: false, error: "invalid_session" }, 401);
  const userId = userData.user.id;

  // Role check via admin client (RLS-bypass)
  const { data: staffProfile, error: staffErr } = await supabaseAdmin
    .from("agents")
    .select("id, first_name, last_name, role")
    .eq("id", userId)
    .single();
  if (staffErr || !staffProfile) return json({ ok: false, error: "no_profile" }, 403);
  if (staffProfile.role !== "tc" && staffProfile.role !== "broker") {
    return json({ ok: false, error: "not_staff" }, 403);
  }

  // ---- 2. Payload ----
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

  // ---- 3. Lookup file + originating agent ----
  const { data: file, error: fileErr } = await supabaseAdmin
    .from("files")
    .select("id, agent_id, property_address")
    .eq("id", fileId)
    .single();
  if (fileErr || !file) return json({ ok: false, error: "file_not_found" }, 404);

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("first_name, last_name, email")
    .eq("id", file.agent_id)
    .single();
  if (!agent || !agent.email) {
    return json({ ok: false, error: "agent_email_missing" }, 422);
  }

  // ---- 4. Insert the TC reply ----
  // sender_type='tc' but agent_id is the originating agent (so threads group correctly).
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("messages")
    .insert({
      file_id: fileId,
      agent_id: file.agent_id,
      sender_type: "tc",
      body: msgBody,
    })
    .select("id")
    .single();
  if (insertErr) {
    console.error("messages insert failed:", insertErr);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  // ---- 5. Send email to the agent ----
  try {
    const tcName = ((staffProfile.first_name || "") + " " + (staffProfile.last_name || "")).trim() || "Your TC";
    const portalUrl = `${SITE_URL}/portal`;
    const result = await sendEmail({
      to: agent.email,
      toUserId: file.agent_id,
      relatedFileId: fileId,
      category: "transactional",
      subject: `${tcName} replied · ${file.property_address || "your file"}`,
      templateName: "agent_message_reply",
      reactElement: React.createElement(AgentMessageReply, {
        agentFirstName: agent.first_name || "there",
        tcName,
        propertyAddress: file.property_address || "(no address)",
        body: msgBody,
        portalUrl,
      }),
      payload: { message_id: inserted.id, tc_id: userId },
    });

    if (result.sent) {
      await supabaseAdmin
        .from("messages")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }

    return json({ ok: true, message_id: inserted.id, email_sent: result.sent });
  } catch (e) {
    console.error("send-agent-reply email failure:", e);
    // Reply stored even if email fails
    return json({ ok: true, message_id: inserted.id, email_sent: false, email_error: "send_exception" });
  }
});
