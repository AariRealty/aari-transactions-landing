-- ============================================================================
-- Commission splits / co-agents on a file
-- ----------------------------------------------------------------------------
-- A file's primary owner is still agent_id. `splits` records the full credit
-- split when more than one agent shares the deal (co-buyer agent, company-lead
-- 50/50, etc.). Shape: jsonb array of { "agent_id": <uuid>, "pct": <number> }.
-- When splits is null/empty, the primary agent gets 100%. Pipeline and GCI in
-- the Production view divide by pct; the team total still counts the file once.
-- ============================================================================

alter table public.files add column if not exists splits jsonb;

comment on column public.files.splits is
  'Co-agent commission split: jsonb array of {agent_id, pct}. Null = primary agent 100%. Production divides pipeline/GCI by pct; team totals count the file once.';
