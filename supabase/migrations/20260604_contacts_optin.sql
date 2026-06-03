-- ============================================================================
-- Aari Transactions · Opt-in contact book (June 2026)
-- ============================================================================
-- Agents/TCs CHOOSE to keep a buyer or seller contact for reuse via the
-- "Save this contact to my list for next time" checkbox on the intake.
-- Unchecked contacts are never written here — they live only inside the
-- file's raw_form_data. Upserts dedupe by (owner_id, email), so re-saving
-- an incomplete contact updates the existing record instead of duplicating.
--
-- This table is also the source Step 4's duplicate detection checks against.
-- RLS: owner sees/edits only their own contacts; broker (is_broker()) sees all.
-- Idempotent · safe to re-run.
-- ============================================================================

create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'buyer',          -- 'buyer' | 'seller'
  full_name   text not null default '',
  email       text not null,                          -- stored lowercase · dedupe key
  phone       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Dedupe key used by the intake's upsert (onConflict: 'owner_id,email').
create unique index if not exists contacts_owner_email_uq
  on public.contacts (owner_id, email);

alter table public.contacts enable row level security;

drop policy if exists contacts_owner_all on public.contacts;
create policy contacts_owner_all
  on public.contacts for all
  to authenticated
  using (owner_id = auth.uid() or public.is_broker())
  with check (owner_id = auth.uid() or public.is_broker());
