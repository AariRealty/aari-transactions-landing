-- Aari Transactions · Lead capture table
-- Stores anonymous email submissions from the exit-intent checklist popup.
-- One row per email (upsert on conflict). Tracks source + last-sent timestamp.

create table if not exists public.lead_captures (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'exit_intent_florida_checklist',
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

-- Index for source-based reporting (which capture surfaces convert).
create index if not exists lead_captures_source_idx on public.lead_captures (source);
create index if not exists lead_captures_created_at_idx on public.lead_captures (created_at desc);

-- RLS: anon clients can NOT read or write directly. Only the edge function
-- (which uses the service-role key via supabaseAdmin) can touch this table.
alter table public.lead_captures enable row level security;

-- No policies = no access from the anon role. Service role bypasses RLS.
-- If a future admin dashboard needs read access, add a policy for an "admin" role.
