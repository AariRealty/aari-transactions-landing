-- ============================================================================
-- Aari Transactions · Signed Agreements · INSERT trigger wire
-- ============================================================================
-- Extends tg_tc_files_insert to also fire generate-signed-agreement when a
-- typed legal name is captured at file submission. The intake form posts
-- service_agreement_typed_name + service_agreement_timestamp + agreement
-- version as part of the tc_files insert (existing hidden fields).
--
-- Requires tc_files to have columns:
--   service_agreement_typed_name    text
--   service_agreement_version       text (default 'v4.6')
--   service_agreement_signed_at     timestamptz
--   service_agreement_ip            inet (optional, captured server-side)
--   service_agreement_user_agent    text (optional)
-- If any of these columns are missing in your schema, add them via a separate
-- migration. The trigger no-ops when typed_name is null so it stays safe.
-- ============================================================================

create or replace function public.tg_tc_files_insert()
returns trigger as $$
begin
  -- Always send the agent's intake confirmation
  perform public.call_edge_function(
    'send-intake-confirmation',
    jsonb_build_object('file_id', new.id, 'agent_id', new.agent_id)
  );

  -- If the agent already picked a TC at submission, notify the TC immediately
  -- (email + in-portal). If "No Preference," skip — the UPDATE trigger fires
  -- when the broker assigns later.
  if new.tc_assigned_id is not null then
    perform public.call_edge_function(
      'send-tc-new-file',
      jsonb_build_object('file_id', new.id, 'tc_id', new.tc_assigned_id)
    );
  end if;

  -- Task 6.4 · generate + store + email the executed Service Agreement
  -- Only fires when the intake captured a typed legal name (Step 4 was reached
  -- and the agent signed). Schema must include the typed_name column.
  if to_jsonb(new) ? 'service_agreement_typed_name'
     and (to_jsonb(new) ->> 'service_agreement_typed_name') is not null
     and length(to_jsonb(new) ->> 'service_agreement_typed_name') > 0 then
    perform public.call_edge_function(
      'generate-signed-agreement',
      jsonb_build_object(
        'agent_id', new.agent_id,
        'file_id', new.id,
        'typed_legal_name', to_jsonb(new) ->> 'service_agreement_typed_name',
        'agreement_version', coalesce(to_jsonb(new) ->> 'service_agreement_version', 'v4.6'),
        'signed_at', coalesce(to_jsonb(new) ->> 'service_agreement_signed_at', now()::text),
        'ip_address', to_jsonb(new) ->> 'service_agreement_ip',
        'user_agent', to_jsonb(new) ->> 'service_agreement_user_agent'
      )
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;
