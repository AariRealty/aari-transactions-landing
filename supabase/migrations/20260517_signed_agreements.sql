-- ============================================================================
-- Aari Transactions · Signed Service Agreements (Section 6 · Task 6.4)
-- ============================================================================
-- Stores executed Service Agreements with full audit trail. One row per
-- (agent, file) execution. PDF lives in Supabase Storage; this table holds
-- the metadata + audit fields.
--
-- A DB trigger on tc_files INSERT calls the `generate-signed-agreement` edge
-- function which: loads the v4.6 source PDF, appends a signature certificate
-- page (typed name + date + IP + file id), uploads to storage, and chains
-- into `send-signed-agreement` to email both the broker and the agent.
-- ============================================================================

create table if not exists public.signed_agreements (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.tc_files(id) on delete set null,
  agreement_version text not null,
  typed_legal_name text not null,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  pdf_storage_path text,         -- Path within the signed-agreements bucket
  sent_to_agent_at timestamptz,
  sent_to_broker_at timestamptz,
  email_failure_reason text,     -- Populated if either email send failed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signed_agreements_agent_id_idx on public.signed_agreements (agent_id);
create index if not exists signed_agreements_file_id_idx on public.signed_agreements (file_id);
create index if not exists signed_agreements_signed_at_idx on public.signed_agreements (signed_at desc);

comment on table public.signed_agreements is 'Executed Aari Transactions Service Agreements. One row per (agent, file). PDF in storage bucket signed-agreements/.';
comment on column public.signed_agreements.pdf_storage_path is 'Path within signed-agreements bucket. Format: agreements/{agent_id}/{signed_agreement_id}.pdf';

-- Row Level Security
alter table public.signed_agreements enable row level security;

-- Agent can read their own
drop policy if exists "signed_agreements_agent_select_own" on public.signed_agreements;
create policy "signed_agreements_agent_select_own"
  on public.signed_agreements
  for select
  using (auth.uid() = agent_id);

-- Broker reads all (uses the is_broker() helper from 20260518_broker_impersonation.sql)
drop policy if exists "signed_agreements_broker_select_all" on public.signed_agreements;
create policy "signed_agreements_broker_select_all"
  on public.signed_agreements
  for select
  using (public.is_broker());

-- Service role inserts/updates (edge function uses service-role key)
-- Default permissive policy for service role is implicit when SECURITY DEFINER

-- Trigger to maintain updated_at
create or replace function public.tg_signed_agreements_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.signed_agreements;
create trigger set_updated_at
  before update on public.signed_agreements
  for each row execute function public.tg_signed_agreements_set_updated_at();

-- ============================================================================
-- Storage bucket: signed-agreements
-- ============================================================================
-- Create the bucket if it doesn't exist (private by default).
insert into storage.buckets (id, name, public)
values ('signed-agreements', 'signed-agreements', false)
on conflict (id) do nothing;

-- Storage policies: agent reads their own folder, broker reads all
drop policy if exists "signed_agreements_storage_agent_read" on storage.objects;
create policy "signed_agreements_storage_agent_read"
  on storage.objects for select
  using (
    bucket_id = 'signed-agreements'
    and (storage.foldername(name))[1] = 'agreements'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "signed_agreements_storage_broker_read" on storage.objects;
create policy "signed_agreements_storage_broker_read"
  on storage.objects for select
  using (
    bucket_id = 'signed-agreements'
    and public.is_broker()
  );

-- Only the edge function (service role) writes to this bucket. No public insert/update policy.
