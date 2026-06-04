-- ============================================================================
-- Aari Transactions · Email automation repoint: tc_files → files (June 2026)
-- ============================================================================
-- The May 2026 email automation (intake confirmation, status-milestone pings,
-- closing review request) was wired to the LEGACY tc_files table — the V3
-- intake writes to `files`, so none of it has fired for new submissions.
-- This adds the columns the chain needs on `files` and mirrors the triggers.
-- The tc_files triggers stay untouched (legacy files keep working).
-- Companion function updates (read files-first): send-intake-confirmation,
-- send-tc-status-ping, send-review-request — redeploy those three.
-- Idempotent.
-- ============================================================================

-- Columns the review/closing chain expects.
alter table public.files add column if not exists closed_at timestamptz;
alter table public.files add column if not exists review_request_sent_at timestamptz;
alter table public.files add column if not exists review_token uuid not null default gen_random_uuid();

-- ---- INSERT · agent intake-confirmation email ----
create or replace function public.tg_files_email_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_edge_function(
    'send-intake-confirmation',
    jsonb_build_object('file_id', new.id, 'agent_id', new.agent_id)
  );
  return new;
exception when others then
  return new; -- email must never block a submission
end;
$$;

drop trigger if exists trg_files_email_insert on public.files;
create trigger trg_files_email_insert
  after insert on public.files
  for each row
  execute function public.tg_files_email_insert();

-- ---- UPDATE · status-milestone ping + closed_at stamp ----
create or replace function public.tg_files_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and coalesce(new.status,'') <> 'closed' then
    perform public.call_edge_function(
      'send-tc-status-ping',
      jsonb_build_object('file_id', new.id, 'new_status', new.status, 'previous_status', old.status)
    );
  end if;

  -- Closing: stamp closed_at · the daily review-request cron picks it up 24h later.
  if coalesce(new.status,'') = 'closed' and coalesce(old.status,'') <> 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_files_email_update on public.files;
create trigger trg_files_email_update
  before update on public.files
  for each row
  execute function public.tg_files_email_update();
