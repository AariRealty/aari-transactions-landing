-- ============================================================================
-- Aari Transactions · Google review link storage (the "space for the link")
-- ============================================================================
-- 1 · org_settings.google_review_link_aari — the ONE global Aari Google review
--     link. Broker-editable (org_settings already RLS: broker writes, staff
--     read). Feeds {{google_review_link_aari}} for every TC and the automated
--     Day-3 review sends.
-- 2 · agents.google_review_link — each agent's OWN Google review link, set on
--     their profile. Feeds {{google_review_link_agent}} and send-welcome-home.
-- Both columns start NULL (the space exists; values added later). Idempotent.
-- ============================================================================

alter table public.org_settings
  add column if not exists google_review_link_aari text;

alter table public.agents
  add column if not exists google_review_link text;
