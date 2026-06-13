// Aari Transactions · backfill-signed-agreements (June 2026)
// ============================================================================
// ONE-TIME admin job. For every agent who signed the Service Agreement BEFORE
// PDF-persistence existed (their agreement_signatures row has no
// signed_agreement_pdf_url), this rebuilds the signed PDF from their stored
// signature data and stores it — lighting up the "Download" button in the
// broker's Agent agreements view.
//
// It reuses the canonical PDF builder by calling aari-sa-pdf-email in
// store_only mode (no email, no SMS — they already signed). Idempotent: rows
// that already have a URL are skipped.
//
// Auth: broker JWT, or the service-role key (for a quick curl).
//   curl -X POST "https://<project>.supabase.co/functions/v1/backfill-signed-agreements" \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// Deploy: supabase functions deploy backfill-signed-agreements
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(p: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  // ---- Auth · service key OR broker JWT ----
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "no_auth" }, 401);
  let authorized = SERVICE_KEY && token === SERVICE_KEY;
  if (!authorized) {
    const { data: u } = await supabaseAdmin.auth.getUser(token);
    const uid = u?.user?.id;
    if (uid) {
      const { data: ag } = await supabaseAdmin.from("agents").select("role").eq("id", uid).maybeSingle();
      authorized = ag?.role === "broker";
    }
  }
  if (!authorized) return json({ ok: false, error: "not_authorized" }, 403);

  // ---- Signed-agreement rows still missing a stored PDF ----
  const { data: rows, error } = await supabaseAdmin
    .from("agreement_signatures")
    .select("id, agent_id, typed_full_name, drawn_signature_data, agreement_version, signed_at")
    .eq("agreement_type", "service_agreement")
    .is("signed_agreement_pdf_url", null);
  if (error) return json({ ok: false, error: "query_failed", detail: error.message }, 500);
  if (!rows || !rows.length) return json({ ok: true, scanned: 0, done: 0, skipped: [], note: "nothing to backfill" });

  let done = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const r of rows) {
    // Need the agent's email so aari-sa-pdf-email can resolve the agent + storage path.
    const { data: ag } = await supabaseAdmin
      .from("agents")
      .select("email, first_name, last_name, phone, license_number, brokerage_name")
      .eq("id", r.agent_id)
      .maybeSingle();
    if (!ag?.email) { skipped.push({ id: r.id, reason: "no_agent_email" }); continue; }

    const agentName = (r.typed_full_name || ((ag.first_name || "") + " " + (ag.last_name || "")).trim()) || ag.email;
    const body = {
      store_only: true,
      signature_id: r.id,
      agent_email: ag.email,
      agent_name: agentName,
      agent_phone: ag.phone || "",
      agent_license: ag.license_number || "",
      agent_brokerage: ag.brokerage_name || "",
      signature_data_url: r.drawn_signature_data || "",
      agreement_version: r.agreement_version || "v4.7",
      signed_at_iso: r.signed_at || new Date().toISOString(),
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/aari-sa-pdf-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok && out.storage_path) done++;
      else skipped.push({ id: r.id, reason: (out && out.error) || ("pdf_fn_" + res.status) });
    } catch (e) {
      skipped.push({ id: r.id, reason: (e as Error).message });
    }
  }

  return json({ ok: true, scanned: rows.length, done, skipped });
});
