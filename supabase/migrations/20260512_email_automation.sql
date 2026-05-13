-- ============================================================================
-- Aari Transactions · Email Automation · Schema migration
-- ============================================================================
-- Adds:
--   email_log         · audit row per send, joined to Resend delivery events
--   email_preferences · per-user opt-outs (granular: transactional/marketing/reviews)
--
-- Triggers added:
--   tc_files INSERT  → http_post to send-intake-confirmation edge function
--   tc_files UPDATE  → http_post to send-tc-status-ping when status milestone changes
--   tc_files UPDATE  → http_post to send-review-request when status='closed'
--   memberships UPDATE → http_post to send-membership-event on tier/status changes
--   client_reviews UPDATE → http_post to send-review-approved when status='approved'
--
-- Cron jobs added (require pg_cron extension enabled in Supabase):
--   win_back_daily          · 09:00 ET daily, scans inactive agents
--   review_request_daily    · 10:00 ET daily, scans closed files at +24h
--   pause_resume_reminder   · 11:00 ET daily, scans paused memberships 2d from resume
-- ============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- TABLE · email_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type      TEXT NOT NULL,
  to_address      TEXT NOT NULL,
  to_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_file_id UUID,
  resend_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','bounced','complained','failed','suppressed')),
  subject         TEXT,
  template        TEXT,
  payload         JSONB,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON public.email_log(to_user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_type_created ON public.email_log(email_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_resend ON public.email_log(resend_id) WHERE resend_id IS NOT NULL;

COMMENT ON TABLE public.email_log IS 'Audit log: one row per email send. Resend webhook updates status/timestamps post-send.';

-- ----------------------------------------------------------------------------
-- TABLE · email_preferences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  transactional    BOOLEAN NOT NULL DEFAULT true,
  marketing        BOOLEAN NOT NULL DEFAULT true,
  review_requests  BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.email_preferences.transactional IS 'Intake confirmations, TC status pings. Cannot be opted out under CAN-SPAM transactional carve-out.';
COMMENT ON COLUMN public.email_preferences.marketing IS 'Win-back, broadcasts. Honored per CAN-SPAM.';
COMMENT ON COLUMN public.email_preferences.review_requests IS 'Post-close review prompts. Honored to keep FTC compliance clean.';

-- Auto-create email_preferences row on user signup
CREATE OR REPLACE FUNCTION public.ensure_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_user_email_prefs ON auth.users;
CREATE TRIGGER trg_user_email_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_email_preferences();

-- ----------------------------------------------------------------------------
-- RLS · email_log readable by service role only. email_preferences readable by owner.
-- ----------------------------------------------------------------------------
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log_service_role_only" ON public.email_log;
CREATE POLICY "email_log_service_role_only" ON public.email_log
  FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS "email_prefs_owner_select" ON public.email_preferences;
CREATE POLICY "email_prefs_owner_select" ON public.email_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "email_prefs_owner_update" ON public.email_preferences;
CREATE POLICY "email_prefs_owner_update" ON public.email_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- HELPER · http_post wrapper for edge function calls (uses pg_net)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.call_edge_function(fn_name TEXT, body JSONB)
RETURNS BIGINT AS $$
DECLARE
  request_id BIGINT;
  base_url   TEXT := current_setting('app.supabase_url', true);
  anon_key   TEXT := current_setting('app.supabase_service_role_key', true);
BEGIN
  IF base_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE 'app.supabase_url or app.supabase_service_role_key not set — edge call skipped';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/functions/v1/' || fn_name,
    body    := body,
    headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || anon_key
              )
  ) INTO request_id;

  RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- TRIGGER · tc_files INSERT → send-intake-confirmation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_tc_files_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.call_edge_function(
    'send-intake-confirmation',
    jsonb_build_object('file_id', NEW.id, 'agent_id', NEW.agent_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_tc_files_insert ON public.tc_files;
CREATE TRIGGER trg_tc_files_insert
  AFTER INSERT ON public.tc_files
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_tc_files_insert();

-- ----------------------------------------------------------------------------
-- TRIGGER · tc_files UPDATE → status ping OR review-request handoff
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_tc_files_update()
RETURNS TRIGGER AS $$
BEGIN
  -- TC assignment ping
  IF NEW.tc_assigned_id IS DISTINCT FROM OLD.tc_assigned_id AND NEW.tc_assigned_id IS NOT NULL THEN
    PERFORM public.call_edge_function(
      'send-tc-assignment',
      jsonb_build_object('file_id', NEW.id, 'tc_id', NEW.tc_assigned_id)
    );
  END IF;

  -- Status milestone ping (any status change other than 'closed')
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed' THEN
    PERFORM public.call_edge_function(
      'send-tc-status-ping',
      jsonb_build_object('file_id', NEW.id, 'new_status', NEW.status, 'previous_status', OLD.status)
    );
  END IF;

  -- Close event — review request scheduled 24h out (handled by cron, not webhook)
  -- We just stamp closed_at here; cron picks it up.
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_tc_files_update ON public.tc_files;
CREATE TRIGGER trg_tc_files_update
  BEFORE UPDATE ON public.tc_files
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_tc_files_update();

-- ----------------------------------------------------------------------------
-- TRIGGER · memberships UPDATE → upgrade/pause/cancel events
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_memberships_update()
RETURNS TRIGGER AS $$
DECLARE
  event_type TEXT;
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.tier = 'producer' THEN
    event_type := 'upgrade_producer';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'paused' THEN
    event_type := 'paused';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN
    event_type := 'cancelled';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.call_edge_function(
    'send-membership-event',
    jsonb_build_object('user_id', NEW.user_id, 'event_type', event_type, 'membership_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_memberships_update ON public.memberships;
CREATE TRIGGER trg_memberships_update
  AFTER UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_memberships_update();

-- ----------------------------------------------------------------------------
-- TRIGGER · client_reviews UPDATE → notify agent when approved
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_client_reviews_approved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    PERFORM public.call_edge_function(
      'send-review-approved',
      jsonb_build_object('review_id', NEW.id, 'agent_id', NEW.agent_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_client_reviews_approved ON public.client_reviews;
CREATE TRIGGER trg_client_reviews_approved
  AFTER UPDATE ON public.client_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_client_reviews_approved();

-- ----------------------------------------------------------------------------
-- CRON · daily scans
-- ----------------------------------------------------------------------------
-- Win-back (Day 30, 60, 90) · 13:00 UTC ~ 09:00 ET
SELECT cron.schedule(
  'win_back_daily',
  '0 13 * * *',
  $$ SELECT public.call_edge_function('send-win-back', jsonb_build_object('run_date', now()::DATE::TEXT)); $$
);

-- Review request · 14:00 UTC ~ 10:00 ET. Scans files closed ~24h ago.
SELECT cron.schedule(
  'review_request_daily',
  '0 14 * * *',
  $$ SELECT public.call_edge_function('send-review-request', jsonb_build_object('run_date', now()::DATE::TEXT)); $$
);

-- Pause-resume reminder · 15:00 UTC ~ 11:00 ET. Scans memberships with resume in 2 days.
SELECT cron.schedule(
  'pause_resume_reminder',
  '0 15 * * *',
  $$ SELECT public.call_edge_function('send-membership-event', jsonb_build_object('event_type', 'pause_resume_reminder', 'run_date', now()::DATE::TEXT)); $$
);

-- ============================================================================
-- End of migration. Run order: extensions → tables → policies → helpers → triggers → cron.
-- Set app.supabase_url + app.supabase_service_role_key via ALTER DATABASE before deploy.
-- ============================================================================
