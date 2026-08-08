// ============================================================================
// Aari Transactions · send-agent-review (Email System v2 · Section 12 · Fix 4+5)
// ============================================================================
// Day 3 post-closing review auto-sends, measured from the TC-logged
// actual_closing_date (fallback: the automatic closed_at move timestamp):
//
//   Fix 4 · agent review        → email the agent, standalone, NO CC
//   Fix 5 · title+lender review → email title + lender, agent CC'd
//
// Both fire once each, in the Day 3 window (72h–240h from the base date), with
// their own dedup stamps so every extra cron invocation is a no-op:
//   files.agent_review_sent_at
//   files.title_lender_review_sent_at
//
// Sender: From = assigned TC's name on the verified domain, Reply-To = TC email
// (mirrors closed-payment-reminder). The Aari Google review link comes from the
// org_settings.google_review_link_aari (single global value, set in the cockpit),
// falling back to the GOOGLE_REVIEW_LINK_AARI secret, then a placeholder.
//
// STAGED (Dec 2026): deploy via `supabase functions deploy send-agent-review`
// after running 20260628_actual_closing_date_review.sql.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { resend, FROM } from "../_shared/resend.ts";
import { resolveClientEmailRedirect, reviewSubjectPrefix, reviewBannerHtml, reviewBannerText } from "../_shared/client-email-hold.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_ADDR = (FROM.match(/<([^>]+)>/) || [])[1] ?? "hello@aaritransactions.com";
const REVIEW_LINK_ENV = Deno.env.get("GOOGLE_REVIEW_LINK_AARI") ?? "";

const HOUR = 60 * 60 * 1000;
// Day 3 window with a Day 10 cap so a backlog of older closed files does not
// back-blast review requests on first deploy.
const WIN_LO = 72;   // Day 3
const WIN_HI = 240;  // Day 10

// Eastern time-of-day greeting — mirrors getTimeOfDayGreeting in files.html
// (night fallback is "Good evening" per the Section 3 ruling).
function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

function htmlWrap(text: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;color:#2c2c2a;max-width:520px;margin:0 auto;white-space:pre-line">${text.replace(/\*([^*]+)\*/g, "<strong>$1</strong>")}</div>`;
}

// Contact resolution mirrors files.html: TC-confirmed logistics.contacts first,
// then the raw intake form fields, matching the same fallback chain.
function contact(f: Record<string, unknown>, key: string, field: string): string {
  const lg = (f.logistics as Record<string, unknown>) || {};
  const cc = (lg.contacts as Record<string, Record<string, string>>) || {};
  if (cc[key] && cc[key][field]) return cc[key][field];
  const raw = (f.raw_form_data as Record<string, string>) || {};
  if (key === "title") {
    if (field === "email") return raw.title_email || raw.pa_title_contact_email || "";
    if (field === "name") return raw.title_name || raw.pa_title_contact_name || "";
  }
  if (key === "lender") {
    if (field === "email") return raw.lender_email || raw.pa_lender_contact_email || "";
    if (field === "name") return raw.lender_name || raw.pa_lender_contact_name || "";
  }
  return "";
}
const firstName = (full: string) => (full || "").trim().split(" ")[0] || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Aari review link · single global value from org_settings (one source of truth,
  // matches the cockpit). Falls back to the GOOGLE_REVIEW_LINK_AARI env secret,
  // then a visible placeholder if neither is set yet.
  let orgReviewLink = "";
  try {
    const { data: os } = await supabase.from("org_settings").select("google_review_link_aari").eq("id", 1).maybeSingle();
    orgReviewLink = String(os?.google_review_link_aari ?? "").trim();
  } catch (_) { /* fall through to env */ }
  const reviewLink = orgReviewLink || REVIEW_LINK_ENV || "[Aari Google review link]";

  const { data: files, error } = await supabase
    .from("files")
    .select("id, agent_id, assigned_tc_id, property_address, closed_at, actual_closing_date, logistics, raw_form_data, agent_review_sent_at, title_lender_review_sent_at")
    .eq("status", "closed")
    .not("closed_at", "is", null)
    .or("agent_review_sent_at.is.null,title_lender_review_sent_at.is.null")
    .limit(200);

  if (error) {
    console.error("[send-agent-review] query failed", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  let sent = 0;
  for (const f of files ?? []) {
    // Base date: TC-logged actual closing date is the source of truth, the
    // automatic move timestamp (closed_at) is the fallback only.
    const baseMs = f.actual_closing_date
      ? new Date(`${f.actual_closing_date}T12:00:00-05:00`).getTime()
      : new Date(f.closed_at as string).getTime();
    const hrs = (Date.now() - baseMs) / HOUR;
    if (hrs < WIN_LO || hrs > WIN_HI) continue;

    // Assigned TC = sender.
    let tcName = "Aari Transactions", tcEmail: string | undefined;
    if (f.assigned_tc_id) {
      const { data: tc } = await supabase.from("agents").select("first_name, last_name, email").eq("id", f.assigned_tc_id).maybeSingle();
      if (tc) { tcName = [tc.first_name, tc.last_name].filter(Boolean).join(" ").trim() || tcName; tcEmail = tc.email ?? undefined; }
    }
    const fromLine = `${tcName} <${FROM_ADDR}>`;
    const replyTo = tcEmail ?? FROM_ADDR;

    // Agent (recipient of Fix 4, CC of Fix 5).
    const { data: agent } = await supabase.from("agents").select("first_name, email").eq("id", f.agent_id).maybeSingle();
    const agentEmail = agent?.email ?? "";
    const agentFirst = agent?.first_name ?? "there";
    const street = String(f.property_address ?? "your closing").split(",")[0].trim();

    // ---- Fix 4 · agent review · standalone · no CC ----
    if (!f.agent_review_sent_at && agentEmail) {
      const text =
`Hi ${agentFirst},

Thank you for trusting me with your file.

If the experience was a good one, a Google review would mean a lot.

*It takes about two minutes: ${reviewLink}*

Thank you.`;
      // Client-email review-hold gate · beta redirect for Samantha etc.
      const agentRedirect = await resolveClientEmailRedirect({ agentId: f.agent_id, email: agentEmail });
      const agentTo = agentRedirect ? agentRedirect.redirectTo : agentEmail;
      const agentSubject = agentRedirect
        ? reviewSubjectPrefix(agentRedirect, `A quick favor · ${street}`)
        : `A quick favor · ${street}`;
      const agentText = agentRedirect ? reviewBannerText(agentRedirect) + text : text;
      const agentHtml = agentRedirect ? reviewBannerHtml(agentRedirect) + htmlWrap(text) : htmlWrap(text);
      try {
        await resend.emails.send({
          from: fromLine, to: agentTo, reply_to: replyTo,
          subject: agentSubject,
          text: agentText, html: agentHtml,
        });
        await supabase.from("files").update({ agent_review_sent_at: new Date().toISOString() }).eq("id", f.id);
        sent++;
      } catch (e) { console.warn("[send-agent-review] agent send failed for", f.id, e); }
    }

    // ---- Fix 5 · title + lender review · agent CC'd ----
    if (!f.title_lender_review_sent_at) {
      const titleEmail = contact(f as Record<string, unknown>, "title", "email");
      const lenderEmail = contact(f as Record<string, unknown>, "lender", "email");
      const titleFirst = firstName(contact(f as Record<string, unknown>, "title", "name")) || "there";
      const lenderFirst = firstName(contact(f as Record<string, unknown>, "lender", "name")) || "there";
      const to = [titleEmail, lenderEmail].filter(Boolean);
      if (to.length) {
        const text =
`${greeting()} ${titleFirst} and ${lenderFirst},

It was a pleasure working alongside you on this one.

*If Aari Transactions made your job easier we would love a Google review.*

Your words carry a lot of weight in our industry.

${reviewLink}`;
        // If the agent is on hold, strip them from CC so their address doesn't
        // leak via a message that still goes to title/lender (title/lender are
        // vendors, not clients · they still receive the ask directly).
        const ccRedirect = await resolveClientEmailRedirect({ agentId: f.agent_id, email: agentEmail });
        const ccList = ccRedirect ? undefined : (agentEmail ? [agentEmail] : undefined);
        try {
          await resend.emails.send({
            from: fromLine, to, cc: ccList, reply_to: replyTo,
            subject: `One quick favor · ${street}`,
            text, html: htmlWrap(text),
          });
          await supabase.from("files").update({ title_lender_review_sent_at: new Date().toISOString() }).eq("id", f.id);
          sent++;
        } catch (e) { console.warn("[send-agent-review] title/lender send failed for", f.id, e); }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
});
