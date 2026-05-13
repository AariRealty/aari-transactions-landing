// Edge function: send-tc-assignment
// Trigger: tc_files UPDATE where tc_assigned_id is set
// Payload: { file_id: uuid, tc_id: uuid }

import * as React from "react";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { SITE_URL } from "../_shared/resend.ts";
import { TcAssignmentPing } from "../_email-templates/TcAssignmentPing.tsx";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: { file_id?: string; tc_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body.file_id || !body.tc_id) return json({ ok: false, error: "missing_payload" }, 400);

  const { data: file } = await supabaseAdmin
    .from("tc_files")
    .select("id, agent_id, profiles:agent_id(id, first_name, email)")
    .eq("id", body.file_id)
    .single();
  if (!file?.profiles) return json({ ok: false, error: "agent_not_found" }, 404);

  const { data: tc } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email, phone")
    .eq("id", body.tc_id)
    .single();
  if (!tc) return json({ ok: false, error: "tc_not_found" }, 404);

  // deno-lint-ignore no-explicit-any
  const agent: any = file.profiles;
  const tcFullName = [tc.first_name, tc.last_name].filter(Boolean).join(" ");

  const result = await sendEmail({
    to: agent.email,
    toUserId: agent.id,
    relatedFileId: body.file_id,
    category: "transactional",
    subject: `${tcFullName} is on your file.`,
    templateName: "tc_assignment",
    reactElement: React.createElement(TcAssignmentPing, {
      firstName: agent.first_name ?? "there",
      fileId: body.file_id.slice(0, 8),
      tcName: tcFullName,
      tcEmail: tc.email,
      tcPhone: tc.phone,
      portalUrl: `${SITE_URL}/portal.html`,
    }),
    payload: { file_id: body.file_id, tc_id: tc.id },
  });

  return json({ ok: result.sent, ...result });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
