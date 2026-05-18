// ============================================================================
// Aari Transactions · google-calendar-fetch
// ============================================================================
// Returns today's calendar events for the authenticated agent. Reads tokens
// from agent_google_calendar, auto-refreshes the access_token if expired,
// and pulls events from the primary calendar between start-of-day and
// end-of-day in America/New_York.
//
// Auth: requires Bearer JWT (the calling agent).
// Body: {} (none required)
// Response:
//   { connected: true, email, events: [{ id, summary, start, end, location, all_day, status }, ...] }
//   { connected: false }  // when the agent hasn't connected yet
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return j(401, { ok: false, error: "Missing bearer token" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return j(401, { ok: false, error: "Invalid session" });
  const agentId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: row } = await admin
    .from("agent_google_calendar")
    .select("access_token, refresh_token, expires_at, google_email, scope")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!row) return j(200, { ok: true, connected: false });

  // Refresh if expired or within 60s of expiring
  let accessToken = row.access_token;
  const nearExpiry = new Date(row.expires_at).getTime() - 60_000 < Date.now();
  if (nearExpiry) {
    if (!row.refresh_token) {
      return j(200, { ok: true, connected: false, reason: "no_refresh_token" });
    }
    try {
      const refResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!refResp.ok) {
        const errBody = await refResp.text().catch(() => "");
        console.error("[google-calendar-fetch] refresh failed:", errBody);
        // Refresh failure could mean the user revoked access. Treat as disconnected.
        return j(200, { ok: true, connected: false, reason: "refresh_failed" });
      }
      const refreshed = await refResp.json() as { access_token: string; expires_in: number };
      accessToken = refreshed.access_token;
      await admin
        .from("agent_google_calendar")
        .update({
          access_token: refreshed.access_token,
          expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("agent_id", agentId);
    } catch (e) {
      console.error("[google-calendar-fetch] refresh threw:", e);
      return j(200, { ok: true, connected: false, reason: "refresh_threw" });
    }
  }

  // Fetch today's events · ACROSS ALL CALENDARS the user has read access to
  const tz = "America/New_York";
  const now = new Date();
  const startOfDayET = dayStartInTZ(now, tz);
  const endOfDayET = new Date(startOfDayET.getTime() + 24 * 60 * 60 * 1000 - 1);

  // 1) List every calendar the user has access to (primary + work + shared + etc.)
  const listResp = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    { headers: { "Authorization": "Bearer " + accessToken } }
  );
  if (!listResp.ok) {
    const errBody = await listResp.text().catch(() => "");
    console.error("[google-calendar-fetch] calendarList error:", errBody);
    if (listResp.status === 401 || listResp.status === 403) {
      return j(200, { ok: true, connected: false, reason: "calendar_auth_failed" });
    }
    return j(500, { ok: false, error: "calendar_list_error" });
  }
  const listJson = await listResp.json() as { items?: GoogleCalendarListEntry[] };
  // Respect Google Calendar's per-calendar `selected` flag · skip calendars
  // the user toggled off in their Google Calendar sidebar.
  const calendars = (listJson.items ?? []).filter(c => !c.deleted && c.selected !== false);

  // 2) Pull today's events from each calendar in parallel
  const allEvents: Array<GoogleEvent & { _cal?: string }> = [];
  const calendarErrors: string[] = [];
  await Promise.all(calendars.map(async (cal) => {
    try {
      const eventsUrl = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id ?? "")}/events`
      );
      eventsUrl.searchParams.set("timeMin", startOfDayET.toISOString());
      eventsUrl.searchParams.set("timeMax", endOfDayET.toISOString());
      eventsUrl.searchParams.set("singleEvents", "true");
      eventsUrl.searchParams.set("orderBy", "startTime");
      eventsUrl.searchParams.set("maxResults", "50");

      const evResp = await fetch(eventsUrl.toString(), {
        headers: { "Authorization": "Bearer " + accessToken },
      });
      if (!evResp.ok) {
        const body = await evResp.text().catch(() => "");
        calendarErrors.push(`${cal.summary}: ${evResp.status} ${body.slice(0, 100)}`);
        return;
      }
      const evJson = await evResp.json() as { items?: GoogleEvent[] };
      (evJson.items ?? []).forEach(e => {
        allEvents.push({ ...e, _cal: cal.summary });
      });
    } catch (e) {
      calendarErrors.push(`${cal.summary}: threw ${String(e)}`);
    }
  }));

  // 3) Sort by start time (chronological)
  allEvents.sort((a, b) => {
    const aTime = a.start?.dateTime ?? a.start?.date ?? "";
    const bTime = b.start?.dateTime ?? b.start?.date ?? "";
    return aTime.localeCompare(bTime);
  });

  // 4) Drop events the user explicitly declined
  const filtered = allEvents.filter(e => {
    const att = (e as GoogleEvent & { attendees?: Array<{ self?: boolean; responseStatus?: string }> }).attendees;
    if (!att) return true;
    const self = att.find(a => a.self);
    return !self || self.responseStatus !== "declined";
  });

  const events = filtered.map(e => ({
    id: e.id,
    summary: e.summary ?? "(No title)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    location: e.location ?? null,
    all_day: !!(e.start?.date && !e.start?.dateTime),
    status: e.status ?? "confirmed",
    html_link: e.htmlLink ?? null,
    calendar: e._cal ?? null,
  }));

  return j(200, {
    ok: true,
    connected: true,
    email: row.google_email,
    events,
    calendar_count: calendars.length,
    calendar_errors: calendarErrors.length ? calendarErrors : undefined,
  });
});

interface GoogleCalendarListEntry {
  id?: string;
  summary?: string;
  deleted?: boolean;
  selected?: boolean;
  accessRole?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  status?: string;
  htmlLink?: string;
}

function dayStartInTZ(d: Date, tz: string): Date {
  // Format d in the target TZ as YYYY-MM-DD, then parse that as midnight in that TZ.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  // Build a string like "2026-05-17T00:00:00" interpreted in the TZ. We use
  // toLocaleString roundtrip to compute the UTC equivalent.
  const localMidnight = new Date(`${y}-${m}-${day}T00:00:00`);
  // The above is treated as local time of the SERVER. We want the equivalent
  // in the target TZ. Compute offset by comparing what the server thinks the
  // current time looks like in the target TZ.
  const tzString = new Date(d).toLocaleString("en-US", { timeZone: tz });
  const localString = new Date(d).toLocaleString("en-US");
  const offsetMs = new Date(tzString).getTime() - new Date(localString).getTime();
  return new Date(localMidnight.getTime() - offsetMs);
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
