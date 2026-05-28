-- ============================================================================
-- Aari Transactions · Agent SA signature tracking (May 2026)
-- ============================================================================
-- IMPORTANT FOR MARLENYI
-- Run this file via Supabase Web SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> paste contents -> Run).
-- `supabase db push` has had auth/CLI issues previously; the SQL Editor is the
-- safest path. This migration is idempotent (uses IF NOT EXISTS / OR REPLACE),
-- so re-running is safe.
-- ============================================================================
-- WHAT THIS DOES
-- 1. Adds three columns to public.agents so we can track which version of
--    the Service Agreement each agent has signed, when, and the typed name.
-- 2. Creates a helper view (agents_unsigned_v47) used by portal.html to gate
--    access for any agent who has not yet signed the current SA (v4.7).
-- 3. Updates the handle_new_agent trigger to populate the new columns from
--    the auth.users.metadata.agent_profile payload at signup time, so new
--    sign-ups will never be gated by the portal modal.
-- ============================================================================

-- ----- 1. Columns -----
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_version TEXT,
  ADD COLUMN IF NOT EXISTS agreement_typed_name TEXT;

COMMENT ON COLUMN public.agents.agreement_signed_at IS 'Timestamp when this agent signed the latest Service Agreement version they have on file.';
COMMENT ON COLUMN public.agents.agreement_version IS 'The Service Agreement version string the agent has signed (e.g., v4.7).';
COMMENT ON COLUMN public.agents.agreement_typed_name IS 'The typed legal name the agent provided as electronic signature under Fla. Stat. § 668.50.';

-- ----- 2. Helper view: agents who have NOT signed the current SA version (v4.7) -----
-- Used by portal.html to gate access.
CREATE OR REPLACE VIEW public.agents_unsigned_v47 AS
SELECT id, email, first_name, last_name, agreement_signed_at, agreement_version
FROM public.agents
WHERE agreement_signed_at IS NULL OR agreement_version IS NULL OR agreement_version <> 'v4.7';

-- ----- 3. Refresh handle_new_agent trigger so new signups populate SA fields -----
-- Replaces the May 2026 trigger with an updated version that adds the three
-- new agreement_* columns to the insert. Original behavior preserved.
create or replace function public.handle_new_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
begin
  profile := coalesce(new.raw_user_meta_data->'agent_profile', '{}'::jsonb);

  -- Idempotent · skip if profile already exists for this user id.
  if exists (select 1 from public.agents where id = new.id) then
    return new;
  end if;

  insert into public.agents (
    id, email, first_name, last_name, phone, role,
    license_number, license_state, license_expires_at,
    brokerage_name, brokerage_address,
    broker_name, broker_email, broker_phone,
    agreement_signed_at, agreement_version, agreement_typed_name
  )
  values (
    new.id,
    new.email,
    coalesce(profile->>'first_name', new.raw_user_meta_data->>'first_name', 'Agent'),
    coalesce(profile->>'last_name',  new.raw_user_meta_data->>'last_name',  '-'),
    profile->>'phone',
    'agent',
    coalesce(profile->>'license_number', 'PENDING'),
    coalesce(profile->>'license_state', 'FL'),
    coalesce((profile->>'license_expires_at')::date, '2099-12-31'::date),
    coalesce(profile->>'brokerage_name', 'Pending'),
    profile->>'brokerage_address',
    coalesce(profile->>'broker_name', 'Pending'),
    coalesce(profile->>'broker_email', new.email),
    profile->>'broker_phone',
    nullif(profile->>'agreement_signed_at','')::timestamptz,
    nullif(profile->>'agreement_version',''),
    nullif(profile->>'agreement_typed_name','')
  );
  return new;
exception when others then
  raise warning 'handle_new_agent insert failed for user %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_agent();
