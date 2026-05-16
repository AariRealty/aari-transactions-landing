// Edge function: send-tc-new-file
// Trigger: tc_files INSERT (if tc_assigned_id set) OR UPDATE when tc_assigned_id
//          transitions from NULL → a value. Fired by the tc_files DB triggers.
// Payload: { file_id: uuid, tc_id: uuid }
//
// Action (Option C · email + in-portal):
//   1. Send email to the TC at their address on file.
//   2. Insert a row into public.notifications so the TC Cockpit gets a realtime
//      toast + badge.
//
// If the email fails the notification row still inserts (and vice versa) so
// the TC always learns about the file via at least one channel.

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { TcNewFileAssigned } from "../_email-templates/TcNewFileAssigned.tsx";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ---- 1. Parse payload ----
  let body: { file_id?: string; tc_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.file_id || !body.tc_id) {
    return json({ ok: false, error: "missing_payload" }, 400);
  }

  // ---- 2. Fetch file + agent in one query ----
  const { data: file, error: fileErr } = await supabaseAdmin
    .from("tc_files")
    .select("id, agent_id, property_address, service_name, closing_date, profiles:agent_id(id, first_name, last_name, email)")
    .eq("id", body.file_id)
    .single();
  if (fileErr || !file) {
    console.error("send-tc-new-file: file not found", body.file_id, fileErr);
    return json({ ok: false, error: "file_not_found" }, 404);
  }

  // ---- 3. Fetch TC profile (need email) ----
  const { data: tc, error: tcErr } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", body.tc_id)
    .single();
  if (tcErr || !tc) {
    console.error("send-tc-new-file: tc not found", body.tc_id, tcErr);
    return json({ ok: false, error: "tc_not_found" }, 404);
  }
  if (!tc.email) {
    console.warn("send-tc-new-file: tc has no email on file", body.tc_id);
  }

  // deno-lint-ignore no-explicit-any
  const agent: any = file.profiles;
  const agentName = agent
    ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "(unnamed agent)"
    : "(unnamed agent)";
  const agentEmail = agent?.email || undefined;
  const portalUrl = `${SITE_URL}/portal#file-${file.id}`;

  // ---- 4. Send email (best-effort) ----
  let emailSent = false;
  if (tc.email) {
    try {
      const result = await sendEmail({
        to: tc.email,
        toUserId: tc.id,
        relatedFileId: file.id,
        category: "transactional",
        subject: `New file assigned · ${file.property_address || `#${file.id.slice(0, 8)}`}`,
        templateName: "tc_new_file_assigned",
        reactElement: React.createElement(TcNewFileAssigned, {
          tcFirstName: tc.first_name ?? "",
          agentName,
          agentEmail,
          propertyAddress: file.property_address || "(no address yet)",
          fileIdShort: file.id.slice(0, 8),
          serviceName: file.service_name || "Transaction Coordination",
          closingDate: file.closing_date || undefined,
          portalUrl,
        }),
        payload: { file_id: file.id, tc_id: tc.id, agent_id: file.agent_id },
      });
      emailSent = !!result.sent;
    } catch (e) {
      console.error("send-tc-new-file: email send threw", e);
    }
  }

  // ---- 5. Insert in-portal notification (independent of email outcome) ----
  const { error: notifErr } = await supabaseAdmin
    .from("notifications")
    .insert({
      recipient_id: tc.id,
      type: "tc_file_assigned",
      title: `New file · ${agentName}`,
      body: file.property_address || "(no address yet)",
      related_file_id: file.id,
      payload: {
        agent_id: file.agent_id,
        agent_email: agentEmail || null,
        service_name: file.service_name || null,
        closing_date: file.closing_date || null,
      },
    });
  if (notifErr) {
    console.error("send-tc-new-file: notification insert failed", notifErr);
  }

  return json({
    ok: emailSent || !notifErr,
    email_sent: emailSent,
    notification_inserted: !notifErr,
  });
});
