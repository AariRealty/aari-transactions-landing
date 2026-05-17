-- ============================================================================
-- Aari Transactions · Agent Headshots Bucket
-- ============================================================================
-- Public bucket so headshot URLs can render in <img> tags without signed URLs.
-- Each agent owns their own subfolder; they can upload/replace/delete their
-- own headshot. Brokers can write to any agent's folder.
-- Path pattern: headshots/{agent_id}/{timestamp}.{ext}
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('headshots', 'headshots', true)
on conflict (id) do nothing;

-- Read · public (already enforced by public=true, no policy needed for select)

-- Insert / update / delete · agent owns their folder, broker overrides
drop policy if exists "headshots_agent_insert" on storage.objects;
create policy "headshots_agent_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1] = 'headshots'
    and (
      auth.uid()::text = (storage.foldername(name))[2]
      or public.is_broker()
    )
  );

drop policy if exists "headshots_agent_update" on storage.objects;
create policy "headshots_agent_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1] = 'headshots'
    and (
      auth.uid()::text = (storage.foldername(name))[2]
      or public.is_broker()
    )
  );

drop policy if exists "headshots_agent_delete" on storage.objects;
create policy "headshots_agent_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1] = 'headshots'
    and (
      auth.uid()::text = (storage.foldername(name))[2]
      or public.is_broker()
    )
  );
