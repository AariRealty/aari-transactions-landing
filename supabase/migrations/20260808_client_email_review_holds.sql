-- ============================================================================
-- Aari Transactions · client email review-hold gate
-- ============================================================================
-- Marlenyi 2026-08-08 · beta-mode redirect for auto-emails to specific
-- client agents. While an agent is listed here, all auto-fire client emails
-- (nps request, day-3 review, tc reply, tc acceptance, introduction) get
-- redirected to redirect_to instead of landing in the agent's inbox. Manual
-- broker sends (broadcast, reply, welcome) are NOT gated · a human is
-- already in the loop.
--
-- First entry: Samantha Haringa. Marlenyi wants to review each auto-email
-- Samantha would receive for a few months before enabling live sends.
-- ============================================================================

create table if not exists public.client_email_review_holds (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  redirect_to text not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.agents(id)
);

comment on table public.client_email_review_holds is
  'Beta-mode review gate · while an agent is here, auto-fire client emails redirect to redirect_to instead of the agent. Delete a row to switch that agent to live sends.';

alter table public.client_email_review_holds enable row level security;

drop policy if exists holds_broker_all on public.client_email_review_holds;
create policy holds_broker_all on public.client_email_review_holds
  for all
  to authenticated
  using (public.is_broker())
  with check (public.is_broker());

-- Service role reads it from edge functions · no policy needed (service_role bypasses RLS).

grant select, insert, update, delete on public.client_email_review_holds to authenticated;

-- Seed Samantha
insert into public.client_email_review_holds (agent_id, redirect_to, reason)
select id, 'marlenyi@aarirealty.com', 'Beta review · Marlenyi approves each client email for a few months before enabling live sends.'
  from public.agents
  where lower(email) = 'samantha@samanthaharinga.com'
on conflict (agent_id) do update
  set redirect_to = excluded.redirect_to,
      reason = excluded.reason;
