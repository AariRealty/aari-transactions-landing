-- Aari Transactions · Files · agent-supplied document URLs (May 2026)
-- AP-9 · Lets agents attach Drive/Dropbox/external links to a file post-submission
-- via the portal's File Detail modal. Stored as a text array; real file uploads
-- to Supabase Storage are a separate task.

alter table public.files
  add column if not exists agent_document_urls text[] default '{}'::text[];

comment on column public.files.agent_document_urls
  is 'Agent-supplied external document URLs (Drive/Dropbox/etc) added after intake from the portal File Detail modal.';

-- If agent_notes column doesn't exist yet, add it. The intake form has used this name
-- as a textarea since rollout, so it may already be present — `add column if not exists` is safe.
alter table public.files
  add column if not exists agent_notes text;

comment on column public.files.agent_notes
  is 'Agent-supplied notes/updates for their TC, editable from the portal File Detail modal.';
