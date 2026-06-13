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
