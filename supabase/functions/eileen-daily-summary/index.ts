// ============================================================================
// Aari Transactions · eileen-daily-summary
// ============================================================================
// Sends Marlenyi a daily summary email of Eileen's BD activity from bd_contacts.
//
// Trigger paths:
//   - POST /  (pg_cron net.http_post on a weekday schedule)
//   - GET  /  (manual curl test)
//
// Logic:
//   1. Query bd_contacts using service_role (bypasses RLS)
//   2. Filter to rows created OR last-touched today (America/New_York)
//   3. Compute: DMs sent, Hand Raises, Discovery, Signed
//   4. Apply targets: 15 DMs, 1 Discovery
//   5. Email via Resend to marlenyi@aarirealty.com
//
// Env (set via `supabase secrets set`):
//   SUPABASE_URL              · injected by runtime
//   SUPABASE_SERVICE_ROLE_KEY · injected by runtime
//   RESEND_API_KEY            · set manually
//
// Fallback: any thrown error sends an "Auto-pull failed today" email with the
// error message; nothing is silently swallowed.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const TO_EMAIL = "marlenyi@aarirealty.com";
const FROM_EMAIL = "onboarding@resend.dev"; // Resend sandbox; upgrade to verified domain later
const TZ = "America/New_York";

const TARGET_DMS = 15;
const TARGET_DISCOVERY = 1;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ----------------------------------------------------------------------------
// Date helpers · compute today's window in America/New_York and return UTC
// ISO strings suitable for Supabase timestamptz comparisons.
// ----------------------------------------------------------------------------
function easternTodayBounds(now: Date = new Date()): { startUtc: string; endUtc: string; label: string } {
  // Get the Y/M/D in Eastern time
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  // Compute UTC offset of Eastern time at this moment by formatting in TZ and diffing
  // Trick: construct a Date for 00:00 local in Eastern by walking back from the
  // naive UTC interpretation of Y-M-D and adjusting for the TZ offset.
  const naiveMidnightUtc = new Date(`${y}-${m}-${d}T00:00:00Z`);
  // What time does "naiveMidnightUtc" appear to be in Eastern?
  const easternRender = new Date(
    naiveMidnightUtc.toLocaleString("en-US", { timeZone: TZ }),
  );
  const offsetMs = naiveMidnightUtc.getTime() - easternRender.getTime();
  const startUtcDate = new Date(naiveMidnightUtc.getTime() + offsetMs);
  const endUtcDate = new Date(startUtcDate.getTime() + 24 * 60 * 60 * 1000);

  // Friendly label, e.g. "May 26"
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
  }).format(now);

  return {
    startUtc: startUtcDate.toISOString(),
    endUtc: endUtcDate.toISOString(),
    label,
  };
}

// ----------------------------------------------------------------------------
// Resend send · plain text + html. Throws on non-2xx.
// ----------------------------------------------------------------------------
async function sendEmail(args: { subject: string; text: string; html: string }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set in Edge Function secrets");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const { startUtc, endUtc, label } = easternTodayBounds();

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pull contacts created or last-touched today (Eastern).
    // Using .or() because we want either window match.
    const orFilter =
      `and(created_at.gte.${startUtc},created_at.lt.${endUtc}),` +
      `and(last_touch_at.gte.${startUtc},last_touch_at.lt.${endUtc})`;

    const { data, error } = await admin
      .from("bd_contacts")
      .select("id, stage, created_at, last_touch_at, dm_sent_at")
      .or(orFilter);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    const rows = data ?? [];

    // ------- Stats ----------------------------------------------------------
    const dmsSent = rows.length;
    const handRaises = rows.filter((r) => r.stage === "Hand Raise").length;
    // Discovery: include legacy "Discovery" and current "Discovery Booked"
    const discovery = rows.filter(
      (r) => r.stage === "Discovery" || r.stage === "Discovery Booked",
    ).length;
    const signed = rows.filter((r) => r.stage === "Signed").length;

    const dmShort = Math.max(0, TARGET_DMS - dmsSent);
    const dcShort = Math.max(0, TARGET_DISCOVERY - discovery);
    const dmStatus = dmShort === 0 ? "on target" : `short by ${dmShort}`;
    const dcStatus = dcShort === 0 ? "on target" : `short by ${dcShort}`;
    const dmCheck = dmShort === 0 ? "[on target]" : `[short by ${dmShort}]`;
    const dcCheck = dcShort === 0 ? "[on target]" : `[short by ${dcShort}]`;

    const anyMissed = dmShort > 0 || dcShort > 0;
    const footer = anyMissed
      ? "Flag: Targets missed today. Pattern check if this continues."
      : "On target.";

    // ------- Subject + Body -------------------------------------------------
    const subject =
      `Eileen · ${label} · ${dmsSent}/${TARGET_DMS} DMs · ` +
      `${handRaises} HR · ${discovery} DC · ${signed} signed`;

    const text = [
      `Eileen's day · ${label}`,
      ``,
      `DMs sent: ${dmsSent} of ${TARGET_DMS}  ${dmCheck}`,
      `Hand raises: ${handRaises}`,
      `Discovery booked: ${discovery} of ${TARGET_DISCOVERY}  ${dcCheck}`,
      `Signed: ${signed}`,
      ``,
      footer,
    ].join("\n");

    const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; line-height: 1.55;">
    <h2 style="margin:0 0 14px 0;">Eileen's day &middot; ${label}</h2>
    <table style="border-collapse: collapse; font-size: 15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;"><strong>DMs sent</strong></td>
        <td style="padding:4px 0;">${dmsSent} of ${TARGET_DMS} &nbsp; <em style="color:${dmShort === 0 ? "#0a7d2c" : "#b00020"};">${dmStatus}</em></td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;"><strong>Hand raises</strong></td>
        <td style="padding:4px 0;">${handRaises}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;"><strong>Discovery booked</strong></td>
        <td style="padding:4px 0;">${discovery} of ${TARGET_DISCOVERY} &nbsp; <em style="color:${dcShort === 0 ? "#0a7d2c" : "#b00020"};">${dcStatus}</em></td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;"><strong>Signed</strong></td>
        <td style="padding:4px 0;">${signed}</td>
      </tr>
    </table>
    <p style="margin-top:18px; font-size:14px; color:${anyMissed ? "#b00020" : "#0a7d2c"};">
      ${footer}
    </p>
  </body>
</html>`;

    await sendEmail({ subject, text, html });

    return jsonResponse(200, {
      ok: true,
      contactsFound: dmsSent,
      stats: { dmsSent, handRaises, discovery, signed },
      window: { startUtc, endUtc, label },
      emailSent: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Fallback email so failures aren't silent
    try {
      await sendEmail({
        subject: `Eileen · ${label} · Auto-pull failed today`,
        text:
          `Eileen daily summary failed.\n\n` +
          `Date: ${label}\n` +
          `Error: ${message}\n\n` +
          `Check Supabase Edge Function logs: ` +
          `supabase functions logs eileen-daily-summary`,
        html:
          `<p><strong>Eileen daily summary failed.</strong></p>` +
          `<p>Date: ${label}</p>` +
          `<p>Error: <code>${escapeHtml(message)}</code></p>` +
          `<p>Check Supabase Edge Function logs:<br>` +
          `<code>supabase functions logs eileen-daily-summary</code></p>`,
      });
    } catch (_fallbackErr) {
      // If Resend itself is down, surface in the HTTP response below
    }

    return jsonResponse(500, {
      ok: false,
      contactsFound: 0,
      emailSent: false,
      error: message,
    });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
