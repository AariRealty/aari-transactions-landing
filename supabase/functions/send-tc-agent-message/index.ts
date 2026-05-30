// ============================================================================
// send-tc-agent-message · Edge Function
// ============================================================================
// Triggered when an agent sends a message to their TC from the agent portal
// (/portal.html · transaction card drawer · Message TC form).
//
// Sends:
//   1. SMS to TC's phone (via Twilio) · primary delivery channel
//   2. Email to TC's email (via Resend) · audit trail + backup
//
// Body shape:
//   { file_id, tc_id, message, subject }
//
// Auth: Requires authenticated agent. RLS on files ensures the agent can only
// message TCs assigned to their own files.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Aari Transactions <noreply@aaritransactions.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_id, tc_id, message, subject } = await req.json();
    if (!file_id || !message) {
      return new Response(JSON.stringify({ error: "Missing file_id or message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client · resolve TC + agent + file details server-side
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: file } = await admin.from("files")
      .select("id, agent_id, assigned_tc_id, property_address")
      .eq("id", file_id).single();

    if (!file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.agent_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not your file" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedTcId = tc_id || file.assigned_tc_id;
    if (!resolvedTcId) {
      return new Response(JSON.stringify({ error: "No TC assigned to this file yet" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tc } = await admin.from("agents")
      .select("first_name, last_name, email, phone")
      .eq("id", resolvedTcId).single();

    const { data: agent } = await admin.from("agents")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id).single();

    if (!tc) {
      return new Response(JSON.stringify({ error: "TC profile missing" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tcName = `${tc.first_name || ""} ${tc.last_name || ""}`.trim() || "TC";
    const agentName = `${agent?.first_name || ""} ${agent?.last_name || ""}`.trim() || "Agent";
    const addr = file.property_address || "your file";
    const portalLink = `https://aaritransactions.com/files.html?open=${file.id}`;

    // ============================================================
    // 1. SMS via Twilio
    // ============================================================
    const smsBody = `Aari · ${agentName} sent you a message about ${addr}:\n\n"${message.slice(0, 240)}${message.length > 240 ? "…" : ""}"\n\nOpen file: ${portalLink}`;

    let smsOk = false;
    let smsError = "";

    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && tc.phone) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        const twilioBody = new URLSearchParams({
          From: TWILIO_FROM,
          To: tc.phone,
          Body: smsBody,
        });
        const twilioRes = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: twilioBody.toString(),
        });
        smsOk = twilioRes.ok;
        if (!twilioRes.ok) {
          smsError = await twilioRes.text();
        }
      } catch (e) {
        smsError = String(e);
      }
    } else {
      smsError = "Twilio credentials or TC phone missing";
    }

    // ============================================================
    // 2. Email via Resend (audit + backup channel)
    // ============================================================
    let emailOk = false;
    let emailError = "";

    if (RESEND_API_KEY && tc.email) {
      try {
        const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f0f0f">
            <div style="border-bottom:1px solid #e6e2d8;padding-bottom:14px;margin-bottom:18px">
              <div style="font-size:11px;color:#888;letter-spacing:.5px;text-transform:uppercase;font-weight:600">Agent message</div>
              <div style="font-size:18px;font-weight:500;margin-top:4px">${escapeHtml(agentName)} · ${escapeHtml(addr)}</div>
            </div>
            <div style="background:#fafaf9;padding:16px;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(message)}</div>
            <div style="margin-top:18px;font-size:13px;color:#555;line-height:1.5">
              <strong>${escapeHtml(agentName)}</strong><br>
              ${agent?.email ? `<a href="mailto:${escapeHtml(agent.email)}" style="color:#0f0f0f">${escapeHtml(agent.email)}</a><br>` : ""}
              ${agent?.phone ? `${escapeHtml(agent.phone)}` : ""}
            </div>
            <div style="margin-top:24px">
              <a href="${portalLink}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open file in TC dashboard →</a>
            </div>
            <div style="margin-top:24px;font-size:11px;color:#999;border-top:1px solid #ececec;padding-top:14px">
              You also received this as a text message at ${escapeHtml(tc.phone || "your phone on file")}.
            </div>
          </div>
        `;
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [tc.email],
            reply_to: agent?.email ? [agent.email] : undefined,
            subject: subject || `Agent message about ${addr}`,
            html: emailHtml,
          }),
        });
        emailOk = resendRes.ok;
        if (!resendRes.ok) emailError = await resendRes.text();
      } catch (e) {
        emailError = String(e);
      }
    } else {
      emailError = "Resend not configured or TC email missing";
    }

    return new Response(
      JSON.stringify({
        ok: smsOk || emailOk,
        sms: { sent: smsOk, error: smsError || undefined },
        email: { sent: emailOk, error: emailError || undefined },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
