-- ============================================================================
-- Aari Transactions · Agent SMS triggers
-- ============================================================================
-- Two triggers on the files table that fire SMS notifications to the agent
-- via pg_net + the invoke_edge_function helper.
--
--   1. trg_fire_file_submitted_sms · fires AFTER INSERT on files
--      → calls send-file-submitted-sms-to-agent
--   2. trg_fire_broker_escalation_sms · fires AFTER UPDATE of status
--      where new.status='awaiting_broker_review'
--      → calls send-broker-escalation-sms-to-agent
--
-- Both call invoke_edge_function (defined in 20260524_auto_fire_assignment_sms.sql).
-- pg_net is async + non-blocking — SMS failures never abort the row write.
-- ============================================================================

-- 1) SUBMITTED · fires on every file insert
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


-- 2) BROKER ESCALATION · fires when status flips TO awaiting_broker_review
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
