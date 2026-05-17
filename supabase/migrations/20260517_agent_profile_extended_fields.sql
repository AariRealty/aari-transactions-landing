-- ============================================================================
-- Aari Transactions · Agent profile extended fields
-- ============================================================================
-- Extends 20260517_agent_profile_completion_fields.sql with the rest of the
-- onboarding columns so the portal's Complete Your Profile flow can surface
-- every field — not just the basics.
--
-- All `add column if not exists` so re-running is safe. Some columns may
-- already exist; this script no-ops them.
-- ============================================================================

alter table public.agents
  -- License info (Marketing & Preferences section of register.html)
  add column if not exists license_number              text,
  add column if not exists license_expiration          date,
  -- Service area (Agent info section of register.html)
  add column if not exists service_area                text,
  -- Compliance platform login (File Access section of register.html)
  add column if not exists compliance_platform         text,
  add column if not exists compliance_username         text,
  add column if not exists compliance_password         text,
  -- Document signing platform login (File Access section of register.html)
  add column if not exists signing_platform            text,
  add column if not exists signing_username            text,
  add column if not exists signing_password            text,
  -- Favorites (used for closing/birthday gifts · Marketing & Preferences)
  add column if not exists favorite_flower             text,
  add column if not exists favorite_restaurant         text,
  add column if not exists favorite_food               text;

comment on column public.agents.license_number is 'State-issued real estate license number';
comment on column public.agents.compliance_platform is 'Skyslope, Command, dotloop, etc. Used by TC to access agent compliance files.';
comment on column public.agents.compliance_password is 'Plaintext credential stored for TC access. Supabase encrypts at rest. SECURITY: rotate quarterly + audit access via audit_log.';
comment on column public.agents.signing_password is 'Plaintext credential stored for TC access. Supabase encrypts at rest. SECURITY: rotate quarterly + audit access via audit_log.';
comment on column public.agents.favorite_flower is 'Used for birthday/closing flower deliveries.';
