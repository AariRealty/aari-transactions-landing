// Aari Transactions · Shared · Client email review-hold gate
// ============================================================================
// Marlenyi 2026-08-08 · beta gate for auto-fire client emails. If the target
// agent is listed in public.client_email_review_holds, swap the recipient to
// the redirect address (marlenyi@aarirealty.com in prod) so Marlenyi can
// review each auto-email before it goes live to the client.
//
// This is a redirect, not a copy · the client does not receive anything until
// Marlenyi removes their hold row.
//
// Manual sends (broadcast, reply, welcome) are NOT gated · a human is already
// in the loop.
// ============================================================================

import { supabaseAdmin } from "./supabase.ts";

export interface EmailRedirect {
  redirectTo: string;
  originalTo: string;
  originalAgentName: string;
  reason: string | null;
}

/**
 * Look up whether the target agent (by id OR email) has an active review-hold.
 * Returns null on no-hold; caller should send to the original recipient.
 */
export async function resolveClientEmailRedirect(
  target: { agentId?: string | null; email?: string | null },
): Promise<EmailRedirect | null> {
  const { agentId, email } = target;
  if (!agentId && !email) return null;

  // Resolve to the agents row so we have id + email + first_name in one shot,
  // then look for a hold. Two round-trips is fine here · this runs before the
  // Resend call so a few extra ms doesn't matter.
  let query = supabaseAdmin
    .from("agents")
    .select("id, first_name, last_name, email")
    .limit(1);
  if (agentId) query = query.eq("id", agentId);
  else if (email) query = query.ilike("email", email);
  const { data: agent } = await query.maybeSingle();
  if (!agent) return null;

  const { data: hold } = await supabaseAdmin
    .from("client_email_review_holds")
    .select("redirect_to, reason")
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (!hold) return null;

  const name = [agent.first_name, agent.last_name].filter(Boolean).join(" ").trim() || agent.email || "this client";
  return {
    redirectTo: hold.redirect_to,
    originalTo: agent.email || "unknown",
    originalAgentName: name,
    reason: hold.reason,
  };
}

/** Prefix an email subject to make the review context obvious in the inbox. */
export function reviewSubjectPrefix(redirect: EmailRedirect, subject: string): string {
  return `[REVIEW · would send to ${redirect.originalAgentName}] ${subject}`;
}

/** Standardized banner injected at the top of the HTML body when a hold applies. */
export function reviewBannerHtml(redirect: EmailRedirect): string {
  const reason = redirect.reason ? String(redirect.reason).replace(/</g, "&lt;") : "Beta review · client hold active.";
  return (
    `<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:0 0 20px 0'>` +
    `<tr><td style='background:#fff3cd;border-left:3px solid #a3402f;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f0f0f;line-height:1.5'>` +
      `<b>Marlenyi · this is the client copy, held for review.</b><br>` +
      `Intended for <b>${escapeHtml(redirect.originalAgentName)}</b> (${escapeHtml(redirect.originalTo)}). ` +
      `${escapeHtml(reason)}` +
    `</td></tr></table>`
  );
}

/** Standardized plaintext banner for the text/plain fallback body. */
export function reviewBannerText(redirect: EmailRedirect): string {
  return (
    `--- REVIEW COPY · would send to ${redirect.originalAgentName} <${redirect.originalTo}> ---\n` +
    `${redirect.reason ?? "Beta review · client hold active."}\n\n`
  );
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
