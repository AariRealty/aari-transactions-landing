-- ============================================================================
-- Aari Transactions · TC Email Templates (Section 8 · Task 8.4)
-- ============================================================================
-- Per-TC editable email templates. Each row is one named template owned by
-- one TC. The Kickoff Email is seeded for every existing TC.
--
-- Designed to be extended by 9.1 (TC email template library): add additional
-- template_key values (status_update, doc_request, closing_reminder, etc.)
-- without schema changes.
--
-- Merge tags supported (rendered in the TC cockpit UI):
--   {{agent_first_name}}    {{agent_last_name}}    {{agent_full_name}}
--   {{agent_email}}         {{agent_phone}}
--   {{file_address}}        {{file_id}}             {{closing_date}}
--   {{effective_date}}      {{inspection_period_end}}
--   {{tc_name}}             {{tc_title}}            {{tc_email}}
-- ============================================================================

create table if not exists public.tc_email_templates (
  id uuid primary key default gen_random_uuid(),
  tc_id uuid not null references public.agents(id) on delete cascade,
  template_key text not null,
  display_name text not null,
  subject text not null,
  body text not null,
  description text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tc_id, template_key)
);

create index if not exists tc_email_templates_tc_id_idx on public.tc_email_templates (tc_id);
create index if not exists tc_email_templates_key_idx on public.tc_email_templates (template_key);

comment on table public.tc_email_templates is 'Per-TC editable email templates. Section 8 Task 8.4 (kickoff) + Section 9 Task 9.1 (library).';
comment on column public.tc_email_templates.template_key is 'Stable key. Reserved: kickoff, status_update, doc_request, closing_reminder.';

-- updated_at trigger
create or replace function public.tg_tc_email_templates_set_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.tc_email_templates;
create trigger set_updated_at
  before update on public.tc_email_templates
  for each row execute function public.tg_tc_email_templates_set_updated_at();

-- RLS
alter table public.tc_email_templates enable row level security;

drop policy if exists "tc_templates_owner_select" on public.tc_email_templates;
create policy "tc_templates_owner_select"
  on public.tc_email_templates for select
  to authenticated
  using (tc_id = auth.uid() or public.is_broker());

drop policy if exists "tc_templates_owner_modify" on public.tc_email_templates;
create policy "tc_templates_owner_modify"
  on public.tc_email_templates for all
  to authenticated
  using (tc_id = auth.uid() or public.is_broker())
  with check (tc_id = auth.uid() or public.is_broker());

-- ============================================================================
-- Seed the Kickoff Email for every TC currently in the agents table
-- ============================================================================
insert into public.tc_email_templates (tc_id, template_key, display_name, subject, body, description)
select
  a.id,
  'kickoff',
  'Kickoff Email',
  'Welcome to your file at {{file_address}}',
  'Hi {{agent_first_name}},

I''m {{tc_name}} from Aari Transactions. I''ll be coordinating {{file_address}} from now through closing.

Here''s what''s on my radar for this file:

KEY DEADLINES
[Replace this line with the deadlines for this file — inspection, financing, title evidence, closing]

DOCUMENTS I NEED FROM YOU
[Replace this line with the required documents — disclosures, signed addenda, lender pre-approval, etc.]

WORKING TOGETHER
— Best way to reach me: reply to this email or call direct
— I''ll send weekly status updates and flag anything time-sensitive immediately
— Title, lender, and HOA will hear from me within 24 hours

If anything changes on the file or you have questions before closing, reply to this email or call me directly.

{{tc_name}}
{{tc_title}} · Aari Transactions
{{tc_email}}',
  'Sent after file assignment. Confirms receipt, lists deadlines + required docs, sets communication expectations.'
from public.agents a
where a.role in ('tc', 'broker')
on conflict (tc_id, template_key) do nothing;
