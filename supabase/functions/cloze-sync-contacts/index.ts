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

  // ---- Probe Cloze API · find the right endpoint ------------------------
  // Cloze's REST API endpoint paths vary by docs version. We probe a list of
  // likely candidates, log status of each, and use the first one that returns
  // an array of contacts.
  const clozeBase = "https://api.cloze.com/v1";
  const keyParam = `api_key=${encodeURIComponent(CLOZE_API_KEY)}`;

  // Diagnostic mode · if ?diag=1, try every candidate and return summary
  const url = new URL(req.url);
  const isDiag = url.searchParams.get("diag") === "1";

  const candidates = [
    { name: "users/me",            method: "GET",  path: `/users/me?${keyParam}` },
    { name: "profiles GET",        method: "GET",  path: `/profiles?${keyParam}&max=10` },
    { name: "profiles/list GET",   method: "GET",  path: `/profiles/list?${keyParam}&max=10` },
    { name: "profiles/list POST",  method: "POST", path: `/profiles/list?${keyParam}`, body: { max: 10 } },
    { name: "people GET",          method: "GET",  path: `/people?${keyParam}&max=10` },
    { name: "people/list GET",     method: "GET",  path: `/people/list?${keyParam}&max=10` },
    { name: "people/list POST",    method: "POST", path: `/people/list?${keyParam}`, body: { max: 10 } },
    { name: "segments/list GET",   method: "GET",  path: `/segments/list?${keyParam}` },
  ];

  const probeResults: Array<Record<string, unknown>> = [];
  let workingResponse: { name: string; data: Record<string, unknown> } | null = null;

  for (const c of candidates) {
    try {
      const init: RequestInit = {
        method: c.method,
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
      };
      if (c.body) init.body = JSON.stringify(c.body);
      const resp = await fetch(clozeBase + c.path, init);
      const txt = await resp.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(txt); } catch {}
      const summary = {
        endpoint: c.name,
        status: resp.status,
        ok: resp.ok,
        keys: parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.keys(parsed as Record<string, unknown>).slice(0, 10)
          : (Array.isArray(parsed) ? ["(array length " + parsed.length + ")"] : []),
        sample: txt.slice(0, 200),
      };
      probeResults.push(summary);
      if (resp.ok && parsed && !workingResponse && c.name !== "users/me") {
        const arr = extractContactArray(parsed);
        if (arr && arr.length >= 0) {
          workingResponse = { name: c.name, data: parsed as Record<string, unknown> };
        }
      }
    } catch (e) {
      probeResults.push({ endpoint: c.name, error: String(e) });
    }
  }

  if (isDiag || !workingResponse) {
    return j(200, {
      ok: false,
      mode: "diagnostic",
      message: workingResponse
        ? "Found working endpoint · " + workingResponse.name
        : "No working contact-list endpoint found. Check the probe results below and report back.",
      working: workingResponse ? workingResponse.name : null,
      probes: probeResults,
    });
  }

  const contacts: ClozeContact[] = extractContactArray(workingResponse.data) || [];

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return j(200, { ok: true, fetched: 0, inserted: 0, agent_id: agentId, note: "Endpoint worked but returned 0 contacts." });
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

function extractContactArray(obj: unknown): ClozeContact[] | null {
  if (Array.isArray(obj)) return obj as ClozeContact[];
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  // Common envelope keys Cloze might use
  const candidateKeys = ["profiles", "people", "items", "results", "data", "list", "contacts"];
  for (const k of candidateKeys) {
    if (Array.isArray(o[k])) return o[k] as ClozeContact[];
  }
  return null;
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
