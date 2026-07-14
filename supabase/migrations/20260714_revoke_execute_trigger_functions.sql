-- ============================================================================
-- 20260714 · Revoke anon/authenticated EXECUTE on SECURITY DEFINER TRIGGER fns
-- ============================================================================
-- These 13 functions all RETURN trigger. A trigger fires through the trigger
-- mechanism in the statement's context — the invoking role does NOT need (and
-- PostgreSQL does not check) EXECUTE on the trigger function. PostgREST also
-- never exposes trigger-returning functions as callable RPCs. So the default
-- anon/authenticated EXECUTE grant is pure attack surface with no legitimate
-- use; revoking it is safe and clears the anon/authenticated-executable
-- SECURITY DEFINER lint for all 13. Reversible: GRANT EXECUTE ... back.
-- (RLS helper functions like is_broker()/is_staff() are intentionally NOT
-- touched — RLS evaluates them in the caller's context and needs the grant.)
-- ============================================================================

revoke execute on function public.auto_add_to_aari_team()        from anon, authenticated;
revoke execute on function public.auto_assign_tc()               from anon, authenticated;
revoke execute on function public.fire_broker_escalation_sms()   from anon, authenticated;
revoke execute on function public.fire_file_submitted_sms()      from anon, authenticated;
revoke execute on function public.fire_tc_assignment_sms()       from anon, authenticated;
revoke execute on function public.handle_new_agent()             from anon, authenticated;
revoke execute on function public.link_website_signature()       from anon, authenticated;
revoke execute on function public.log_file_tc_change()           from anon, authenticated;
revoke execute on function public.notify_tc_pool_on_insert()     from anon, authenticated;
revoke execute on function public.set_inhouse_owner_default()    from anon, authenticated;
revoke execute on function public.set_priority_from_closing_date() from anon, authenticated;
revoke execute on function public.tg_claim_pending_files()       from anon, authenticated;
revoke execute on function public.tg_files_require_sa()          from anon, authenticated;
