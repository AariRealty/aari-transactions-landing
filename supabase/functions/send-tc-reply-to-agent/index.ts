// ============================================================================
// send-tc-reply-to-agent · Edge Function
// ============================================================================
// Triggered when a TC replies to an agent message from the files.html panel.
//
// 1. Verify caller is a TC assigned to the file
// 2. Insert reply row in file_messages (sender_role='tc')
// 3. Stamp replied_at on the original message · closes the SLA timer
// 4. SMS the agent (Twilio)
// 5. Email the agent (Resend)
//
// Body: { original_message_id, reply }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveClientEmailRedirect, reviewSubjectPrefix, reviewBannerHtml } from "../_shared/client-email-hold.ts";

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: actor } = await admin.from("agents").select("role, first_name, last_name").eq("id", user.id).single();
    if (!actor || (actor.role !== "tc" && actor.role !== "broker")) {
      return json({ error: "TC or broker only" }, 403);
    }

    const { original_message_id, reply } = await req.json();
    if (!original_message_id || !reply) return json({ error: "Missing original_message_id or reply" }, 400);

    const { data: orig } = await admin.from("file_messages")
      .select("id, file_id, sender_id, message, sent_at, replied_at")
      .eq("id", original_message_id).single();
    if (!orig) return json({ error: "Original message not found" }, 404);

    const { data: file } = await admin.from("files")
      .select("id, agent_id, assigned_tc_id, property_address").eq("id", orig.file_id).single();
    if (!file) return json({ error: "File not found" }, 404);

    // Authorization: TC must be assigned, OR broker
    if (actor.role === "tc" && file.assigned_tc_id !== user.id) {
      return json({ error: "Not your file" }, 403);
    }

    // Insert reply
    const { data: replyRow, error: insertErr } = await admin.from("file_messages").insert({
      file_id: file.id,
      sender_id: user.id,
      sender_role: actor.role, // 'tc' or 'broker'
      recipient_role: "agent",
      message: reply,
      parent_message_id: original_message_id,
      sent_at: new Date().toISOString(),
    }).select("id").single();
    if (insertErr) return json({ error: "Reply insert failed: " + insertErr.message }, 500);

    // Stamp replied_at on the original · this closes the SLA timer + clears
    // the message from broker + TC pending panels + the bell.
    await admin.from("file_messages").update({ replied_at: new Date().toISOString() }).eq("id", original_message_id);

    // Pull agent contact info
    const { data: agent } = await admin.from("agents")
      .select("first_name, last_name, email, phone").eq("id", file.agent_id).single();
    const tcName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || "your TC";
    const agentFirst = agent?.first_name || "";
    const addr = file.property_address || "your file";
    const portalLink = `https://aaritransactions.com/portal.html#file-${file.id}`;

    // Client-email review-hold gate · beta redirect for Samantha etc.
    // On hold, SMS is skipped entirely (no Marlenyi-facing SMS path yet); the
    // email below is redirected to Marlenyi's inbox with a banner + prefix.
    const holdRedirect = await resolveClientEmailRedirect({ agentId: file.agent_id, email: agent?.email ?? null });

    // SMS
    let smsOk = false;
    if (!holdRedirect && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && agent?.phone) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: TWILIO_FROM, To: agent.phone,
            Body: `Aari · ${tcName} replied on ${addr}:\n\n"${reply.slice(0, 220)}${reply.length > 220 ? "…" : ""}"\n\nFull thread: ${portalLink}`,
          }).toString(),
        });
        smsOk = r.ok;
      } catch (_) {}
    }

    // Email
    let emailOk = false;
    if (RESEND_API_KEY && agent?.email) {
      const emailTo = holdRedirect ? holdRedirect.redirectTo : agent.email;
      const emailSubject = holdRedirect
        ? reviewSubjectPrefix(holdRedirect, `${tcName} replied · ${addr}`)
        : `${tcName} replied · ${addr}`;
      try {
        const html = `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f0f0f">
            <div style="border-bottom:1px solid #e6e2d8;padding-bottom:14px;margin-bottom:18px">
              <div style="font-size:11px;color:#2f855a;letter-spacing:.5px;text-transform:uppercase;font-weight:600">TC reply</div>
              <div style="font-size:18px;font-weight:500;margin-top:4px">${esc(tcName)} · ${esc(addr)}</div>
            </div>
            <p style="font-size:13px;color:#5f5e5a;margin:0 0 8px">${agentFirst ? "Hi " + esc(agentFirst) + "," : "Hi,"}</p>
            <p style="font-size:13px;color:#5f5e5a;margin:0 0 6px"><strong style="color:#0f0f0f">Your message:</strong></p>
            <div style="background:#fafaf9;padding:12px 14px;border-radius:6px;font-size:13px;color:#5f5e5a;font-style:italic;margin:0 0 14px;white-space:pre-wrap">${esc(orig.message)}</div>
            <p style="font-size:13px;color:#5f5e5a;margin:0 0 6px"><strong style="color:#0f0f0f">${esc(tcName)}'s reply:</strong></p>
            <div style="background:#fff;border:1px solid #e6e2d8;padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin:0 0 18px">${esc(reply)}</div>
            <a href="${portalLink}" style="display:inline-block;background:#0f0f0f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open the file →</a>
          </div>
        `;
        const bodyHtml = holdRedirect ? reviewBannerHtml(holdRedirect) + html : html;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL, to: [emailTo],
            // Route the agent's Reply to the TC who actually replied, not the
            // unmonitored noreply@ sender. Without this, an agent hitting Reply
            // dead-ended into a black hole.
            ...(user.email ? { reply_to: user.email } : {}),
            subject: emailSubject,
            html: bodyHtml,
          }),
        });
        emailOk = r.ok;
      } catch (_) {}
    }

    // Audit log
    await admin.from("audit_log").insert({
      actor_id: user.id, actor_type: actor.role, action: "tc_replied_to_agent",
      target_table: "file_messages", target_id: original_message_id,
      details: { file_id: file.id, reply_id: replyRow.id, sms: smsOk, email: emailOk },
    });

    return json({ ok: true, reply_id: replyRow.id, sms: smsOk, email: emailOk });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
