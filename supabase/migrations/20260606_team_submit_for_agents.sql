-- ============================================================================
-- Aari Transactions · Team submits ON BEHALF of agents (June 2026)
-- ============================================================================
-- The intake now asks TCs/brokers "Submitting for?" and files the submission
-- under the CHOSEN AGENT's id (correct attribution for books + kanban), with
-- submitted_by_tc audit fields in raw_form_data. These policies let the team
-- (agents.role in tc/broker via is_aari_team()) write rows owned by an agent.
-- Policies are permissive (OR'd with existing ones) · idempotent.
-- ============================================================================

-- Team can INSERT files for any agent (agents keep inserting their own).
drop policy if exists files_team_insert_for_agents on public.files;
create policy files_team_insert_for_agents
  on public.files for insert
  to authenticated
  with check ( agent_id = auth.uid() or public.is_aari_team() );

-- Team can UPDATE any file (covers the 30-min self-fix on on-behalf files).
drop policy if exists files_team_update on public.files;
create policy files_team_update
  on public.files for update
  to authenticated
  using ( public.is_aari_team() )
  with check ( public.is_aari_team() );

-- Team can save/update contacts INTO an agent's address book on their behalf.
drop policy if exists agent_contacts_team_insert on public.agent_contacts;
create policy agent_contacts_team_insert
  on public.agent_contacts for insert
  to authenticated
  with check ( public.is_aari_team() );

drop policy if exists agent_contacts_team_update on public.agent_contacts;
create policy agent_contacts_team_update
  on public.agent_contacts for update
  to authenticated
  using ( public.is_aari_team() )
  with check ( public.is_aari_team() );
