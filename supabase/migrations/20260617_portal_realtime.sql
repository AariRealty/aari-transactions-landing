-- ============================================================================
-- Aari Transactions · Agent portal Item 1 (June 2026)
-- ============================================================================
-- 1 · files.updated_at — powers the "updated X ago" sub-line on agent file
--     cards. Touch trigger bumps it on every update (stage moves, checklist
--     saves, EMD changes — anything).
-- 2 · Realtime — adds files to the supabase_realtime publication so the
--     agent portal's live subscription receives stage changes instantly.
--     RLS still applies: agents only receive their own rows.
-- Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.tg_files_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_files_touch_updated_at on public.files;
create trigger trg_files_touch_updated_at
  before update on public.files
  for each row execute function public.tg_files_touch_updated_at();

-- Realtime publication (no-op if already added)
do $$
begin
  alter publication supabase_realtime add table public.files;
exception when duplicate_object then
  null;
end $$;
