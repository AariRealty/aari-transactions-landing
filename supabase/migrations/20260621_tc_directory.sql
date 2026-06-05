-- ============================================================================
-- Aari Transactions · TC directory visibility (June 2026)
-- ============================================================================
-- BUG: agents could only read their OWN agents row, so any surface that needs
-- TC names for agents came back empty — the onboarding Preferred-TC options,
-- the portal team card, and TC names on My Files cards.
-- FIX: authenticated users may read rows where role = 'tc'. TCs are public-
-- facing staff (their names/photos are on the website). Agent rows stay
-- private. Idempotent.
-- ============================================================================

drop policy if exists "Authenticated can read TC profiles" on public.agents;
create policy "Authenticated can read TC profiles"
  on public.agents for select
  to authenticated
  using ( role = 'tc' );
