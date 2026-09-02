// Edge function: platform-alert-action (September 2026)
// ============================================================================
// Consumes the short-lived action tokens embedded in platform-alert emails.
// One tap in the inbox lets Marlenyi:
//   op=mute                → stop future alerts for an address (+ optional kind)
//   op=approve_coinvoice   → mark both files' raw_form_data.co_invoice_approved
//                             so future co_invoice alerts render as PLATFORM FYI
//                             instead of PLATFORM REVIEW
//
// verify_jwt=false so the button works from Gmail without a login. Security is
// carried by the token itself — it's a random uuid that only lives inside her
// email; the server executes exactly once and refuses replays via executed_at.
// Tokens expire after 30 days, so a leaked archived email can't be used forever.

import { createClient } from "supabase";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) return page(400, "Missing token.", "That link doesn't have an action token — it may have been truncated by your mail client. Open the original email and tap the button again.");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: action, error } = await admin
    .from("platform_alert_actions")
    .select("token, op, params, expires_at, executed_at")
    .eq("token", token)
    .maybeSingle();
  if (error) return page(500, "Something went wrong.", error.message);
  if (!action) return page(404, "Action not found.", "This link isn't recognized. It may already have been used, or the alert email may have been redelivered with a fresh token — tap the button on the most recent email.");

  if (action.executed_at) {
    return page(200, "Already done.", `You already ${action.op === "mute" ? "muted this address" : "approved this co-invoice pair"} on ${new Date(action.executed_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET. No further action needed.`);
  }
  if (new Date(action.expires_at).getTime() < Date.now()) {
    return page(410, "Link expired.", "This mute/approve link expired after 30 days. Open a newer alert email for the same address and use the button there.");
  }

  const params = (action.params || {}) as Record<string, any>;

  if (action.op === "mute") {
    const addressKey = String(params.address_key || "").trim();
    const kind = params.kind ? String(params.kind) : null;
    if (!addressKey) return page(400, "Broken mute link.", "This mute link doesn't have an address on it. Reply to the alert and I'll investigate.");
    const { error: mErr } = await admin.rpc("platform_alert_mutes_upsert", { p_address_key: addressKey, p_kind: kind, p_by: params.by ?? null });
    if (mErr) return page(500, "Could not save the mute.", mErr.message);
    await admin.from("platform_alert_actions").update({ executed_at: new Date().toISOString() }).eq("token", token);
    const scope = kind ? `"${kind.replace(/_/g, " ")}" alerts on ${prettyAddress(addressKey)}` : `every alert on ${prettyAddress(addressKey)}`;
    return page(200, "Muted.", `Got it. ${scope} won't email you again.`);
  }

  if (action.op === "approve_coinvoice") {
    const fileIds: string[] = Array.isArray(params.file_ids) ? params.file_ids.filter(Boolean) : [];
    if (!fileIds.length) return page(400, "Broken approve link.", "This approve link doesn't reference any files. Reply to the alert and I'll investigate.");
    const note = String(params.note || `Approved via alert-email button on ${new Date().toISOString()}`);
    const { error: uErr } = await admin.rpc("platform_alert_mark_coinvoice_approved", { p_file_ids: fileIds, p_note: note });
    if (uErr) return page(500, "Could not save approval.", uErr.message);
    await admin.from("platform_alert_actions").update({ executed_at: new Date().toISOString() }).eq("token", token);
    return page(200, "Approved.", `This co-invoice pair is now on the approved list. Future submissions for these files will come through as "PLATFORM · FYI", not "PLATFORM · REVIEW".`);
  }

  return page(400, "Unknown action.", `The action "${action.op}" is not recognized by this server.`);
});

function prettyAddress(k: string): string {
  return k.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f7f3e9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><table role="presentation" width="100%" style="background:#f7f3e9"><tr><td align="center" style="padding:48px 16px"><table role="presentation" width="480" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;padding:36px 32px"><tr><td><h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:28px;margin:0 0 14px;color:#0f0f0f">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.6;color:#0f0f0f;margin:0">${escapeHtml(body)}</p><div style="margin-top:26px"><a href="https://aaritransactions.com/files.html" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:600">Open the cockpit</a></div></td></tr></table></td></tr></table></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
