// ============================================================================
// nudge-tc · Edge Function
// ============================================================================
// Broker-initiated reminder to TC about a pending agent message.
// Sends SMS + email + increments file_messages.nudge_count.
// Logs to audit_log.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: actor } = await admin.from("agents").select("role, first_name, last_name").eq("id", user.id).single();
    if (!actor || actor.role !== "broker") return json({ error: "Broker only" }, 403);

    const { message_id } = await req.json();
    if (!message_id) return json({ error: "Missing message_id" }, 400);

    const { data: msg } = await admin.from("file_messages")
      .select("id, file_id, message, sent_at, nudge_count")
      .eq("id", message_id).single();
    if (!msg) return json({ error: "Message not found" }, 404);

    const { data: file } = await admin.from("files")
      .select("id, assigned_tc_id, property_address").eq("id", msg.file_id).single();
    if (!file || !file.assigned_tc_id) return json({ error: "No TC assigned" }, 400);

    const { data: tc } = await admin.from("agents")
      .select("first_name, last_name, email, phone").eq("id", file.assigned_tc_id).single();
    if (!tc) return json({ error: "TC not found" }, 404);

    const tcName = `${tc.first_name || ""} ${tc.last_name || ""}`.trim() || "TC";
    const brokerName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || "Broker";
    const addr = file.property_address || "the file";
    const minutes = Math.floor((Date.now() - new Date(msg.sent_at).getTime()) / 60000);
    const timeAgo = minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hours ago`;
    const link = `https://aaritransactions.com/files.html?open=${file.id}`;

    const smsBody = `Aari · ${brokerName} is nudging you · agent message on ${addr} sent ${timeAgo} is still awaiting reply.\n\nOpen: ${link}`;

    // SMS
    let smsOk = false;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && tc.phone) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: TWILIO_FROM, To: tc.phone, Body: smsBody }).toString(),
        });
        smsOk = r.ok;
      } catch (_) {}
    }

    // Email
    let emailOk = false;
    if (RESEND_API_KEY && tc.email) {
      try {
        const html = `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f0f0f">
            <div style="border-bottom:1px solid #e6e2d8;padding-bottom:14px;margin-bottom:18px">
              <div style="font-size:11px;color:#c44b3b;letter-spacing:.5px;text-transform:uppercase;font-weight:600">Broker nudge · reply needed</div>
              <div style="font-size:18px;font-weight:500;margin-top:4px">${escapeHtml(addr)}</div>
            </div>
            <p style="font-size:14px;line-height:1.5">${escapeHtml(brokerName)} is asking you to reply to the agent message about <strong>${escapeHtml(addr)}</strong>. The message was sent <strong>${timeAgo}</strong> and is still awaiting your response.</p>
            <div style="background:#fafaf9;padding:16px;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin:18px 0">${escapeHtml(msg.message)}</div>
            <a href="${link}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Reply via file →</a>
          </div>
        `;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Aari Transactions <noreply@aaritransactions.com>",
            to: [tc.email],
            subject: `[NUDGE] ${brokerName} wants you to reply · ${addr}`,
            html,
          }),
        });
        emailOk = r.ok;
      } catch (_) {}
    }

    // Update message + audit log
    await admin.from("file_messages").update({
      nudge_count: (msg.nudge_count || 0) + 1,
      last_nudge_at: new Date().toISOString(),
    }).eq("id", message_id);

    await admin.from("audit_log").insert({
      actor_id: user.id, actor_type: "broker", action: "broker_nudged_tc",
      target_table: "file_messages", target_id: message_id,
      details: { file_id: file.id, tc_id: file.assigned_tc_id, sms: smsOk, email: emailOk, minutes_pending: minutes },
    });

    return json({ ok: smsOk || emailOk, sms: smsOk, email: emailOk });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
