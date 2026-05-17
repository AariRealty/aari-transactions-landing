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
import { render } from "npm:@react-email/render@0.0.16";
import { TcAcceptanceToAgent } from "../_email-templates/TcAcceptanceToAgent.tsx";
import { sendEmail } from "../_shared/send-email.ts";

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

  // Pull everything we need in one query · file + agent + tc
  const { data: f, error: fileErr } = await admin
    .from("files")
    .select(`
      id, agent_id, assigned_tc_id, property_address, tc_expected_start_at,
      agent:agents!files_agent_id_fkey ( id, first_name, email ),
      tc:agents!files_assigned_tc_id_fkey ( id, first_name, last_name, email, phone )
    `)
    .eq("id", body.file_id)
    .single();

  if (fileErr || !f) return j(404, { ok: false, error: "File not found" });
  // deno-lint-ignore no-explicit-any
  const agent = (f as any).agent;
  // deno-lint-ignore no-explicit-any
  const tc = (f as any).tc;
  if (!agent?.email) return j(422, { ok: false, error: "Agent missing email" });
  if (!tc) return j(422, { ok: false, error: "TC missing on file" });

  const tcName = `${tc.first_name ?? ""} ${tc.last_name ?? ""}`.trim();
  const startFormatted = formatStartTime(f.tc_expected_start_at);
  const fileShortId = String(f.id).slice(0, 8).toUpperCase();

  const html = render(
    React.createElement(TcAcceptanceToAgent, {
      firstName: agent.first_name ?? "there",
      fileId: fileShortId,
      propertyAddress: f.property_address ?? "(property)",
      tcName,
      tcEmail: tc.email ?? "",
      tcPhone: tc.phone ?? undefined,
      expectedStartAtFormatted: startFormatted,
      portalUrl: PORTAL_URL,
    })
  );

  try {
    await sendEmail({
      to: agent.email,
      subject: `${tcName} accepted your file · starts ${startFormatted}`,
      html,
      category: "transactional",
      relatedTable: "files",
      relatedId: f.id,
    });
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
