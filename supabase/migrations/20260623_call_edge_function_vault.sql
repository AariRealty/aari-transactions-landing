-- ============================================================================
-- Aari Transactions · call_edge_function via Vault (June 2026 · run in prod)
-- ============================================================================
-- AUDIT FINDING during Item 5 testing: public.call_edge_function never
-- existed in production — the 20260512 version depended on
-- ALTER DATABASE ... SET app.* settings, which hosted Supabase denies
-- (42501). Every cron job and DB trigger that PERFORMs this helper
-- (payment-reminder hourly, intake-confirmation, status pings, Friday
-- summary) was silently a no-op.
--
-- FIX (this version, run June 5 2026): service_role key lives in Supabase
-- Vault under the name 'service_role_key'; the helper reads it at call time.
-- One-time setup (already done in prod · key value not in this file):
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- ============================================================================

create extension if not exists pg_net;

CREATE OR REPLACE FUNCTION public.call_edge_function(fn_name TEXT, body JSONB)
RETURNS BIGINT AS $$
DECLARE
  request_id BIGINT;
  srk TEXT;
BEGIN
  SELECT decrypted_secret INTO srk
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF srk IS NULL THEN
    RAISE NOTICE 'service_role_key missing in vault — edge call skipped';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url     := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/' || fn_name,
    body    := body,
    headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || srk
              )
  ) INTO request_id;
  RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.call_edge_function(TEXT, JSONB) FROM public, anon, authenticated;
