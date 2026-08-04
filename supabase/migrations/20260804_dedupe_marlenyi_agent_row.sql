-- Aari · consolidate the duplicate agents row for Marlenyi Paredes
-- Keep:   9fa206b8-45e9-46bb-ba98-79c2e8361661  (marlenyi@aarirealty.com, role=broker · real broker identity)
-- Delete: 0a7d728a-9ad2-410a-85f8-3239fd20cdb5  (broker@aarirealty.com,   role=agent  · stale role-based alias)
--
-- Pre-flight scan showed 0 FK refs to 0a7d… across all 38 columns that FK to agents.id, and 0
-- text/JSONB matches in files.raw_form_data, org_settings, messages, drafts. auth.users had a
-- matching row (someone could sign in as broker@aarirealty.com) — Marlenyi approved nuking that
-- account too since it has no history and the email is a role-based alias, not her personal inbox.
--
-- The UPDATE statements below are defensive: they run as no-ops today, but they also catch any
-- row that gets written between the scan and this migration executing.
--
-- Wrapped implicitly in a transaction by supabase apply_migration; any RAISE aborts everything.

-- Step 2 · re-point every FK column from Row A to Row B (defensive; today all affect 0 rows)
UPDATE public.agent_google_calendar    SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agent_google_oauth_state SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agent_nps                SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agent_nps                SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agent_referrals          SET referrer_id    = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE referrer_id    = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agent_weekly_digest_log  SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agents                   SET owner_tc_id    = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE owner_tc_id    = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5' AND id <> '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agents                   SET preferred_tc_id= '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE preferred_tc_id= '0a7d728a-9ad2-410a-85f8-3239fd20cdb5' AND id <> '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.agreement_signatures     SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.bd_contacts              SET owner_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE owner_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.bd_daily_logs            SET owner_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE owner_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.contracts_library        SET created_by     = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE created_by     = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.crm_followups_cache      SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.drafts                   SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.encrypted_credentials    SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.file_contracts           SET created_by     = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE created_by     = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.file_documents           SET uploaded_by    = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE uploaded_by    = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.file_tc_history          SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.files                    SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.files                    SET fg_tc_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE fg_tc_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.membership_credit_uses   SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.memberships              SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.messages                 SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.org_settings             SET updated_by     = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE updated_by     = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.pay_requests             SET paid_by        = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE paid_by        = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.pay_requests             SET reviewed_by    = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE reviewed_by    = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.pay_requests             SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.payments                 SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.payouts                  SET approved_by    = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE approved_by    = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.payouts                  SET paid_by        = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE paid_by        = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.payouts                  SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.payroll_runs             SET run_by         = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE run_by         = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.pipeline_state           SET owner_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE owner_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.tc_invoices              SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.tc_pay_rates             SET tc_id          = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE tc_id          = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.tc_pay_rates             SET updated_by     = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE updated_by     = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.team_members             SET agent_id       = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE agent_id       = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
UPDATE public.teams                    SET lead_agent_id  = '9fa206b8-45e9-46bb-ba98-79c2e8361661' WHERE lead_agent_id  = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';

-- Step 3 · delete the duplicate row from public.agents
DELETE FROM public.agents WHERE id = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';

-- Step 4 · nuke the auth.users row (Marlenyi approved; no history, alias not personal inbox).
-- Any active sessions on that account are invalidated. Cascade rules on auth.users clean up
-- refresh tokens, sessions, and identities automatically.
DELETE FROM auth.users WHERE id = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';

-- Validation · aborts (rolls back) if any assertion fails
DO $$
DECLARE
  n int;
BEGIN
  -- (a) Row A gone from public.agents
  SELECT count(*) INTO n FROM public.agents WHERE id = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
  IF n <> 0 THEN RAISE EXCEPTION 'public.agents row 0a7d… still present after delete (count=%)', n; END IF;

  -- (b) Exactly one broker record for marlenyi@aarirealty.com remains
  SELECT count(*) INTO n FROM public.agents WHERE email = 'marlenyi@aarirealty.com' AND role = 'broker';
  IF n <> 1 THEN RAISE EXCEPTION 'Expected 1 broker row for marlenyi@aarirealty.com, found %', n; END IF;

  -- (c) No lingering broker@aarirealty.com row in public.agents
  SELECT count(*) INTO n FROM public.agents WHERE email = 'broker@aarirealty.com';
  IF n <> 0 THEN RAISE EXCEPTION 'Unexpected broker@aarirealty.com row remains in public.agents (count=%)', n; END IF;

  -- (d) auth.users row is gone too
  SELECT count(*) INTO n FROM auth.users WHERE id = '0a7d728a-9ad2-410a-85f8-3239fd20cdb5';
  IF n <> 0 THEN RAISE EXCEPTION 'auth.users row 0a7d… still present after delete (count=%)', n; END IF;
END $$;
