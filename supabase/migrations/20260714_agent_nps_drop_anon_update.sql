-- ============================================================================
-- 20260714 · Remove the tamperable anon UPDATE on agent_nps (security fix)
-- ============================================================================
-- The nps_anon_respond policy let ANY anon caller UPDATE every un-responded
-- agent_nps row (USING responded_at IS NULL) with no token predicate — RLS
-- cannot verify the caller's token, so anyone with the public anon key could
-- bulk-poison pending NPS invites. Responses now go through the
-- submit-nps-response edge function, which verifies the secret token with the
-- service role. Anon keeps no direct write to agent_nps (RLS denies by default).
--
-- Apply ONLY after the new nps.html (which calls submit-nps-response) is live,
-- so in-flight responses don't hit a dropped policy.
-- ============================================================================

drop policy if exists nps_anon_respond on public.agent_nps;
