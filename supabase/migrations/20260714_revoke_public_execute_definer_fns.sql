-- ============================================================================
-- 20260714 · Actually lock the definer functions: revoke EXECUTE from PUBLIC
-- ============================================================================
-- The two prior revoke migrations removed the explicit anon/authenticated grants
-- but NOT the default PUBLIC grant (ACL "=X/postgres"). Since every role inherits
-- PUBLIC, anon/authenticated still effectively had EXECUTE — the lockdown was a
-- no-op (and therefore also broke nothing). This revokes PUBLIC so the restriction
-- takes real effect.
--
-- Trigger functions fire without an EXECUTE check on the invoking user, and
-- invoke_edge_function / sweep_unaccepted_files run only from SECURITY DEFINER
-- callers (owner) or pg_cron (postgres) — so removing PUBLIC is safe there.
-- For the four kept-authenticated RPCs, PUBLIC is revoked and authenticated is
-- re-granted explicitly (drops anon, keeps signed-in access).
-- NOT touched: agent_exists + RLS helpers (is_broker/is_staff/…), which must stay
-- executable by anon/authenticated. Reversible: GRANT EXECUTE ... TO public.
-- ============================================================================

-- Full lock (trigger fns + owner/cron-only helpers): PUBLIC off entirely.
revoke execute on function public.auto_add_to_aari_team()          from public;
revoke execute on function public.auto_assign_tc()                 from public;
revoke execute on function public.fire_broker_escalation_sms()     from public;
revoke execute on function public.fire_file_submitted_sms()        from public;
revoke execute on function public.fire_tc_assignment_sms()         from public;
revoke execute on function public.handle_new_agent()               from public;
revoke execute on function public.link_website_signature()         from public;
revoke execute on function public.log_file_tc_change()             from public;
revoke execute on function public.notify_tc_pool_on_insert()       from public;
revoke execute on function public.set_inhouse_owner_default()      from public;
revoke execute on function public.set_priority_from_closing_date() from public;
revoke execute on function public.tg_claim_pending_files()         from public;
revoke execute on function public.tg_files_require_sa()            from public;
revoke execute on function public.invoke_edge_function(text, jsonb) from public;
revoke execute on function public.sweep_unaccepted_files()          from public;

-- Drop anon, keep authenticated: revoke PUBLIC then re-grant authenticated.
revoke execute on function public.team_board(uuid)                 from public;
grant  execute on function public.team_board(uuid)                 to authenticated;
revoke execute on function public.next_tc_invoice_number()         from public;
grant  execute on function public.next_tc_invoice_number()         to authenticated;
revoke execute on function public.cleanup_google_oauth_state()     from public;
grant  execute on function public.cleanup_google_oauth_state()     to authenticated;
revoke execute on function public.resolve_tc_assignment(jsonb)     from public;
grant  execute on function public.resolve_tc_assignment(jsonb)     to authenticated;
