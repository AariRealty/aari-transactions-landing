// ============================================================================
// Aari Transactions · send-tc-acceptance-to-agent
// ============================================================================
// Fires when a TC accepts a file via tc-accept-file. Renders the
// TcAcceptanceToAgent template and sends via Resend.
//
// Body: { file_id: uuid }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as React from "npm:react@18";
import { TcAcceptanceToAgent } from "../_email-templates/TcAcceptanceToAgent.tsx";
import { sendEmail } from "../_shared/send-email.ts";
import { resolveClientEmailRedirect, reviewSubjectPrefix } from "../_shared/client-email-hold.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("AARI_PORTAL_URL") ?? "https://aaritransactions.com/portal.html";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: { file_id?: string };
  try { body = await req.json(); }
  catch { return j(400, { ok: false, error: "Invalid JSON" }); }
  if (!body.file_id) return j(400, { ok: false, error: "file_id required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Plain queries · skip the embedded join syntax (FK relationship names
  // vary across projects and are fragile to migrate).
  const { data: f, error: fileErr } = await admin
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address, tc_expected_start_at")
    .eq("id", body.file_id)
    .maybeSingle();
  if (fileErr) return j(500, { ok: false, error: "File lookup failed: " + fileErr.message });
  if (!f) return j(404, { ok: false, error: "File not found · id=" + body.file_id });

  const { data: agent } = await admin
    .from("agents").select("id, first_name, email, onboarding_complete")
    .eq("id", f.agent_id).maybeSingle();
  if (!agent?.email) return j(422, { ok: false, error: "Agent missing email" });

  let tc: { id: string; first_name?: string; last_name?: string; email?: string; phone?: string } | null = null;
  if (f.assigned_tc_id) {
    const { data: tcRow } = await admin
      .from("agents").select("id, first_name, last_name, email, phone")
      .eq("id", f.assigned_tc_id).maybeSingle();
    tc = tcRow;
  }
  if (!tc) return j(422, { ok: false, error: "TC missing on file" });

  const tcName = `${tc.first_name ?? ""} ${tc.last_name ?? ""}`.trim();
  const startFormatted = formatStartTime(f.tc_expected_start_at);
  const fileShortId = String(f.id).slice(0, 8).toUpperCase();

  // Client-email review-hold gate · redirect to Marlenyi during Samantha beta.
  const redirect = await resolveClientEmailRedirect({ agentId: f.agent_id, email: agent.email });
  const emailTo = redirect ? redirect.redirectTo : agent.email;
  const emailSubject = redirect
    ? reviewSubjectPrefix(redirect, `${tcName} accepted your file · starts ${startFormatted}`)
    : `${tcName} accepted your file · starts ${startFormatted}`;

  // Send through the shared helper with a reactElement (the signature every working
  // email uses, e.g. send-tc-message). The old code rendered `html` and passed it to
  // sendEmail, which only reads `reactElement` — so this email had been sending empty.
  try {
    const result = await sendEmail({
      to: emailTo,
      toUserId: agent.id,
      relatedFileId: f.id,
      category: "transactional",
      subject: emailSubject,
      templateName: "tc_acceptance_to_agent",
      reactElement: React.createElement(TcAcceptanceToAgent, {
        firstName: agent.first_name ?? "there",
        fileId: fileShortId,
        propertyAddress: f.property_address ?? "(property)",
        tcName,
        tcEmail: tc.email ?? "",
        tcPhone: tc.phone ?? undefined,
        expectedStartAtFormatted: startFormatted,
        portalUrl: PORTAL_URL,
        // Option B invite · nudge the profile only for agents who haven't finished it.
        showProfileInvite: agent.onboarding_complete === false,
      }),
      payload: { file_id: f.id },
    });
    if (!result.sent) {
      console.error("[send-tc-acceptance-to-agent] not sent:", result.reason);
      return j(500, { ok: false, error: result.reason ?? "send_failed" });
    }
  } catch (e) {
    console.error("[send-tc-acceptance-to-agent] send failed:", e);
    return j(500, { ok: false, error: "Email send failed" });
  }

  return j(200, { ok: true });
});

function formatStartTime(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (d.toDateString() === today.toDateString()) return `${time} today`;
  if (d.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
