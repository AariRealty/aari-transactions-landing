-- ============================================================================
-- Aari Transactions · Cloze CRM sync cache
-- ============================================================================
-- Persists the result of the Cloze API pull so the briefing reads from a
-- fast indexed table instead of hitting Cloze on every page load.
--
-- The cloze-sync-contacts edge function refreshes this table every 15 min
-- via pg_cron. The briefing's Top 5 follow-ups queries this directly.
--
-- One row per Cloze contact per agent. We rebuild it on every sync (delete
-- agent's rows, insert fresh) to keep it simple. Cloze API is the source of
-- truth — no merge logic here.
-- ============================================================================

create table if not exists public.crm_followups_cache (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.agents(id) on delete cascade,
  cloze_contact_id    text not null,
  display_name        text not null,
  email               text,
  phone               text,
  last_touched_at     timestamptz,
  -- Heuristic temperature: hot | warm | active | partner
  -- Computed in the edge function based on last_touched_at + tags + stage.
  temperature         text not null default 'warm' check (temperature in ('hot','warm','active','partner')),
  -- Short human-readable reason: "12 days dark · buyer lead"
  why_text            text,
  -- Raw Cloze payload kept for debugging + future field mining
  raw                 jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_crmcache_agent_contact
  on public.crm_followups_cache(agent_id, cloze_contact_id);
create index if not exists idx_crmcache_agent_last_touch
  on public.crm_followups_cache(agent_id, last_touched_at asc);

comment on table public.crm_followups_cache is
  'Cloze contacts cache · refreshed every 15 min by cloze-sync-contacts edge function. Briefing Top 5 reads from here.';

alter table public.crm_followups_cache enable row level security;

drop policy if exists "crmcache_self_select" on public.crm_followups_cache;
create policy "crmcache_self_select"
  on public.crm_followups_cache for select
  to authenticated
  using (agent_id = auth.uid() or public.is_broker());

-- ----------------------------------------------------------------------------
-- Cron schedule · every 15 min the sync function refreshes the cache.
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('cloze-sync-contacts');
exception when others then null;
end$$;

select cron.schedule(
  'cloze-sync-contacts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/cloze-sync-contacts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.supabase_service_role_key', true), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
