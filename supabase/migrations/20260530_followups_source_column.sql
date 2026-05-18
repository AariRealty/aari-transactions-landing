-- ============================================================================
-- Aari Transactions · crm_followups_cache · add source column for manual entry
-- ============================================================================
-- Lets us reuse the same table for manual broker entries AND future Zapier
-- (or any other automated CRM source) without schema duplication.
--
-- Values:
--   'manual'  · broker added the entry from the briefing
--   'cloze'   · automated sync from Cloze (currently disabled)
--   'zapier'  · future · webhook receives Cloze activity via Zapier
-- ============================================================================

alter table public.crm_followups_cache
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'cloze', 'zapier'));

comment on column public.crm_followups_cache.source is
  'Where this follow-up came from. Future automated syncs (Zapier, Cloze direct) only delete rows where source != manual so user-entered rows stay safe.';

-- Allow the agent to insert/update/delete their own manual entries
drop policy if exists "crmcache_self_insert" on public.crm_followups_cache;
create policy "crmcache_self_insert"
  on public.crm_followups_cache for insert
  to authenticated
  with check (agent_id = auth.uid() and source = 'manual');

drop policy if exists "crmcache_self_update" on public.crm_followups_cache;
create policy "crmcache_self_update"
  on public.crm_followups_cache for update
  to authenticated
  using (agent_id = auth.uid() and source = 'manual')
  with check (agent_id = auth.uid() and source = 'manual');

drop policy if exists "crmcache_self_delete" on public.crm_followups_cache;
create policy "crmcache_self_delete"
  on public.crm_followups_cache for delete
  to authenticated
  using (agent_id = auth.uid() and source = 'manual');
