-- ============================================================================
-- 20260714 · Fix the SECURITY DEFINER view agents_unsigned_v47 (ERROR lint)
-- ============================================================================
-- The view lists agents who haven't signed the current service agreement
-- (id, email, first + last name). It ran with the owner's rights (SECURITY
-- DEFINER default), BYPASSING RLS on public.agents — and both anon and
-- authenticated held SELECT on it. So anyone with the public anon key could
-- read every unsigned agent's email + name.
--
-- No page or edge function references this view (grep = 0 hits), so this is
-- safe and non-breaking:
--   1. security_invoker = on  -> the view now runs with the CALLER's rights and
--      respects agents RLS (anon/other agents see nothing; broker/service role
--      see what their policies already allow).
--   2. revoke anon             -> anon has no business reading agent PII at all.
--
-- Reversible: SET (security_invoker = off) + re-grant to restore prior behavior.
-- ============================================================================

alter view public.agents_unsigned_v47 set (security_invoker = on);
revoke all on public.agents_unsigned_v47 from anon;
