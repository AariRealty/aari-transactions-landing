-- ============================================================================
-- Aari Transactions · file_verifications (May 2026)
-- ============================================================================
-- Tracks per-file contract verification status for the TC checklist in
-- /files.html. One row per (file_id, verification_key). Stores the human
-- answer (status + value + notes) — the checklist config (questions, defaults,
-- conditional logic) lives in JS so adding new items doesn't require a
-- migration.
--
-- status values:
--   pending       · TC hasn't reviewed this item yet
--   needs_action  · TC found that something must be requested or fixed
--   confirmed     · verified · captured the value
--   na            · not applicable to this file (e.g., loan items on a cash deal)
-- ============================================================================

create table if not exists public.file_verifications (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  verification_key text not null,
  status text not null default 'pending',
  value text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  unique (file_id, verification_key)
);

comment on table public.file_verifications is
  'TC contract verification status per file. One row per (file_id, verification_key). status: pending | needs_action | confirmed | na.';

create index if not exists idx_file_verifications_file
  on public.file_verifications (file_id);

alter table public.file_verifications enable row level security;

drop policy if exists fv_staff_select on public.file_verifications;
create policy fv_staff_select on public.file_verifications for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists fv_staff_upsert on public.file_verifications;
create policy fv_staff_upsert on public.file_verifications for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists fv_staff_update on public.file_verifications;
create policy fv_staff_update on public.file_verifications for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
