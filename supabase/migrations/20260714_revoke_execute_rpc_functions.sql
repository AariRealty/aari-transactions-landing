-- ============================================================================
-- 20260714 · Tighten EXECUTE on SECURITY DEFINER RPC functions (careful pass)
-- ============================================================================
-- Reviewed one at a time. Two postures:
--
-- FULL revoke (anon + authenticated) — every caller traced, none is a browser
-- client or an authenticated-context edge call:
--   * invoke_edge_function: only ever PERFORMed by SECURITY DEFINER DB triggers
--     (agent-SMS + listing-visibility), which run as the function OWNER, so the
--     grant to anon/authenticated is unused. Locking it also removes an
--     arbitrary-edge-function invoker from the public API surface.
--   * sweep_unaccepted_files: invoked only by pg_cron (runs as postgres).
--
-- ANON-only revoke (keep authenticated) — no anonymous caller is ever
-- legitimate, but an authenticated caller could not be fully verified from this
-- repo (some edge-function sources live outside it), so authenticated is kept
-- to avoid breaking a caller I can't see:
--   * cleanup_google_oauth_state, next_tc_invoice_number,
--     resolve_tc_assignment, team_board (portal calls team_board authenticated).
--
-- NOT touched: agent_exists (called by the public pre-signup email check — needs
-- anon); is_broker/is_staff/is_aari_team/is_realty_broker/is_file_closed (RLS
-- helpers, evaluated in the caller's context — must keep the grant);
-- broker_delete_file / realty_* / touch_broker_last_seen (authenticated-only
-- already, legitimately used). Reversible: GRANT EXECUTE ... back.
-- ============================================================================

revoke execute on function public.invoke_edge_function(text, jsonb) from anon, authenticated;
revoke execute on function public.sweep_unaccepted_files()          from anon, authenticated;

revoke execute on function public.cleanup_google_oauth_state()      from anon;
revoke execute on function public.next_tc_invoice_number()          from anon;
revoke execute on function public.resolve_tc_assignment(jsonb)      from anon;
revoke execute on function public.team_board(uuid)                  from anon;
