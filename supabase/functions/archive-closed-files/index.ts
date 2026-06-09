// Edge function: archive-closed-files (Email System v2 · Step 16 · "30-day purge")
// ============================================================================
// COMPLIANCE-SAFE BY DESIGN. This does NOT delete anything. Per FREC/DBPR
// retention rules (and the existing 'archived' status the rest of the system
// already uses), a file closed 30+ days ago is moved status 'closed' ->
// 'archived' and stamped archived_at. The record, its documents, its audit
// trail, and its email history all stay in the database intact. Archiving only
// drops the file out of the active cockpit views (which already exclude
// 'archived'), keeping the working board clean.
//
// Idempotent: only acts on status='closed' files past the cutoff, so re-runs
// are no-ops. Reversible: flip status back to 'closed' to restore.
//
// Sequencing is safe: the Day-3 review and Day-14 welcome-home automations both
// filter on status='closed' and fire well before this 30-day mark, so archiving
// never races them.
//
// Trigger: pg_cron daily (see 20260624_archive_closed.sql). Optional body
// { "older_than_days": N } overrides the 30-day cutoff for testing.
// ============================================================================

import { supabaseAdmin } from "../_shared/supabase.ts";

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  let olderThanDays = 30;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const n = Number(body?.older_than_days);
      if (Number.isFinite(n) && n > 0) olderThanDays = n;
    }
  } catch (_) { /* no body */ }

  const cutoff = new Date(Date.now() - olderThanDays * DAY).toISOString();

  // Find closed files past the cutoff. Select ids first so we can report and log.
  const { data: due, error: findErr } = await supabaseAdmin
    .from("files")
    .select("id, property_address, closed_at")
    .eq("status", "closed")
    .lte("closed_at", cutoff)
    .limit(500);

  if (findErr) return json({ ok: false, error: findErr.message }, 500);
  if (!due || !due.length) return json({ ok: true, archived: 0, reason: "nothing_due" });

  const ids = due.map((f) => f.id);
  const { error: updErr } = await supabaseAdmin
    .from("files")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "closed"); // guard: never touch a file that moved meanwhile

  if (updErr) return json({ ok: false, error: updErr.message, attempted: ids.length }, 500);

  return json({ ok: true, archived: ids.length, cutoff });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
