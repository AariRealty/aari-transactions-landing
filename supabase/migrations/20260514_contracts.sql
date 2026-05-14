-- Aari Transactions · Contracts module (Phase D real build · May 2026)
-- Two tables:
--   contracts_library  · master templates / standard forms (FR/Bar, AS-IS, addenda, disclosures)
--   file_contracts     · per-file signed docs (links library entry → specific transaction)
--
-- Schema decisions taken (Marlenyi to confirm in production use):
--   - URL-only storage · external_url points to Dotloop / DocuSign / Drive · no inline file storage
--   - retention_years column for DBPR 5-year rule · default 5
--   - Compliance flags: requires_initials, requires_witness
--   - Status enum on file_contracts: pending | signed | voided
--   - RLS: staff (tc, broker) can read/write all · agents read their own files' contracts only

-- ============================================================================
-- CONTRACTS LIBRARY · master templates the brokerage maintains
-- ============================================================================
create table if not exists public.contracts_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('master', 'addendum', 'disclosure', 'listing_agreement', 'buyer_agreement', 'other')),
  version text not null default '1.0',
  url text,
  retention_years integer not null default 5 check (retention_years >= 0),
  requires_initials boolean not null default false,
  requires_witness boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.agents(id) on delete set null
);

create index if not exists contracts_library_category_idx on public.contracts_library (category);
create index if not exists contracts_library_active_idx on public.contracts_library (active);
create index if not exists contracts_library_name_idx on public.contracts_library (lower(name));

alter table public.contracts_library enable row level security;

drop policy if exists "Staff read contracts library" on public.contracts_library;
create policy "Staff read contracts library"
  on public.contracts_library for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Staff write contracts library" on public.contracts_library;
create policy "Staff write contracts library"
  on public.contracts_library for all
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')))
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

-- Seed a few starter contracts (idempotent · only inserts when name not present)
insert into public.contracts_library (name, category, version, retention_years, requires_initials, notes)
select * from (values
  ('FR/Bar Contract (AS-IS)',        'master',             '2024.1', 5, true,  'Standard Florida Realtors / Florida Bar residential purchase contract, AS-IS version.'),
  ('FR/Bar Contract (Standard)',     'master',             '2024.1', 5, true,  'Standard Florida Realtors / Florida Bar residential purchase contract.'),
  ('Exclusive Listing Agreement',    'listing_agreement',  '2024.1', 5, true,  'Exclusive right-of-sale listing agreement.'),
  ('Exclusive Buyer Brokerage Agt',  'buyer_agreement',    '2024.1', 5, true,  'Exclusive buyer brokerage agreement.'),
  ('Seller Property Disclosure',     'disclosure',         '2024.1', 5, false, 'Seller''s real property disclosure statement.'),
  ('Lead-Based Paint Disclosure',    'disclosure',         '2024.1', 5, true,  'Required for properties built before 1978.'),
  ('Compensation Rider',             'addendum',           '2024.1', 5, false, 'Compensation rider — broker fee structure addendum.'),
  ('Inspection Response Addendum',   'addendum',           '2024.1', 5, false, 'Buyer response to inspection findings.'),
  ('Closing Date Extension',         'addendum',           '2024.1', 5, false, 'Mutual closing date extension addendum.'),
  ('HOA / Condo Rider',              'addendum',           '2024.1', 5, false, 'HOA / Condominium association disclosure rider.')
) as t(name, category, version, retention_years, requires_initials, notes)
where not exists (select 1 from public.contracts_library cl where cl.name = t.name);

-- ============================================================================
-- FILE_CONTRACTS · which contracts have been signed for which file
-- ============================================================================
create table if not exists public.file_contracts (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  contract_id uuid not null references public.contracts_library(id) on delete restrict,
  signed_at timestamptz,
  signers text[] default array[]::text[],
  external_url text,
  status text not null default 'pending' check (status in ('pending', 'signed', 'voided')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.agents(id) on delete set null
);

create index if not exists file_contracts_file_idx on public.file_contracts (file_id);
create index if not exists file_contracts_contract_idx on public.file_contracts (contract_id);
create index if not exists file_contracts_status_idx on public.file_contracts (status);

alter table public.file_contracts enable row level security;

drop policy if exists "Staff read file contracts" on public.file_contracts;
create policy "Staff read file contracts"
  on public.file_contracts for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Staff write file contracts" on public.file_contracts;
create policy "Staff write file contracts"
  on public.file_contracts for all
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')))
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

-- Agents read their own files' contracts (so it shows on their portal file detail)
drop policy if exists "Agents read own file contracts" on public.file_contracts;
create policy "Agents read own file contracts"
  on public.file_contracts for select
  to authenticated
  using (exists (select 1 from public.files f where f.id = file_contracts.file_id and f.agent_id = auth.uid()));
