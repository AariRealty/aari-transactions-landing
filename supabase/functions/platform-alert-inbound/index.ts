// Edge function: platform-alert-inbound (September 2026)
// ============================================================================
// Receives inbound-email webhooks (Resend Inbound today; the payload shape is
// generic enough to also fit Cloudflare Email Routing / SendGrid Inbound Parse
// with a thin adapter) and turns Marlenyi's reply-to-an-alert into a one-tap
// execution of the underlying action.
//
// TOKEN LIVES IN THE TO ADDRESS. platform-alert sets Reply-To to
//   alert+<uuid>@aaritransactions.com
// so any reply lands here with that address in `to`. We extract the uuid
// (between the plus sign and the @), look it up in platform_alert_actions, and
// dispatch the same server-side op the button flow uses. Which action the
// reply triggers depends on which token platform-alert embedded: co_invoice
// REVIEW alerts embed the approve token (reply = "yes, both are legit"); every
// other alert embeds the mute token (reply = "quiet please").
//
// SECURITY. Auth flows from three checks, in order of importance:
//   1. Envelope address contains a random uuid the recipient never types by
//      hand — the reply address is the credential.
//   2. From address must match ALERT_TO (currently marlenyi@aarirealty.com).
//      A stranger receiving a forwarded alert email and replying doesn't act.
//   3. Action rows have executed_at + 30-day expires_at (same guards the
//      button flow uses), so replays and stale forwards are refused.
//
// AUTO-REPLIES. Vacation responders and delivery-status notifications trip
// naive "any reply is action" logic; we skip anything with an Auto-Submitted
// header, or a From matching common bounce/no-reply patterns, and log it.
//
// verify_jwt=false — this is a public webhook. Auth is the token in the To.
// ============================================================================

import { createClient } from "supabase";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALERT_TO = (Deno.env.get("ALERT_TO") ?? "marlenyi@aarirealty.com").toLowerCase();

// Optional shared secret. When set, Resend must include ?s=<secret> on the
// webhook URL — configured in the Resend Inbound dashboard. Keeps random
// posters off the endpoint even if they somehow reach the URL.
const INBOUND_SECRET = Deno.env.get("PLATFORM_ALERT_INBOUND_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  if (INBOUND_SECRET) {
    const url = new URL(req.url);
    if (url.searchParams.get("s") !== INBOUND_SECRET) {
      return json({ ok: false, error: "bad_secret" }, 401);
    }
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  // Support Resend Inbound envelope shape + a couple of common alternates.
  const from = pickString(
    payload?.from,
    payload?.envelope?.from,
    payload?.data?.from,
    payload?.headers?.from,
  );
  const to = pickArrayOfStrings(
    payload?.to,
    payload?.envelope?.to,
    payload?.data?.to,
  );
  const headers = (payload?.headers ?? payload?.data?.headers ?? {}) as Record<string, string>;
  const subject = pickString(payload?.subject, payload?.data?.subject) ?? "";

  // Auto-reply / bounce guard.
  const autoSubmitted = String(headers["auto-submitted"] || headers["Auto-Submitted"] || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return json({ ok: true, skipped: "auto_submitted", subject });
  }
  const fromAddr = extractEmail(from ?? "").toLowerCase();
  if (/mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce/.test(fromAddr)) {
    return json({ ok: true, skipped: "bounce_or_noreply", from: fromAddr });
  }

  // From must match the broker to avoid a forwarded alert getting acted on by
  // a downstream recipient.
  if (fromAddr && fromAddr !== ALERT_TO) {
    return json({ ok: true, skipped: "wrong_sender", from: fromAddr, expected: ALERT_TO });
  }

  // Find the alert+<uuid> token in any of the To addresses.
  const token = firstTokenFromTo(to);
  if (!token) return json({ ok: true, skipped: "no_token_in_to", to });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: action } = await admin
    .from("platform_alert_actions")
    .select("token, op, params, expires_at, executed_at")
    .eq("token", token)
    .maybeSingle();
  if (!action) return json({ ok: true, skipped: "action_not_found", token });
  if (action.executed_at) return json({ ok: true, skipped: "already_executed", token, executed_at: action.executed_at });
  if (new Date(action.expires_at).getTime() < Date.now()) return json({ ok: true, skipped: "expired", token });

  const params = (action.params || {}) as Record<string, any>;

  if (action.op === "mute") {
    const addressKey = String(params.address_key || "").trim();
    if (!addressKey) return json({ ok: false, error: "no_address_key" }, 400);
    const kind = params.kind ? String(params.kind) : null;
    const { error: mErr } = await admin.rpc("platform_alert_mutes_upsert", { p_address_key: addressKey, p_kind: kind, p_by: null });
    if (mErr) return json({ ok: false, error: mErr.message }, 500);
    await admin.from("platform_alert_actions").update({ executed_at: new Date().toISOString() }).eq("token", token);
    return json({ ok: true, executed: "mute", address_key: addressKey, kind });
  }

  if (action.op === "approve_coinvoice") {
    const fileIds: string[] = Array.isArray(params.file_ids) ? params.file_ids.filter(Boolean) : [];
    if (!fileIds.length) return json({ ok: false, error: "no_file_ids" }, 400);
    const note = `Approved via email reply by broker · ${new Date().toISOString()} · subject: ${subject}`;
    const { error: uErr } = await admin.rpc("platform_alert_mark_coinvoice_approved", { p_file_ids: fileIds, p_note: note });
    if (uErr) return json({ ok: false, error: uErr.message }, 500);
    await admin.from("platform_alert_actions").update({ executed_at: new Date().toISOString() }).eq("token", token);
    return json({ ok: true, executed: "approve_coinvoice", file_ids: fileIds });
  }

  return json({ ok: false, error: "unknown_op", op: action.op }, 400);
});

// ---- helpers --------------------------------------------------------------

// Match "alert+<uuid>@..." in any of the To addresses.
function firstTokenFromTo(to: string[]): string | null {
  const rx = /alert\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
  for (const t of to) {
    const m = rx.exec(String(t || ""));
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Accept plain "user@host" or "Name <user@host>" and return the address.
function extractEmail(s: string): string {
  const m = /<([^>]+)>/.exec(s);
  if (m) return m[1].trim();
  return String(s || "").trim();
}

function pickString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v) return v;
    if (Array.isArray(v) && v.length && typeof v[0] === "string") return v[0];
  }
  return undefined;
}

function pickArrayOfStrings(...vals: any[]): string[] {
  for (const v of vals) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
    if (typeof v === "string" && v) return [v];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      // Some providers send [{address:"..."}]
      const out = v.map((x: any) => (typeof x?.address === "string" ? x.address : "")).filter(Boolean);
      if (out.length) return out;
    }
  }
  return [];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
