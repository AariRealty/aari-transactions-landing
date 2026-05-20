-- ============================================================================
-- Aari Transactions · Agent signup completion fields (Path B v2 · May 2026)
-- ============================================================================
-- Adds the columns the in-modal signup wizard writes on Step 4 (Agreement):
--   · headshot_url        · public URL of the agent's headshot in the
--                           `headshots` bucket (uploaded on Step 2).
--   · signature_image_url · base64 dataURL of the drawn signature from the
--                           canvas pad. Kept inline for v1 · move to bucket
--                           if/when payload size becomes a concern.
--   · agreement_signed    · true once the agent has scrolled, checked, signed.
--   · agreement_signed_at · timestamp of signature (server-clock).
--   · agreement_version   · 'v4.6' as of this release.
--   · agreement_typed_name· first+last name pulled from Step 1 at signature time.
--
-- All `add column if not exists` so re-running is safe.
-- ============================================================================

alter table public.agents
  add column if not exists headshot_url          text,
  add column if not exists signature_image_url   text,
  add column if not exists agreement_signed      boolean not null default false,
  add column if not exists agreement_signed_at   timestamptz,
  add column if not exists agreement_version     text,
  add column if not exists agreement_typed_name  text;

comment on column public.agents.headshot_url is
  'Public URL of agent headshot in the headshots bucket. Used in profile, file confirmations, and Aari marketing.';
comment on column public.agents.signature_image_url is
  'Drawn signature captured at registration. Stored as base64 dataURL (v1). Audit-defensible electronic signature under Fla. Stat. § 668.50.';
comment on column public.agents.agreement_signed is
  'True once agent has scrolled, acknowledged, and signed the Aari Transactions Service Agreement.';
comment on column public.agents.agreement_version is
  'Agreement version signed (e.g., v4.6). Edits to the master must bump this and re-prompt agents.';
