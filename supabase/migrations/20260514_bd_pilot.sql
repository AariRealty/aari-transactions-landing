-- Aari Transactions · BD Pilot tracking (Eileen's cockpit)
-- Normalizes the JSON blob into queryable tables so the broker can see
-- the BD pipeline from aari-crm.html.

-- ============================================================================
-- BD_CONTACTS · every prospect Eileen DMs, tracked through her stage funnel
-- ============================================================================
create table if not exists public.bd_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.agents(id) on delete cascade,
  name text not null,
  handle text,
  source text,
  stage text not null default 'Contacted' check (stage in (
    'Contacted', 'In Conversation', 'Added to AC', 'Hand Raise',
    'Discovery Booked', 'Signed', 'Not Interested'
  )),
  notes text,
  dm_sent_at timestamptz,
  last_touch_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bd_contacts_owner_idx on public.bd_contacts (owner_id);
create index if not exists bd_contacts_stage_idx on public.bd_contacts (stage);
create index if not exists bd_contacts_last_touch_idx on public.bd_contacts (last_touch_at desc);

alter table public.bd_contacts enable row level security;

drop policy if exists "BD owner reads own contacts" on public.bd_contacts;
create policy "BD owner reads own contacts"
  on public.bd_contacts for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
  );

drop policy if exists "BD owner writes own contacts" on public.bd_contacts;
create policy "BD owner writes own contacts"
  on public.bd_contacts for all
  to authenticated
  using (owner_id = auth.uid() or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'))
  with check (owner_id = auth.uid() or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));

-- ============================================================================
-- BD_DAILY_LOGS · per-day rollup of DMs sent, replies, discos booked, etc.
-- ============================================================================
create table if not exists public.bd_daily_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.agents(id) on delete cascade,
  log_date date not null,
  dms_sent integer not null default 0 check (dms_sent >= 0),
  replies integer not null default 0 check (replies >= 0),
  hand_raises integer not null default 0 check (hand_raises >= 0),
  discos_booked integer not null default 0 check (discos_booked >= 0),
  signed_files integer not null default 0 check (signed_files >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, log_date)
);

create index if not exists bd_daily_logs_owner_date_idx on public.bd_daily_logs (owner_id, log_date desc);

alter table public.bd_daily_logs enable row level security;

drop policy if exists "BD owner reads own logs" on public.bd_daily_logs;
create policy "BD owner reads own logs"
  on public.bd_daily_logs for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
  );

drop policy if exists "BD owner writes own logs" on public.bd_daily_logs;
create policy "BD owner writes own logs"
  on public.bd_daily_logs for all
  to authenticated
  using (owner_id = auth.uid() or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'))
  with check (owner_id = auth.uid() or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));
