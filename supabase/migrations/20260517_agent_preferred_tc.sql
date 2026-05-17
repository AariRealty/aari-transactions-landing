-- ============================================================================
-- Aari Transactions · Agent preferred TC (Section 5 · Task 5.2)
-- ============================================================================
-- Stores the agent's preferred TC so it auto-pre-selects on every new file
-- submission. Agent can override per-file. NULL means "no preference yet"
-- (first-time agent) and the Step 3 picker stays unselected.
--
-- Foreign key references public.tcs so a deleted/inactive TC doesn't leave
-- a broken pointer. On TC delete we set null rather than cascade so the
-- agent doesn't lose their account.
-- ============================================================================

alter table public.agents
  add column if not exists preferred_tc_id uuid;

-- Foreign key with ON DELETE SET NULL · only add if not already present
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'agents_preferred_tc_id_fkey'
      and table_name = 'agents'
  ) then
    alter table public.agents
      add constraint agents_preferred_tc_id_fkey
      foreign key (preferred_tc_id) references public.tcs(id) on delete set null;
  end if;
end $$;

comment on column public.agents.preferred_tc_id is
  'Agent''s preferred TC (Section 5 · Task 5.2). Auto-pre-selected on Step 3 of every new file submission. NULL = no preference yet. UUID "auto-assign" sentinel handled in JS, not stored here (use NULL for auto).';
