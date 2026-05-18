// ============================================================================
// Aari Transactions · cloze-sync-contacts
// ============================================================================
// Pulls contacts from Cloze REST API and refreshes the crm_followups_cache
// table. Runs every 15 min via pg_cron.
//
// Currently scoped to the broker (Marlenyi). Future: per-agent API keys.
//
// Env:
//   CLOZE_API_KEY            · the API token she generated in Cloze
//   BROKER_AGENT_ID          · UUID of the broker whose contacts these are
//                              (defaults to whoever has role='broker' if unset)
//
// Auth: callable by pg_cron via service role; also callable manually for debug.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOZE_API_KEY = Deno.env.get("CLOZE_API_KEY") ?? "";
const BROKER_AGENT_ID = Deno.env.get("BROKER_AGENT_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!CLOZE_API_KEY) {
    return j(500, { ok: false, error: "CLOZE_API_KEY not set in Edge Function secrets" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve the broker's agent_id
  let agentId = BROKER_AGENT_ID;
  if (!agentId) {
    const { data: broker } = await admin
      .from("agents")
      .select("id")
      .eq("role", "broker")
      .limit(1)
      .maybeSingle();
    if (broker?.id) agentId = broker.id;
  }
  if (!agentId) {
    return j(500, { ok: false, error: "Could not resolve broker agent_id. Set BROKER_AGENT_ID secret or have a row in agents with role='broker'." });
  }

  // ---- Pull contacts from Cloze ------------------------------------------
  // Cloze REST API · https://api.cloze.com/v1
  // We use the people/list endpoint with the api_key as a query param.
  // This is the most commonly-supported auth pattern across Cloze API versions.
  const clozeBase = "https://api.cloze.com/v1";
  const clozeUrl = `${clozeBase}/profiles/find?api_key=${encodeURIComponent(CLOZE_API_KEY)}&segment=people&max=100&sortby=last_event`;

  let clozeResp: Response;
  try {
    clozeResp = await fetch(clozeUrl, {
      headers: { "Accept": "application/json" },
    });
  } catch (e) {
    console.error("[cloze-sync] network error", e);
    return j(502, { ok: false, error: "cloze_network_error", detail: String(e) });
  }

  if (!clozeResp.ok) {
    const body = await clozeResp.text().catch(() => "");
    console.error("[cloze-sync] Cloze API error", clozeResp.status, body);
    return j(502, { ok: false, error: "cloze_api_error", status: clozeResp.status, body: body.slice(0, 500) });
  }

  const clozeJson = await clozeResp.json().catch(() => null);
  if (!clozeJson) {
    return j(502, { ok: false, error: "cloze_parse_error" });
  }

  // Cloze returns shape: { profiles: [...] } OR { items: [...] } depending on
  // endpoint. We try both for resilience.
  const contacts: ClozeContact[] = (clozeJson.profiles || clozeJson.items || clozeJson.results || []) as ClozeContact[];

  if (!Array.isArray(contacts)) {
    console.error("[cloze-sync] unexpected Cloze response shape", Object.keys(clozeJson));
    return j(502, { ok: false, error: "cloze_unexpected_shape", keys: Object.keys(clozeJson) });
  }

  // ---- Transform + upsert into cache ------------------------------------
  const now = new Date().toISOString();
  const rows = contacts.map(c => transformContact(c, agentId, now)).filter(Boolean);

  // Wipe agent's existing cache then bulk insert. Simpler than merge logic.
  const { error: delErr } = await admin
    .from("crm_followups_cache")
    .delete()
    .eq("agent_id", agentId);
  if (delErr) {
    console.error("[cloze-sync] delete failed", delErr);
    return j(500, { ok: false, error: "cache_delete_failed", detail: delErr.message });
  }

  if (rows.length > 0) {
    const { error: insErr } = await admin
      .from("crm_followups_cache")
      .insert(rows);
    if (insErr) {
      console.error("[cloze-sync] insert failed", insErr);
      return j(500, { ok: false, error: "cache_insert_failed", detail: insErr.message });
    }
  }

  return j(200, {
    ok: true,
    fetched: contacts.length,
    inserted: rows.length,
    agent_id: agentId,
  });
});

// ---- Helpers ---------------------------------------------------------------

interface ClozeContact {
  id?: string;
  uid?: string;
  pkey?: string;
  name?: string;
  display_name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  emails?: Array<{ value?: string; type?: string }>;
  email?: string;
  phones?: Array<{ value?: string; type?: string }>;
  phone?: string;
  last_event?: string | { date?: string; created?: string };
  last_event_date?: string;
  last_touched?: string;
  stages?: string[];
  segments?: string[];
  tags?: string[];
  [k: string]: unknown;
}

function transformContact(c: ClozeContact, agentId: string, now: string) {
  const contactId = c.id || c.uid || c.pkey || "";
  if (!contactId) return null;

  const displayName = c.display_name || c.full_name || c.name
    || [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
    || "(no name)";

  const email = (c.emails && c.emails[0]?.value) || c.email || null;
  const phone = (c.phones && c.phones[0]?.value) || c.phone || null;

  // Try multiple field names for last touched
  let lastTouched: string | null = null;
  if (typeof c.last_event === "string") lastTouched = c.last_event;
  else if (c.last_event && typeof c.last_event === "object") {
    lastTouched = c.last_event.date || c.last_event.created || null;
  }
  if (!lastTouched && c.last_event_date) lastTouched = c.last_event_date;
  if (!lastTouched && c.last_touched) lastTouched = c.last_touched;

  // Temperature heuristic
  const temp = computeTemperature(lastTouched, c);

  // Why text · short human-readable reason
  const why = computeWhyText(lastTouched, c);

  return {
    agent_id: agentId,
    cloze_contact_id: String(contactId),
    display_name: displayName,
    email,
    phone,
    last_touched_at: lastTouched,
    temperature: temp,
    why_text: why,
    raw: c as Record<string, unknown>,
    updated_at: now,
  };
}

function computeTemperature(lastTouched: string | null, c: ClozeContact): string {
  const segs = ([] as string[]).concat(c.segments || [], c.tags || []).map(s => String(s).toLowerCase());
  if (segs.some(s => s.includes("partner") || s.includes("referral") || s.includes("lender") || s.includes("title"))) {
    return "partner";
  }
  if (!lastTouched) return "warm";
  const days = Math.floor((Date.now() - new Date(lastTouched).getTime()) / (1000*60*60*24));
  if (days > 10) return "hot";   // long-neglected leads
  if (days > 3) return "warm";
  return "active";
}

function computeWhyText(lastTouched: string | null, c: ClozeContact): string {
  const segs = ([] as string[]).concat(c.segments || [], c.tags || []).map(String);
  const label = segs.find(s => /buyer|seller|lead|client|partner/i.test(s)) || "Contact";
  if (!lastTouched) return label + " · no recent touches logged";
  const days = Math.floor((Date.now() - new Date(lastTouched).getTime()) / (1000*60*60*24));
  if (days === 0) return label + " · last touched today";
  if (days === 1) return label + " · last touched yesterday";
  return label + " · " + days + " days dark";
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
