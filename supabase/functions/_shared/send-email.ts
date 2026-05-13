// Aari Transactions · Shared · Centralized send + log helper
// Every email goes through this function. Single point of:
//   - opt-out check (email_preferences)
//   - render template
//   - call Resend
//   - write email_log row
//   - return result

import { render } from "@react-email/render";
import { resend, FROM, REPLY_TO } from "./resend.ts";
import { supabaseAdmin } from "./supabase.ts";

export type EmailCategory = "transactional" | "marketing" | "review_requests";

export interface SendEmailArgs {
  to: string;
  toUserId?: string | null;
  relatedFileId?: string | null;
  category: EmailCategory;
  subject: string;
  templateName: string;
  // deno-lint-ignore no-explicit-any
  reactElement: any;
  payload?: Record<string, unknown>;
}

export interface SendEmailResult {
  sent: boolean;
  resendId?: string;
  reason?: string;
  logId?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const { to, toUserId, relatedFileId, category, subject, templateName, reactElement, payload } = args;

  // ---- 1. Opt-out check (skipped for transactional) ----
  if (category !== "transactional" && toUserId) {
    const { data: prefs } = await supabaseAdmin
      .from("email_preferences")
      .select("transactional, marketing, review_requests, unsubscribed_at")
      .eq("user_id", toUserId)
      .maybeSingle();

    if (prefs?.unsubscribed_at) {
      await logSuppressed(args, "user_unsubscribed");
      return { sent: false, reason: "user_unsubscribed" };
    }
    if (category === "marketing" && prefs && prefs.marketing === false) {
      await logSuppressed(args, "marketing_opt_out");
      return { sent: false, reason: "marketing_opt_out" };
    }
    if (category === "review_requests" && prefs && prefs.review_requests === false) {
      await logSuppressed(args, "review_opt_out");
      return { sent: false, reason: "review_opt_out" };
    }
  }

  // ---- 2. Render HTML + text from React Email component ----
  const html = await render(reactElement);
  const text = await render(reactElement, { plainText: true });

  // ---- 3. Insert email_log row (status='queued') ----
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from("email_log")
    .insert({
      email_type: templateName,
      to_address: to,
      to_user_id: toUserId ?? null,
      related_file_id: relatedFileId ?? null,
      status: "queued",
      subject,
      template: templateName,
      payload: payload ?? {},
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[send-email] failed to insert email_log:", logErr);
  }

  // ---- 4. Call Resend ----
  try {
    const result = await resend.emails.send({
      from: FROM,
      to: [to],
      replyTo: REPLY_TO,
      subject,
      html,
      text,
      tags: [
        { name: "template", value: templateName },
        { name: "category", value: category },
      ],
    });

    if (result.error) {
      await markFailed(logRow?.id, String(result.error));
      return { sent: false, reason: String(result.error), logId: logRow?.id };
    }

    await markSent(logRow?.id, result.data?.id);
    return { sent: true, resendId: result.data?.id, logId: logRow?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(logRow?.id, msg);
    return { sent: false, reason: msg, logId: logRow?.id };
  }
}

async function logSuppressed(args: SendEmailArgs, reason: string) {
  await supabaseAdmin.from("email_log").insert({
    email_type: args.templateName,
    to_address: args.to,
    to_user_id: args.toUserId ?? null,
    related_file_id: args.relatedFileId ?? null,
    status: "suppressed",
    subject: args.subject,
    template: args.templateName,
    payload: args.payload ?? {},
    error_message: reason,
  });
}

async function markSent(logId: string | undefined, resendId: string | undefined) {
  if (!logId) return;
  await supabaseAdmin
    .from("email_log")
    .update({ status: "sent", resend_id: resendId, sent_at: new Date().toISOString() })
    .eq("id", logId);
}

async function markFailed(logId: string | undefined, error: string) {
  if (!logId) return;
  await supabaseAdmin
    .from("email_log")
    .update({ status: "failed", error_message: error })
    .eq("id", logId);
}
