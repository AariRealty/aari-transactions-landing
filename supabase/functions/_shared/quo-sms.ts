// ============================================================================
// Aari Transactions · Quo (formerly OpenPhone) SMS helper
// ============================================================================
// Thin wrapper around the Quo API for sending transactional SMS to agents.
//
// Endpoint:  POST https://api.openphone.com/v1/messages
// Auth:      raw API key in the Authorization header (no "Bearer" prefix)
// Pricing:   $0.01 per segment US/CA · GSM-7 = 160 chars/segment
//
// Secrets read from Supabase env:
//   QUO_API_KEY        · the API key (64-char hex)
//   QUO_FROM_NUMBER    · the Aari Realty business line in E.164 (e.g. +12396881770)
//
// Public API:
//   sendQuoSms({ to, body, sourceContext }) → { ok, messageId?, error? }
//
// Behavior:
//   - Returns { ok: true, messageId } on 202 from Quo
//   - Returns { ok: false, error } on any non-success status · never throws
//   - Logs the attempt to sms_log table (best-effort, also non-throwing)
//   - Strips/normalizes the `to` phone number to E.164 if it isn't already
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const QUO_API_BASE = "https://api.openphone.com/v1";

export interface QuoSmsResult {
  ok: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}

export interface QuoSmsParams {
  to: string;                      // E.164 or raw 10-digit US (will be normalized)
  body: string;                    // 1-1600 chars
  from?: string;                   // optional · E.164 sender · defaults to QUO_FROM_NUMBER
  sourceContext?: Record<string, unknown>; // saved in sms_log.metadata
}

export async function sendQuoSms(params: QuoSmsParams): Promise<QuoSmsResult> {
  const apiKey = Deno.env.get("QUO_API_KEY");
  const fromNumber = params.from || Deno.env.get("QUO_FROM_NUMBER");

  if (!apiKey) return logAndReturn({ ok: false, error: "QUO_API_KEY not set" }, params);
  if (!fromNumber) return logAndReturn({ ok: false, error: "QUO_FROM_NUMBER not set (and no from override)" }, params);

  const toE164 = normalizeToE164(params.to);
  if (!toE164) return logAndReturn({ ok: false, error: "Invalid recipient phone number" }, params);

  if (!params.body || params.body.length < 1 || params.body.length > 1600) {
    return logAndReturn({ ok: false, error: "SMS body must be 1-1600 chars" }, params);
  }

  let resp: Response;
  try {
    resp = await fetch(`${QUO_API_BASE}/messages`, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: params.body,
        from: fromNumber,
        to: [toE164],
        setInboxStatus: "done",  // auto-close in the Quo inbox · this is outbound automation
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return logAndReturn({ ok: false, error: "Network error: " + msg }, params, toE164);
  }

  if (resp.status === 202) {
    let body: { data?: { id?: string; status?: string } } = {};
    try { body = await resp.json(); } catch { /* ignore parse failure */ }
    return logAndReturn({
      ok: true,
      messageId: body.data?.id,
      status: body.data?.status,
    }, params, toE164);
  }

  // Non-success · capture error body for the log
  let errText = "";
  try { errText = await resp.text(); } catch { /* ignore */ }
  return logAndReturn({
    ok: false,
    error: `Quo returned ${resp.status}: ${errText.slice(0, 300)}`,
  }, params, toE164);
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeToE164(raw: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  // Already E.164
  if (/^\+[1-9]\d{1,14}$/.test(trimmed)) return trimmed;
  // Strip everything non-digit, assume US 10-digit
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}

async function logAndReturn(
  result: QuoSmsResult,
  params: QuoSmsParams,
  normalizedTo?: string,
): Promise<QuoSmsResult> {
  // Best-effort log to sms_log · failures here don't break the SMS result.
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return result;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("sms_log").insert({
      provider: "quo",
      to_phone: normalizedTo ?? params.to,
      body: params.body,
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.messageId ?? null,
      error: result.error ?? null,
      metadata: params.sourceContext ?? {},
    });
  } catch (_) {
    // Never let logging failures cascade
  }
  return result;
}
