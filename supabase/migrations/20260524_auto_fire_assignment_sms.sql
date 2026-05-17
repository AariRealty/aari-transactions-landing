-- ============================================================================
-- Aari Transactions · Auto-fire assignment SMS on TC change
-- ============================================================================
-- When a file's assigned_tc_id changes (either initial assignment at submit
-- or reassignment from sweep / agent reassign), we want an SMS to fire to the
-- newly assigned TC asking for Y/N reply.
--
-- Using pg_net (Supabase's HTTP extension) inside a trigger so the SMS fires
-- automatically regardless of which code path set the column.
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- Helper · pulls the project ref + service role from Supabase Vault (or env)
-- so the trigger has the right URL + auth. If vault isn't set up, fallback
-- to hardcoded values via the project's URL pattern.
-- ----------------------------------------------------------------------------
create or replace function public.invoke_edge_function(fn_name text, body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  service_key text;
begin
  -- Project ref is part of the supabase URL. We resolve it via the env
  -- variable if exposed, else fall back to the known project subdomain.
  -- Supabase Postgres exposes `app.settings.supabase_url` and
  -- `app.settings.supabase_service_role_key` when configured.
  begin
    service_key := current_setting('app.settings.supabase_service_role_key', true);
    fn_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    service_key := null;
    fn_url := null;
  end;

  -- If app settings aren't configured (most common case), the function URL
  -- has to be inferred. Edge functions live at
  -- https://<project-ref>.supabase.co/functions/v1/<fn>
  -- This project ref is fnlrgmuvtgwzjsihqxcn (locked May 2026).
  if fn_url is null or fn_url = '' then
    fn_url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co';
  end if;

  perform net.http_post(
    url := fn_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', coalesce('Bearer ' || service_key, '')
    ),
    body := body
  );
exception when others then
  -- Swallow trigger errors so SMS hiccups never block a file write
  raise notice 'invoke_edge_function failed for %: %', fn_name, sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger · fires send-tc-assignment-sms on assigned_tc_id INSERT / UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.fire_tc_assignment_sms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fire only when there's actually a newly assigned TC and the file is in
  -- the acceptance window (status check) — skip already-accepted files,
  -- closed files, etc.
  if (
    new.assigned_tc_id is not null
    and (tg_op = 'INSERT' or new.assigned_tc_id is distinct from old.assigned_tc_id)
    and new.tc_accepted_at is null
    and (new.status = 'awaiting_tc_acceptance' or new.status = 'intake_received')
  ) then
    perform public.invoke_edge_function(
      'send-tc-assignment-sms',
      jsonb_build_object('file_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fire_tc_assignment_sms on public.files;
create trigger trg_fire_tc_assignment_sms
  after insert or update of assigned_tc_id on public.files
  for each row
  execute function public.fire_tc_assignment_sms();
