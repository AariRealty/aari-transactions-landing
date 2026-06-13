-- ============================================================================
-- APPLY ALL · Aari portal session migrations (June 13, 2026)
-- Paste into Supabase SQL editor and Run ONCE. Idempotent — safe to re-run.
-- Covers: file_agent_actions (+direction), membership_change_requests,
--         memberships stripe ids, file-documents bucket, file_share_links.
-- ============================================================================


-- ========== 20260613_file_agent_actions.sql ==========

-- ============================================================================
-- Aari Transactions · file_agent_actions (June 2026)
-- ============================================================================
-- The spine for the agent-portal "Action needed" hero (V1 · inverted black).
-- A TC raises a row when something genuinely lands in the AGENT's court mid-
-- transaction (sign an addendum, upload a doc, confirm a detail). The agent
-- portal reads OPEN rows for the agent's own files and flips the calm hero to
-- the black "Action needed" state. Marking it done flips the hero back to calm.
--
-- One row per ask (NOT one per file) so multiple/overlapping asks are tracked
-- and the history is auditable for compliance.
--
-- action_type values:
--   sign     · agent must sign a document the TC drafted
--   upload   · agent must send / upload a document
--   confirm  · agent must confirm a detail (number, date, name)
--   review   · agent must review + approve before the TC sends something
-- status values:
--   open       · live · drives the black hero
--   done       · satisfied · hero returns to calm
--   cancelled  · TC withdrew the ask
-- ============================================================================

create table if not exists public.file_agent_actions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  action_type text not null default 'review',
  label text not null,
  detail text,
  due_date date,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.file_agent_actions is
  'Agent-facing action requests raised by a TC/broker per file. Drives the agent portal "Action needed" hero. action_type: sign | upload | confirm | review. status: open | done | cancelled.';

create index if not exists idx_file_agent_actions_file
  on public.file_agent_actions (file_id);
create index if not exists idx_file_agent_actions_open
  on public.file_agent_actions (file_id, status);

alter table public.file_agent_actions enable row level security;

-- ---- Staff (TC / broker): full read + write ----
drop policy if exists faa_staff_select on public.file_agent_actions;
create policy faa_staff_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists faa_staff_insert on public.file_agent_actions;
create policy faa_staff_insert on public.file_agent_actions for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists faa_staff_update on public.file_agent_actions;
create policy faa_staff_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- ---- Agent: read + resolve actions on their OWN files ----
drop policy if exists faa_agent_select on public.file_agent_actions;
create policy faa_agent_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);

-- Agent may mark their own file's action done (e.g. a "confirm"), but cannot
-- create new asks. The WITH CHECK keeps the row tied to their own file.
drop policy if exists faa_agent_update on public.file_agent_actions;
create policy faa_agent_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
) with check (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);

-- ========== 20260613_file_agent_actions_direction.sql ==========

-- ============================================================================
-- Aari Transactions · file_agent_actions · add DIRECTION (June 2026)
-- ============================================================================
-- Makes the table two-way so all three portals connect both directions:
--   direction = 'to_agent' · TC/broker asks the agent (the black "Action needed"
--                            hero) — the original use, stays the default.
--   direction = 'to_tc'    · the AGENT raises a structured request to the TC
--                            (extend a date, addendum, adjust a term, cancel,
--                            other). Lands as a to-do in the TC cockpit; broker
--                            sees it across every agent.
-- One table, one spine, both directions — no free-text; every row is structured.
-- ============================================================================

alter table public.file_agent_actions
  add column if not exists direction text not null default 'to_agent';

comment on column public.file_agent_actions.direction is
  'to_agent = TC/broker → agent ask (Action-needed hero) · to_tc = agent → TC request (cockpit to-do)';

create index if not exists idx_file_agent_actions_dir
  on public.file_agent_actions (file_id, direction, status);

-- Agents may RAISE requests to the TC on their own files (direction must be to_tc).
-- They still cannot create to_agent asks against themselves.
drop policy if exists faa_agent_insert on public.file_agent_actions;
create policy faa_agent_insert on public.file_agent_actions for insert to authenticated with check (
  direction = 'to_tc'
  and exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);

-- ========== 20260613_membership_change_requests.sql ==========

-- ============================================================================
-- Aari Transactions · membership_change_requests (June 2026)
-- ============================================================================
-- The retention / save-flow spine. When an agent wants to pause, downgrade,
-- upgrade, or cancel, the portal does NOT mutate Stripe directly — it records a
-- request here and notifies the broker, who actions it in Stripe. This keeps a
-- human save touchpoint (the whole point) and avoids the UI ever falsely
-- claiming billing changed.
--
-- request_type:
--   pause_1 | pause_2 | pause_3 · pause for N months
--   downgrade | upgrade        · change tier
--   cancel                     · cancel at period end
-- status: pending | done | declined
-- ============================================================================

create table if not exists public.membership_change_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  reason text,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.membership_change_requests is
  'Agent-raised membership changes (pause/downgrade/upgrade/cancel) from the portal save flow. Broker actions them in Stripe. request_type: pause_1|pause_2|pause_3|downgrade|upgrade|cancel. status: pending|done|declined.';

create index if not exists idx_mcr_agent on public.membership_change_requests (agent_id, status);

alter table public.membership_change_requests enable row level security;

-- Agent: create + see their own requests.
drop policy if exists mcr_agent_insert on public.membership_change_requests;
create policy mcr_agent_insert on public.membership_change_requests for insert to authenticated with check (
  agent_id = auth.uid()
);
drop policy if exists mcr_agent_select on public.membership_change_requests;
create policy mcr_agent_select on public.membership_change_requests for select to authenticated using (
  agent_id = auth.uid()
);

-- Staff (TC / broker): read + update (mark done / declined).
drop policy if exists mcr_staff_select on public.membership_change_requests;
create policy mcr_staff_select on public.membership_change_requests for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists mcr_staff_update on public.membership_change_requests;
create policy mcr_staff_update on public.membership_change_requests for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- ========== 20260613_memberships_stripe_ids.sql ==========

-- ============================================================================
-- Aari Transactions · memberships · Stripe IDs (June 2026)
-- ============================================================================
-- Self-serve pause/downgrade/cancel needs to know WHICH Stripe subscription to
-- act on. These columns hold that link. They are populated by the Stripe
-- webhook on subscription create/update; existing members must be backfilled
-- once (map Stripe customer → agent and paste the IDs in).
-- ============================================================================

alter table public.memberships
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists idx_memberships_stripe_sub
  on public.memberships (stripe_subscription_id);

comment on column public.memberships.stripe_subscription_id is
  'Stripe subscription id · required for self-serve pause/downgrade/cancel via manage-subscription.';

-- ========== 20260613_file_share_links.sql ==========

-- ============================================================================
-- Aari Transactions · file_share_links (June 2026)
-- ============================================================================
-- Read-only client status links. The agent generates a non-guessable token and
-- texts it to their buyer/seller. The PUBLIC status page reads file milestones
-- through the `client-status` edge function (service role) — which whitelists
-- exactly what's exposed, so this table needs NO public/anon RLS. The token is
-- the only credential; it can expire and be revoked.
-- ============================================================================

create table if not exists public.file_share_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  token text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked boolean not null default false
);

create index if not exists idx_file_share_links_token on public.file_share_links (token);
create index if not exists idx_file_share_links_file on public.file_share_links (file_id);

comment on table public.file_share_links is
  'Read-only client status share links. Public status page reads via client-status edge fn (service role); the token is the only credential. expires_at + revoked control access.';

alter table public.file_share_links enable row level security;

-- Agent: manage links on their OWN files (create / view / revoke).
drop policy if exists fsl_agent_select on public.file_share_links;
create policy fsl_agent_select on public.file_share_links for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_share_links.file_id and f.agent_id = auth.uid())
);
drop policy if exists fsl_agent_insert on public.file_share_links;
create policy fsl_agent_insert on public.file_share_links for insert to authenticated with check (
  exists (select 1 from public.files f where f.id = file_share_links.file_id and f.agent_id = auth.uid())
);
drop policy if exists fsl_agent_update on public.file_share_links;
create policy fsl_agent_update on public.file_share_links for update to authenticated using (
  exists (select 1 from public.files f where f.id = file_share_links.file_id and f.agent_id = auth.uid())
);

-- Staff (TC / broker): full read + manage.
drop policy if exists fsl_staff_all on public.file_share_links;
create policy fsl_staff_all on public.file_share_links for all to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
) with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- ========== file-documents bucket + table + storage policies ==========

--   PART 3 · file-documents bucket + table + policies (agent "upload" flow)
--   PART 4 · verification (confirms the bucket + table exist)
-- ============================================================================


-- ============================================================================
-- PART 1 · file_agent_actions  (the two-way request spine)
-- ============================================================================
create table if not exists public.file_agent_actions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  action_type text not null default 'review',
  label text not null,
  detail text,
  due_date date,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.file_agent_actions is
  'Agent-facing action requests + agent→TC requests per file. action_type: sign | upload | confirm | review | extend_date | addendum | adjust_term | cancel | other. status: open | done | cancelled.';

create index if not exists idx_file_agent_actions_file on public.file_agent_actions (file_id);
create index if not exists idx_file_agent_actions_open on public.file_agent_actions (file_id, status);

alter table public.file_agent_actions enable row level security;

-- Staff (TC / broker): full read + write
drop policy if exists faa_staff_select on public.file_agent_actions;
create policy faa_staff_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists faa_staff_insert on public.file_agent_actions;
create policy faa_staff_insert on public.file_agent_actions for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists faa_staff_update on public.file_agent_actions;
create policy faa_staff_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- Agent: read + resolve actions on their OWN files
drop policy if exists faa_agent_select on public.file_agent_actions;
create policy faa_agent_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);
drop policy if exists faa_agent_update on public.file_agent_actions;
create policy faa_agent_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
) with check (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);


-- ============================================================================
-- PART 2 · direction column  (makes the table two-way)
--   to_agent = TC/broker → agent ask (default) · to_tc = agent → TC request
-- ============================================================================
alter table public.file_agent_actions
  add column if not exists direction text not null default 'to_agent';

comment on column public.file_agent_actions.direction is
  'to_agent = TC/broker → agent ask (Action-needed hero) · to_tc = agent → TC request (cockpit to-do)';

create index if not exists idx_file_agent_actions_dir
  on public.file_agent_actions (file_id, direction, status);

-- Agents may RAISE requests to the TC on their own files (direction must be to_tc)
drop policy if exists faa_agent_insert on public.file_agent_actions;
create policy faa_agent_insert on public.file_agent_actions for insert to authenticated with check (
  direction = 'to_tc'
  and exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);


-- ============================================================================
-- PART 3 · file-documents bucket + table + policies  (agent "upload" flow)
-- ============================================================================
-- 3a · Create the bucket if it doesn't exist (private — signed URLs only).
insert into storage.buckets (id, name, public)
values ('file-documents', 'file-documents', false)
on conflict (id) do nothing;

-- 3b · Table that records each uploaded document.
create table if not exists public.file_documents (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  uploaded_by uuid not null references public.agents(id) on delete restrict,
  filename text not null,
  storage_path text not null,
  content_type text,
  uploaded_at timestamptz not null default now()
);
create index if not exists file_documents_file_idx on public.file_documents (file_id);
create index if not exists file_documents_uploaded_by_idx on public.file_documents (uploaded_by);

alter table public.file_documents enable row level security;

drop policy if exists "Agents read own file documents" on public.file_documents;
create policy "Agents read own file documents" on public.file_documents for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Agents insert own file documents" on public.file_documents;
create policy "Agents insert own file documents" on public.file_documents for insert to authenticated with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Agents delete own file documents" on public.file_documents;
create policy "Agents delete own file documents" on public.file_documents for delete to authenticated using (
  uploaded_by = auth.uid()
  and exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Staff read all file documents" on public.file_documents;
create policy "Staff read all file documents" on public.file_documents for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists "Staff write file documents" on public.file_documents;
create policy "Staff write file documents" on public.file_documents for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- 3c · Storage object policies for the file-documents bucket.
drop policy if exists "Agents upload own folder" on storage.objects;
create policy "Agents upload own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Agents read own folder" on storage.objects;
create policy "Agents read own folder" on storage.objects for select to authenticated using (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Agents delete own folder" on storage.objects;
create policy "Agents delete own folder" on storage.objects for delete to authenticated using (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Staff read all file-documents bucket" on storage.objects;
create policy "Staff read all file-documents bucket" on storage.objects for select to authenticated using (
  bucket_id = 'file-documents'
  and exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);


-- ============================================================================

-- ========== VERIFY ==========
select 'file_share_links' t, count(*) from information_schema.tables where table_schema='public' and table_name='file_share_links'
union all select 'file_agent_actions', count(*) from information_schema.tables where table_schema='public' and table_name='file_agent_actions'
union all select 'membership_change_requests', count(*) from information_schema.tables where table_schema='public' and table_name='membership_change_requests';
