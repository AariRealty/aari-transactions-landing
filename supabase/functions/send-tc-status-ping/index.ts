// Edge function: send-tc-status-ping
// Trigger: tc_files UPDATE where status changed (not 'closed')
// Payload: { file_id: uuid, new_status: string, previous_status: string, status_note?: string }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { TcStatusPing } from "../_email-templates/TcStatusPing.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: { file_id?: string; new_status?: string; previous_status?: string; status_note?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body.file_id || !body.new_status) return json({ ok: false, error: "missing_payload" }, 400);

  const { data: file } = await supabaseAdmin
    .from("tc_files")
    .select("id, agent_id, tc_assigned_id, status_note, profiles:agent_id(id, first_name, email), tc:tc_assigned_id(first_name, last_name)")
    .eq("id", body.file_id)
    .single();
  if (!file?.profiles) return json({ ok: false, error: "agent_not_found" }, 404);

  // deno-lint-ignore no-explicit-any
  const agent: any = file.profiles;
  // deno-lint-ignore no-explicit-any
  const tc: any = file.tc;
  const tcName = tc ? [tc.first_name, tc.last_name].filter(Boolean).join(" ") : "Your coordinator";

  const result = await sendEmail({
    to: agent.email,
    toUserId: agent.id,
    relatedFileId: body.file_id,
    category: "transactional",
    subject: `File #${body.file_id.slice(0, 8)} moved to ${body.new_status}.`,
    templateName: "tc_status_ping",
    reactElement: React.createElement(TcStatusPing, {
      firstName: agent.first_name ?? "there",
      fileId: body.file_id.slice(0, 8),
      previousStatus: body.previous_status ?? "earlier",
      newStatus: body.new_status,
      statusNote: body.status_note ?? file.status_note,
      tcName,
      portalUrl: `${SITE_URL}/portal.html`,
    }),
    payload: { file_id: body.file_id, new_status: body.new_status },
  });

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
