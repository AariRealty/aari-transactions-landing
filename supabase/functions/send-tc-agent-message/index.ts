// ============================================================================
// send-tc-agent-message · Edge Function
// ============================================================================
// Triggered when an agent sends a message from the agent portal.
//
// 1. SMS the TC (Twilio)
// 2. Email the TC (Resend) · audit + backup
// 3. Email the broker(s) · CC on every agent-to-TC message
// 4. Update file_messages.tc_notified_at + broker_notified_at
//
// Body: { file_id, message_id, message }
// Auth: requires authenticated agent who owns the file (RLS-safe).
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
const FROM_EMAIL = "Aari Transactions <noreply@aaritransactions.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const { file_id, message_id, message } = await req.json();
    if (!file_id || !message) {
      return json({ error: "Missing file_id or message" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: file } = await admin.from("files")
      .select("id, agent_id, assigned_tc_id, property_address")
      .eq("id", file_id).single();
    if (!file) return json({ error: "File not found" }, 404);
    if (file.agent_id !== user.id) return json({ error: "Not your file" }, 403);

    const { data: tc } = file.assigned_tc_id
      ? await admin.from("agents").select("id, first_name, last_name, email, phone").eq("id", file.assigned_tc_id).single()
      : { data: null };

    const { data: agent } = await admin.from("agents")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id).single();

    // Pull all brokers (notify every broker on the team)
    const { data: brokers } = await admin.from("agents")
      .select("first_name, last_name, email")
      .eq("role", "broker");

    const tcName = tc ? `${tc.first_name || ""} ${tc.last_name || ""}`.trim() || "TC" : "TC";
    const agentName = `${agent?.first_name || ""} ${agent?.last_name || ""}`.trim() || "Agent";
    const addr = file.property_address || "your file";
    const tcLink = `https://aaritransactions.com/files.html?open=${file.id}`;
    const brokerLink = `https://aaritransactions.com/broker-cockpit.html#messages`;

    // ============================================================
    // 1. SMS to TC via Twilio
    // ============================================================
    const smsBody = `Aari · ${agentName} sent a message about ${addr}:\n\n"${message.slice(0, 240)}${message.length > 240 ? "…" : ""}"\n\nReply via the file: ${tcLink}`;

    let smsOk = false, smsErr = "";
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && tc?.phone) {
      try {
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: TWILIO_FROM, To: tc.phone, Body: smsBody }).toString(),
        });
        smsOk = twilioRes.ok;
        if (!twilioRes.ok) smsErr = await twilioRes.text();
      } catch (e) { smsErr = String(e); }
    }

    // ============================================================
    // 2. Email to TC via Resend
    // ============================================================
    let tcEmailOk = false, tcEmailErr = "";
    if (RESEND_API_KEY && tc?.email) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [tc.email],
            reply_to: agent?.email ? [agent.email] : undefined,
            subject: `Agent message · ${addr}`,
            html: msgEmailHtml(agentName, addr, message, "tc", tcLink, agent),
          }),
        });
        tcEmailOk = r.ok;
        if (!r.ok) tcEmailErr = await r.text();
      } catch (e) { tcEmailErr = String(e); }
    }

    // ============================================================
    // 3. Email broker(s)
    // ============================================================
    let brokerEmailOk = false, brokerEmailErr = "";
    if (RESEND_API_KEY && brokers && brokers.length > 0) {
      try {
        const brokerEmails = brokers.map(b => b.email).filter(Boolean) as string[];
        if (brokerEmails.length > 0) {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: brokerEmails,
              subject: `[Broker copy] Agent → TC message · ${addr}`,
              html: msgEmailHtml(agentName, addr, message, "broker", brokerLink, agent, tcName),
            }),
          });
          brokerEmailOk = r.ok;
          if (!r.ok) brokerEmailErr = await r.text();
        }
      } catch (e) { brokerEmailErr = String(e); }
    }

    // ============================================================
    // 4. Update file_messages with notification timestamps
    // ============================================================
    if (message_id) {
      await admin.from("file_messages").update({
        tc_notified_at: tcEmailOk || smsOk ? new Date().toISOString() : null,
        broker_notified_at: brokerEmailOk ? new Date().toISOString() : null,
      }).eq("id", message_id);
    }

    return json({
      ok: smsOk || tcEmailOk || brokerEmailOk,
      sms: { sent: smsOk, error: smsErr || undefined },
      tc_email: { sent: tcEmailOk, error: tcEmailErr || undefined },
      broker_email: { sent: brokerEmailOk, error: brokerEmailErr || undefined },
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function msgEmailHtml(agentName: string, addr: string, message: string, who: "tc" | "broker", link: string, agent: any, tcName?: string): string {
  const eb = who === "broker" ? "Broker copy · agent → TC message" : "Agent message";
  const cta = who === "broker" ? "Open broker cockpit →" : "Reply via file →";
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f0f0f">
      <div style="border-bottom:1px solid #e6e2d8;padding-bottom:14px;margin-bottom:18px">
        <div style="font-size:11px;color:#888;letter-spacing:.5px;text-transform:uppercase;font-weight:600">${eb}</div>
        <div style="font-size:18px;font-weight:500;margin-top:4px">${escapeHtml(agentName)} · ${escapeHtml(addr)}</div>
        ${tcName ? `<div style="font-size:12px;color:#888;margin-top:3px">Assigned TC: ${escapeHtml(tcName)}</div>` : ""}
      </div>
      <div style="background:#fafaf9;padding:16px;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(message)}</div>
      <div style="margin-top:18px;font-size:13px;color:#555;line-height:1.5">
        <strong>${escapeHtml(agentName)}</strong><br>
        ${agent?.email ? `<a href="mailto:${escapeHtml(agent.email)}" style="color:#0f0f0f">${escapeHtml(agent.email)}</a><br>` : ""}
        ${agent?.phone ? `${escapeHtml(agent.phone)}` : ""}
      </div>
      <div style="margin-top:24px">
        <a href="${link}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">${cta}</a>
      </div>
    </div>
  `;
}
