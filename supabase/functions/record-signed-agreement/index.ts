// Edge function: record-signed-agreement (Section 6 · Task 6.2 audit fix)
// ============================================================================
// Inserts an agreement_signatures row with server-captured IP + server-side
// signed_at timestamp. Replaces the direct client-side insert in
// js/intake-submit.js that was passing ip_address: null and a browser-clock
// timestamp.
//
// Why this matters: ESIGN/UETA attribution evidence (Fla. Stat. § 668.50)
// is stronger when the signing event is timestamped + IP-stamped by the
// server, not the client. Browser clocks can be wrong or spoofed; client
// JS cannot read its own real IP.
//
// Request body (from intake-submit.js):
//   {
//     agent_id: string,
//     file_id: string,
//     agreement_type: 'service_agreement' | 'membership_agreement' | 'intake_specific',
//     agreement_version: string,
//     typed_full_name: string,
//     drawn_signature_data?: string | null,
//     signature_image_url?: string | null,
//     user_agent?: string
//   }
//
// Response:
//   { ok: true, signature_id: string, signed_at: ISO, ip_address: string|null }
// ============================================================================

import { createClient } from "supabase";

// Service-role client (inlined so this function deploys as a single self-contained
// file). Used for the ownership check + the immutable signature insert.
const _adminUrl = Deno.env.get("SUPABASE_URL");
const _adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!_adminUrl || !_adminKey) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in edge function secrets.");
}
const supabaseAdmin = createClient(_adminUrl, _adminKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // ---- 0. AUTHENTICATE THE CALLER (security fix · July 2026) ----
  // Previously this endpoint trusted body.agent_id / body.file_id with no auth,
  // so anyone could POST a forged, legally-attributed ESIGN signature row for
  // any agent/file. Now we require the caller's JWT, derive the signer identity
  // from it, and (when a file is named) verify the caller owns that file. The
  // one legitimate caller — js/intake-submit.js — runs authenticated and
  // Supabase functions.invoke forwards the user's access token automatically.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supaUrl || !anonKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }
  const authClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const authedAgentId = userData?.user?.id;
  if (userErr || !authedAgentId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // ---- 1. Capture IP from request headers (priority order) ----
  // Supabase Edge Functions sit behind a CDN. Cloudflare → cf-connecting-ip,
  // Vercel → x-forwarded-for, generic proxies → x-real-ip. Take the first
  // non-empty match. If multiple are present in x-forwarded-for, take the
  // first (leftmost = original client; rightmost = closest proxy).
  const headerIp =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("forwarded") ||
    null;
  const ipAddress = headerIp && /^[0-9a-fA-F:.]+$/.test(headerIp) ? headerIp : null;

  // ---- 2. Parse body ----
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // Identity comes from the verified JWT, NOT the request body — a caller cannot
  // attribute a signature to someone else.
  const agentId = authedAgentId;
  const fileId = body.file_id as string | undefined;
  const typedFullName = body.typed_full_name as string | undefined;
  const agreementType = (body.agreement_type as string | undefined) || "service_agreement";
  const agreementVersion = body.agreement_version as string | undefined;

  if (!typedFullName || !agreementVersion) {
    return json({ ok: false, error: "missing_required_fields" }, 400);
  }

  // If a file is named, the caller must own it (blocks attaching a signature to
  // another agent's file).
  if (fileId) {
    const { data: ownRow, error: ownErr } = await supabaseAdmin
      .from("files")
      .select("agent_id")
      .eq("id", fileId)
      .maybeSingle();
    if (ownErr || !ownRow || ownRow.agent_id !== agentId) {
      return json({ ok: false, error: "file_not_owned" }, 403);
    }
  }

  // ---- 3. Insert agreement_signatures row · server-side signed_at + IP ----
  // Note: agreement_signatures.signed_at is expected to default to now() per
  // schema. If your schema doesn't have that default, we set it explicitly
  // here for safety.
  const signedAt = new Date().toISOString(); // edge-function-side clock, NOT browser

  const { data, error } = await supabaseAdmin
    .from("agreement_signatures")
    .insert({
      agent_id: agentId,
      file_id: fileId ?? null,
      agreement_type: agreementType,
      agreement_version: agreementVersion,
      typed_full_name: typedFullName,
      drawn_signature_data: (body.drawn_signature_data as string | null) ?? null,
      signature_image_url: (body.signature_image_url as string | null) ?? null,
      ip_address: ipAddress,
      user_agent: (body.user_agent as string | undefined) ?? null,
      signed_at: signedAt,
    })
    .select("id, signed_at, ip_address")
    .single();

  if (error) {
    console.error("[record-signed-agreement] insert failed:", error);
    return json({ ok: false, error: "db_insert_failed", detail: error.message }, 500);
  }

  // ---- 4. Chain to PDF generation (fire-and-forget) ----
  // The existing generate-signed-agreement-pdf function handles the PDF build.
  // We don't await it — if it fails, dashboard polls pdf_generation_status.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${supabaseUrl}/functions/v1/generate-signed-agreement-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ signature_id: data.id }),
    }).catch((err) => console.warn("[record-signed-agreement] PDF gen deferred:", err));
  } catch (err) {
    console.warn("[record-signed-agreement] PDF gen invoke skipped:", err);
  }

  return json({
    ok: true,
    signature_id: data.id,
    signed_at: data.signed_at,
    ip_address: data.ip_address,
  });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
