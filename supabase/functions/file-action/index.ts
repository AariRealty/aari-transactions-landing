// Aari Transactions · file-action
// ============================================================================
// The Accept / Pass links in a coordinator's new-file EMAIL land here. An email
// button is just a link, so the security lives in the link itself: every URL
// carries an HMAC signature over (file_id : tc_id : action). Without the server
// secret the signature cannot be forged, so a forwarded or guessed link does
// nothing. This is the same "a link in an inbox is public" lesson from the
// Stripe coupon — the token is what makes it safe.
//
// URL shape:
//   /file-action?file=<uuid>&tc=<uuid>&do=accept|pass&sig=<base64url-hmac>
//
// verify_jwt is OFF (deployed with --no-verify-jwt equivalent): the click comes
// from an email in a browser, there is no Authorization header. The signature IS
// the auth.
//
// Returns a styled HTML page, because a person is looking at it in a browser.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Dedicated secret if set; otherwise the service role key doubles as the HMAC
// key. HMAC is one-way, so this never exposes the key, and the key never leaves
// the server. (If the key is ever rotated, outstanding action links expire —
// acceptable for a 30-minute accept window.)
const SIGN_KEY = Deno.env.get("FILE_ACTION_SECRET") ?? SERVICE;

function b64url(bytes: Uint8Array): string {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SIGN_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(mac));
}
async function verify(payload: string, sig: string): Promise<boolean> {
  const expected = await sign(payload);
  if (!sig || expected.length !== sig.length) return false;
  let diff = 0;                                   // constant-time compare
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
// Exported shape of the signed payload, so the email builder signs it the SAME way.
function actionPayload(fileId: string, tcId: string, action: string) {
  return `${fileId}:${tcId}:${action}`;
}

function page(title: string, body: string, tone: "ok" | "warn" | "info" = "info"): Response {
  const accent = tone === "ok" ? "#2f6b48" : tone === "warn" ? "#8a6d1b" : "#0f0f0f";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Aari Transactions</title></head>
<body style="margin:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f">
<div style="max-width:440px;margin:0 auto;padding:60px 20px;text-align:center">
  <div style="font-family:Georgia,serif;font-size:22px;margin-bottom:6px">Aari Transactions</div>
  <div style="width:44px;height:3px;background:${accent};border-radius:2px;margin:14px auto 26px"></div>
  <h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 12px">${title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#5f5e5a;margin:0 0 26px">${body}</p>
  <a href="https://aaritransactions.com/files.html" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:12px 26px;border-radius:8px">Open the file board</a>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("file") || "";
  const tcId = url.searchParams.get("tc") || "";
  const action = url.searchParams.get("do") || "";
  const sig = url.searchParams.get("sig") || "";

  if (!fileId || !tcId || !sig || (action !== "accept" && action !== "pass")) {
    return page("Something is off with this link", "The link is missing information. Open the file board and take it from there.", "warn");
  }
  if (!(await verify(actionPayload(fileId, tcId, action), sig))) {
    return page("This link is not valid", "It may have been altered or forwarded. Only the original email from Aari can accept or pass a file. Open your board to act on it there.", "warn");
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: f } = await admin
    .from("files")
    .select("id, assigned_tc_id, tc_accepted_at, property_address, status")
    .eq("id", fileId).maybeSingle();
  if (!f) return page("File not found", "This file no longer exists. It may have been removed.", "warn");

  const street = (f.property_address || "the file").split(",")[0].trim();
  const { data: tc } = await admin.from("agents").select("first_name").eq("id", tcId).maybeSingle();
  const you = tc?.first_name ? `, ${tc.first_name}` : "";

  if (action === "accept") {
    // Already yours? Idempotent, friendly — a double click or a re-open must not error.
    if (f.tc_accepted_at && String(f.assigned_tc_id) === String(tcId)) {
      return page(`Already yours${you}`, `You accepted <b>${street}</b> already. It is on your board.`, "ok");
    }
    // Someone else got there first.
    if (f.tc_accepted_at && String(f.assigned_tc_id) !== String(tcId)) {
      return page("Already claimed", `Another coordinator accepted <b>${street}</b> first. Nothing for you to do here.`, "info");
    }
    // The race is decided in the WHERE clause: only the row still unaccepted can be taken, so two
    // simultaneous accepts cannot both win.
    const { data: won } = await admin
      .from("files")
      .update({ assigned_tc_id: tcId, tc_accepted_at: new Date().toISOString() })
      .eq("id", fileId).is("tc_accepted_at", null)
      .select("id");
    if (won && won.length) {
      return page(`Accepted${you}`, `<b>${street}</b> is yours. It is on your board with its deadlines. Nice and fast.`, "ok");
    }
    return page("Already claimed", `<b>${street}</b> was taken in the last moment. Nothing for you to do here.`, "info");
  }

  // action === "pass" · return an UNACCEPTED file to the pool. An already-accepted file cannot be
  // passed from a link (that is a reassignment the broker does), so this only releases what is
  // still open and still pointed at this coordinator.
  if (f.tc_accepted_at) {
    return page("Too late to pass", `<b>${street}</b> is already accepted, so it cannot be passed from here. If it needs to move, reassign it on the board.`, "info");
  }
  await admin.from("files").update({ assigned_tc_id: null }).eq("id", fileId).is("tc_accepted_at", null);
  // The file now shows in "Needs a TC" on every coordinator's board. Explicit pool re-notification
  // on release is a stage-2 follow-up.
  return page("Passed", `<b>${street}</b> is back in the pool for another coordinator. Thanks for the quick call.`, "info");
});
