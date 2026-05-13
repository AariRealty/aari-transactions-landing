-- ============================================================================
-- Aari Transactions · Agent referrals (refer.html backing table)
-- ============================================================================
-- RESPA-clean. Stores referrer + peer info captured from refer.html form.
-- INSERT triggers the send-agent-introduction edge function.
-- No payment, credit, or "rewards" logic anywhere.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referrer (the agent making the introduction)
  referrer_first_name   TEXT NOT NULL,
  referrer_last_name    TEXT NOT NULL,
  referrer_email        TEXT NOT NULL,
  referrer_brokerage    TEXT,

  -- Peer (the agent being introduced)
  peer_first_name       TEXT NOT NULL,
  peer_last_name        TEXT NOT NULL,
  peer_email            TEXT NOT NULL,
  peer_brokerage        TEXT,

  -- Optional context message from referrer
  message               TEXT,
  referral_source       TEXT,             -- 'refer_page_v1', 'portal_share', etc.

  -- Lifecycle stamps
  intro_sent_at         TIMESTAMPTZ,      -- set when AgentIntroduction email fires
  peer_engaged_at       TIMESTAMPTZ,      -- set if peer ever submits a tc_file
  thank_you_sent_at     TIMESTAMPTZ,      -- set manually when Marlenyi sends handwritten note

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_referrals_referrer ON public.agent_referrals(referrer_email);
CREATE INDEX IF NOT EXISTS idx_agent_referrals_peer ON public.agent_referrals(peer_email);
CREATE INDEX IF NOT EXISTS idx_agent_referrals_intro_status ON public.agent_referrals(intro_sent_at) WHERE intro_sent_at IS NULL;

COMMENT ON TABLE public.agent_referrals IS 'RESPA-safe agent-to-agent introductions captured by refer.html. No compensation logic.';

-- RLS · service-role only (form submits via Netlify webhook -> Supabase function -> service role)
ALTER TABLE public.agent_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_referrals_service_role_only" ON public.agent_referrals;
CREATE POLICY "agent_referrals_service_role_only" ON public.agent_referrals
  FOR ALL TO authenticated USING (false);

-- Trigger · INSERT fires send-agent-introduction edge function
CREATE OR REPLACE FUNCTION public.tg_agent_referrals_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.call_edge_function(
    'send-agent-introduction',
    jsonb_build_object('referral_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_agent_referrals_insert ON public.agent_referrals;
CREATE TRIGGER trg_agent_referrals_insert
  AFTER INSERT ON public.agent_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_agent_referrals_insert();

-- Cross-link · when a tc_files row is created, check if the agent_id maps to a recent
-- referral and stamp peer_engaged_at so Marlenyi can see "this peer just submitted their
-- first file" in CRM.
CREATE OR REPLACE FUNCTION public.tg_link_referral_engagement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agent_referrals
    SET peer_engaged_at = now()
    WHERE peer_email = (SELECT email FROM public.profiles WHERE id = NEW.agent_id)
      AND peer_engaged_at IS NULL
      AND intro_sent_at IS NOT NULL
      AND intro_sent_at > (now() - INTERVAL '180 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_tc_files_link_referral ON public.tc_files;
CREATE TRIGGER trg_tc_files_link_referral
  AFTER INSERT ON public.tc_files
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_link_referral_engagement();
