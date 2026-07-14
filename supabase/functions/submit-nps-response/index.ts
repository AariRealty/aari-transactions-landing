// Edge function: submit-nps-response (security fix · July 2026)
// ============================================================================
// PUBLIC, token-authenticated. Replaces the direct anon UPDATE on agent_nps in
// nps.html. The old RLS policy (nps_anon_respond) allowed ANY anon caller to
// UPDATE every un-responded row without the token — so anyone with the public
// anon key could bulk-poison pending NPS invites. This function verifies the
// token server-side (service role), so only a caller who holds a real token can
// record that one response. Deployed with verify_jwt=false (public link flow).
// ============================================================================

import { createClient } from "supabase";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const scoreNum = Number(body.score);
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null;
  const mayShare = body.may_share_as_testimonial === true;

  if (!token) return json({ ok: false, error: "missing_token" }, 400);
  if (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 10) {
    return json({ ok: false, error: "invalid_score" }, 400);
  }

  // Look up the row by its secret token (service role — anon has no access).
  const { data: row, error: findErr } = await admin
    .from("agent_nps")
    .select("id, responded_at")
    .eq("token", token)
    .maybeSingle();

  if (findErr) return json({ ok: false, error: "lookup_failed" }, 500);
  if (!row) return json({ ok: false, error: "invalid_token" }, 404);
  if (row.responded_at) return json({ ok: false, error: "already_responded" }, 409);

  const { error: updErr } = await admin
    .from("agent_nps")
    .update({
      score: scoreNum,
      comment,
      may_share_as_testimonial: mayShare,
      responded_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .is("responded_at", null);

  if (updErr) return json({ ok: false, error: "update_failed" }, 500);
  return json({ ok: true });
});
