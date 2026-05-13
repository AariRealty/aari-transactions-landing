// Edge function: send-intake-confirmation
// Trigger: tc_files INSERT (via DB trigger -> call_edge_function)
// Payload: { file_id: uuid, agent_id: uuid }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { IntakeConfirmation } from "../_email-templates/IntakeConfirmation.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: { file_id?: string; agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.file_id || !body.agent_id) {
    return json({ ok: false, error: "missing_file_or_agent" }, 400);
  }

  // Load agent
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, email")
    .eq("id", body.agent_id)
    .single();
  if (agentErr || !agent) return json({ ok: false, error: "agent_not_found" }, 404);

  // Load file for the timestamp
  const { data: file } = await supabaseAdmin
    .from("tc_files")
    .select("created_at")
    .eq("id", body.file_id)
    .single();

  const submittedAt = file?.created_at
    ? new Date(file.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })
    : new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

  const result = await sendEmail({
    to: agent.email,
    toUserId: agent.id,
    relatedFileId: body.file_id,
    category: "transactional",
    subject: "We have your file. Here's what's next.",
    templateName: "intake_confirmation",
    reactElement: React.createElement(IntakeConfirmation, {
      firstName: agent.first_name ?? "there",
      fileId: body.file_id.slice(0, 8),
      submittedAt,
      portalUrl: `${SITE_URL}/portal.html`,
    }),
    payload: { file_id: body.file_id, agent_id: agent.id },
  });

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
