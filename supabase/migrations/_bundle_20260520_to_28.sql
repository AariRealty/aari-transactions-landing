-- ============================================================================
-- Aari Transactions · BUNDLE · 20260520 → 20260528
-- ============================================================================
-- Paste this entire file into Supabase SQL Editor in one shot. Every statement
-- is idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS), so it is
-- safe to re-run if something fails partway through.
--
-- Order matters · do not re-order sections:
--   20260520 · TC acceptance columns + file_tc_history + log trigger
--   20260521 · TC timeout sweep function + pg_cron schedule
--   20260522 · expand files.status check constraint
--   20260523 · sms_log table + agents.sms_opt_in + agents.phone
--   20260524 · pg_net + invoke_edge_function helper + assignment SMS trigger
--   20260525 · file-submitted + broker-escalation SMS triggers
--   20260526 · TC availability columns on agents
--   20260527 · emergency lane (priority columns + senior TC preference)
--   20260528 · Google Calendar tables + OAuth state cleanup
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 20260520 · TC Acceptance Workflow
-- ════════════════════════════════════════════════════════════════════════════

alter table public.files
  add column if not exists tc_accepted_at        timestamptz,
  add column if not exists tc_expected_start_at  timestamptz,
  add column if not exists tc_reassign_count     integer not null default 0;

comment on column public.files.tc_accepted_at is
  'Timestamp the TC clicked Accept · null until acceptance.';
comment on column public.files.tc_expected_start_at is
  'Start time the TC committed to when accepting. Drives the agent UI "starts at" copy.';
comment on column public.files.tc_reassign_count is
  'Number of times the agent has clicked Request Another TC. Capped at 3.';

create table if not exists public.file_tc_history (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references public.files(id) on delete cascade,
  tc_id           uuid references public.agents(id),
  event_type      text not null check (event_type in (
                    'assigned',
                    'accepted',
                    'declined',
                    'timeout',
                    'agent_reassigned',
                    'broker_escalated'
                  )),
  event_at        timestamptz not null default now(),
  expected_start_at timestamptz,
  decline_reason  text,
  metadata        jsonb default '{}'::jsonb,
  created_by      uuid references auth.users(id)
);

create index if not exists idx_file_tc_history_file
  on public.file_tc_history(file_id, event_at desc);
create index if not exists idx_file_tc_history_tc
  on public.file_tc_history(tc_id, event_at desc);

comment on table public.file_tc_history is
  'Audit log of every TC assignment event. Used by the cockpit timeline + broker compliance reporting.';

alter table public.file_tc_history enable row level security;

drop policy if exists "fth_agent_select" on public.file_tc_history;
create policy "fth_agent_select"
  on public.file_tc_history for select
  to authenticated
  using (
    exists (
      select 1 from public.files f
      where f.id = file_tc_history.file_id
        and (f.agent_id = auth.uid() or f.assigned_tc_id = auth.uid() or public.is_broker())
    )
  );

drop policy if exists "fth_system_insert" on public.file_tc_history;
create policy "fth_system_insert"
  on public.file_tc_history for insert
  to authenticated
  with check (
    exists (
      select 1 from public.files f
      where f.id = file_tc_history.file_id
        and (f.agent_id = auth.uid() or f.assigned_tc_id = auth.uid() or public.is_broker())
    )
  );

create or replace function public.log_file_tc_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.assigned_tc_id is not null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
    values (new.id, new.assigned_tc_id, 'assigned',
            jsonb_build_object('source', 'intake_submit'));
  elsif (tg_op = 'UPDATE' and new.assigned_tc_id is distinct from old.assigned_tc_id and new.assigned_tc_id is not null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
    values (new.id, new.assigned_tc_id, 'assigned',
            jsonb_build_object('source', 'reassignment',
                               'previous_tc_id', old.assigned_tc_id));
  end if;
  if (tg_op = 'UPDATE' and new.tc_accepted_at is not null and old.tc_accepted_at is null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, expected_start_at)
    values (new.id, new.assigned_tc_id, 'accepted', new.tc_expected_start_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_file_tc_change on public.files;
create trigger trg_log_file_tc_change
  after insert or update on public.files
  for each row
  execute function public.log_file_tc_change();


-- ════════════════════════════════════════════════════════════════════════════
-- 20260522 · Expand files.status check constraint (must run before 20260521)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.files drop constraint if exists files_status_check;

alter table public.files
  add constraint files_status_check check (status in (
    'intake_received',
    'awaiting_tc_acceptance',
    'tc_engaged',
    'awaiting_broker_review',
    'intake_paid',
    'awaiting_docs',
    'in_coordination',
    'awaiting_signatures',
    'pending_closing',
    'cleared_to_close',
    'closed',
    'archived'
  ));

comment on constraint files_status_check on public.files is
  'Enumerated status values for the file lifecycle. Updated 2026-05-22 to add the TC acceptance workflow statuses.';


-- ════════════════════════════════════════════════════════════════════════════
-- 20260526 · TC self-service availability (must run before 20260527)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.agents
  add column if not exists availability_status   text default 'available'
    check (availability_status in ('available', 'busy_until', 'off_today')),
  add column if not exists availability_until    timestamptz,
  add column if not exists availability_message  text;

comment on column public.agents.availability_status is
  'TC self-set availability. Drives the green/amber/red indicator on the intake picker.';
comment on column public.agents.availability_until is
  'When busy_until, this is the time the TC will be free. Auto-clears to available after this passes.';
comment on column public.agents.availability_message is
  'Optional override label shown to agents (e.g. "Back at 3 PM"). Falls back to status-based default.';

update public.agents
set availability_status = 'available'
where role = 'tc' and availability_status is null;


-- ════════════════════════════════════════════════════════════════════════════
-- 20260527 · Emergency Lane (priority columns + senior TC)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.files
  add column if not exists priority text not null default 'standard'
    check (priority in ('standard', 'emergency')),
  add column if not exists priority_reason text;

comment on column public.files.priority is
  'Routing tier. emergency = closings <= 7 days, routes to senior TCs first, gets badge in UI.';
comment on column public.files.priority_reason is
  'Human-friendly explanation of why this file is priority. Surfaces on the portal card.';

alter table public.agents
  add column if not exists is_senior_tc boolean not null default false;

comment on column public.agents.is_senior_tc is
  'When true, this TC is preferred for emergency files (closing <= 7 days). Manually flagged by broker.';

create or replace function public.set_priority_from_closing_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  days_to_close integer;
begin
  if new.closing_date is null then
    new.priority := coalesce(new.priority, 'standard');
    new.priority_reason := null;
    return new;
  end if;
  days_to_close := (new.closing_date - current_date);
  if days_to_close <= 7 and days_to_close >= 0 then
    new.priority := 'emergency';
    new.priority_reason := 'Closing in ' || days_to_close || ' day' ||
      case when days_to_close = 1 then '' else 's' end;
  else
    new.priority := 'standard';
    new.priority_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_priority_from_closing_date on public.files;
create trigger trg_set_priority_from_closing_date
  before insert or update of closing_date on public.files
  for each row
  execute function public.set_priority_from_closing_date();


-- ════════════════════════════════════════════════════════════════════════════
-- 20260521 + 20260527 · sweep_unaccepted_files (latest version)
-- (combined · 20260527's senior-TC preference supersedes 20260521's basic pick)
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

create or replace function public.sweep_unaccepted_files()
returns table (
  swept_file_id   uuid,
  outcome         text,
  next_tc_id      uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  picked_tc_id uuid;
begin
  for rec in
    select id, assigned_tc_id, service_type, created_at, priority
    from public.files
    where status in ('intake_received', 'awaiting_tc_acceptance')
      and tc_accepted_at is null
      and created_at < now() - interval '30 minutes'
      and created_at > now() - interval '7 days'
    order by
      case when priority = 'emergency' then 0 else 1 end,
      created_at asc
    limit 100
  loop
    if rec.assigned_tc_id is not null then
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, rec.assigned_tc_id, 'timeout',
              jsonb_build_object('minutes_since_assigned', 30,
                                 'priority', rec.priority,
                                 'reason', 'no_response_within_window'));
    end if;

    select a.id into picked_tc_id
    from public.agents a
    where a.role = 'tc'
      and coalesce(a.is_active, true) = true
      and (a.availability_status is null or a.availability_status != 'off_today')
      and a.id not in (
        select tc_id from public.file_tc_history
        where file_id = rec.id and tc_id is not null
      )
    order by
      case when rec.priority = 'emergency' and a.is_senior_tc then 0 else 1 end,
      case when a.availability_status = 'available' then 0 else 1 end,
      random()
    limit 1;

    if picked_tc_id is null then
      update public.files
      set status = 'awaiting_broker_review',
          assigned_tc_id = null
      where id = rec.id;
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, null, 'broker_escalated',
              jsonb_build_object('reason', 'all_tcs_exhausted',
                                 'priority', rec.priority));
      swept_file_id := rec.id;
      outcome := 'escalated_to_broker';
      next_tc_id := null;
      return next;
    else
      update public.files
      set assigned_tc_id = picked_tc_id,
          status = 'awaiting_tc_acceptance'
      where id = rec.id;
      swept_file_id := rec.id;
      outcome := 'reassigned';
      next_tc_id := picked_tc_id;
      return next;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.sweep_unaccepted_files() is
  'TC Acceptance Workflow · auto-reassigns unaccepted files after 30 minutes, preferring senior TCs for emergency files. Returns one row per file processed.';

do $$
begin
  perform cron.unschedule('tc-timeout-sweep');
exception when others then null;
end$$;

select cron.schedule(
  'tc-timeout-sweep',
  '*/5 * * * *',
  $$select public.sweep_unaccepted_files();$$
);


-- ════════════════════════════════════════════════════════════════════════════
-- 20260523 · sms_log + agents.sms_opt_in + agents.phone
-- ════════════════════════════════════════════════════════════════════════════

alter table public.agents
  add column if not exists sms_opt_in boolean not null default true,
  add column if not exists phone      text;

comment on column public.agents.sms_opt_in is
  'Agent opt-in flag for transactional SMS (TC acceptance pings, etc.). Default true · agent disables in profile to opt out.';
comment on column public.agents.phone is
  'Agent mobile number · used as the SMS recipient. E.164 preferred but the Quo helper normalizes 10-digit US.';

create table if not exists public.sms_log (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null default 'quo',
  to_phone              text not null,
  body                  text not null,
  status                text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id   text,
  error                 text,
  metadata              jsonb default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_sms_log_created_at on public.sms_log(created_at desc);
create index if not exists idx_sms_log_to_phone on public.sms_log(to_phone);

comment on table public.sms_log is
  'Outbound SMS audit log · every send attempt (success or failure) recorded for compliance + debugging.';

alter table public.sms_log enable row level security;

drop policy if exists "sms_log_broker_select" on public.sms_log;
create policy "sms_log_broker_select"
  on public.sms_log for select
  to authenticated
  using (public.is_broker());


-- ════════════════════════════════════════════════════════════════════════════
-- 20260524 · pg_net + invoke_edge_function helper + assignment-SMS trigger
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

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
  begin
    service_key := current_setting('app.settings.supabase_service_role_key', true);
    fn_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    service_key := null;
    fn_url := null;
  end;

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
  raise notice 'invoke_edge_function failed for %: %', fn_name, sqlerrm;
end;
$$;

create or replace function public.fire_tc_assignment_sms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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


-- ════════════════════════════════════════════════════════════════════════════
-- 20260525 · Agent SMS triggers (file-submitted + broker-escalation)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fire_file_submitted_sms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.invoke_edge_function(
    'send-file-submitted-sms-to-agent',
    jsonb_build_object('file_id', new.id)
  );
  return new;
exception when others then
  raise notice 'fire_file_submitted_sms failed for file %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_fire_file_submitted_sms on public.files;
create trigger trg_fire_file_submitted_sms
  after insert on public.files
  for each row
  execute function public.fire_file_submitted_sms();

create or replace function public.fire_broker_escalation_sms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.status = 'awaiting_broker_review'
    and (old.status is null or old.status is distinct from new.status)
  ) then
    perform public.invoke_edge_function(
      'send-broker-escalation-sms-to-agent',
      jsonb_build_object('file_id', new.id)
    );
  end if;
  return new;
exception when others then
  raise notice 'fire_broker_escalation_sms failed for file %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_fire_broker_escalation_sms on public.files;
create trigger trg_fire_broker_escalation_sms
  after update of status on public.files
  for each row
  execute function public.fire_broker_escalation_sms();


-- ════════════════════════════════════════════════════════════════════════════
-- 20260528 · Google Calendar tables + OAuth state cleanup
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.agent_google_calendar (
  agent_id       uuid primary key references public.agents(id) on delete cascade,
  google_email   text,
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz not null,
  scope          text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_agc_expires on public.agent_google_calendar(expires_at);

comment on table public.agent_google_calendar is
  'OAuth tokens for agents connected to Google Calendar. Access token auto-refreshed via refresh_token. RLS: agent reads/writes own row; service role full access for the callback function.';

alter table public.agent_google_calendar enable row level security;

drop policy if exists "agc_self_select" on public.agent_google_calendar;
create policy "agc_self_select" on public.agent_google_calendar
  for select to authenticated using (agent_id = auth.uid() or public.is_broker());

drop policy if exists "agc_self_delete" on public.agent_google_calendar;
create policy "agc_self_delete" on public.agent_google_calendar
  for delete to authenticated using (agent_id = auth.uid());

create table if not exists public.agent_google_oauth_state (
  state_id    uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_agos_created on public.agent_google_oauth_state(created_at);

alter table public.agent_google_oauth_state enable row level security;

create or replace function public.cleanup_google_oauth_state()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.agent_google_oauth_state where created_at < now() - interval '10 minutes';
$$;

do $$
begin
  perform cron.unschedule('google-oauth-state-cleanup');
exception when others then null;
end$$;

select cron.schedule(
  'google-oauth-state-cleanup',
  '*/15 * * * *',
  $$select public.cleanup_google_oauth_state();$$
);

-- ════════════════════════════════════════════════════════════════════════════
-- BUNDLE COMPLETE · verify by running these spot checks
-- ════════════════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns where table_name='files' and column_name in ('tc_accepted_at','priority','priority_reason','tc_reassign_count');
-- select column_name from information_schema.columns where table_name='agents' and column_name in ('sms_opt_in','phone','availability_status','is_senior_tc');
-- select table_name from information_schema.tables where table_name in ('file_tc_history','sms_log','agent_google_calendar','agent_google_oauth_state');
-- select jobname from cron.job where jobname in ('tc-timeout-sweep','google-oauth-state-cleanup');
