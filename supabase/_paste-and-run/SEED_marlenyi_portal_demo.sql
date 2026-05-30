-- ============================================================================
-- Seed Marlenyi's agent portal with test data
-- ============================================================================
-- 1. Assigns Eileen as TC on every file where Marlenyi is the agent.
-- 2. Seeds realistic activity (verifications confirmed, deadlines completed,
--    emails sent) so the agent portal shows real content.
--
-- Safe to re-run. Will not duplicate verifications or deadlines (uses
-- ON CONFLICT). Email sends will accumulate · clear with:
--   delete from file_email_sends where template_id like 'demo_%';
-- ============================================================================

do $$
declare
  v_marlenyi_id uuid;
  v_eileen_id uuid;
  v_file record;
  v_now timestamptz := now();
  v_files_updated int := 0;
  v_verifs_added int := 0;
  v_deadlines_added int := 0;
  v_emails_added int := 0;
  v_tmp int := 0;
begin

  -- ============================================================
  -- 1. Look up actor IDs
  -- ============================================================
  select id into v_marlenyi_id
  from public.agents
  where email = 'marlenyi@aarirealty.com'
  limit 1;

  if v_marlenyi_id is null then
    raise notice 'Marlenyi not found. Aborting.';
    return;
  end if;

  select id into v_eileen_id
  from public.agents
  where lower(first_name) like 'eileen%'
    and role in ('tc','broker')
  limit 1;

  if v_eileen_id is null then
    raise notice 'Eileen (role=tc or broker) not found. Aborting.';
    return;
  end if;

  raise notice 'Marlenyi: %  ·  Eileen: %', v_marlenyi_id, v_eileen_id;

  -- ============================================================
  -- 2. Assign Eileen as TC on every Marlenyi file
  -- ============================================================
  update public.files
     set assigned_tc_id = v_eileen_id,
         tc_accepted_at = coalesce(tc_accepted_at, v_now)
   where agent_id = v_marlenyi_id;

  get diagnostics v_files_updated = row_count;
  raise notice 'Files updated: %', v_files_updated;

  -- ============================================================
  -- 3. Seed verifications, deadlines, and emails for each file
  -- ============================================================
  for v_file in
    select id, transaction_stage, file_type, contract_type, effective_date, closing_date, status
      from public.files
     where agent_id = v_marlenyi_id
  loop
    -- ---------- Verifications ----------
    -- Insert 8 realistic confirmed verifications per file.
    insert into public.file_verifications (file_id, verification_key, status, value, confirmed_at, confirmed_by)
    values
      (v_file.id, 'parties_legal_names', 'confirmed', 'All captured', v_now - interval '12 days', v_eileen_id),
      (v_file.id, 'effective_date_captured', 'confirmed', 'Captured · per contract', v_now - interval '12 days', v_eileen_id),
      (v_file.id, 'closing_date_captured', 'confirmed', 'On calendar', v_now - interval '12 days', v_eileen_id),
      (v_file.id, 'earnest_money_receipted', 'confirmed', 'Receipted · escrow on file', v_now - interval '10 days', v_eileen_id),
      (v_file.id, 'title_ordered', 'confirmed', 'Ordered · file # on hand', v_now - interval '9 days', v_eileen_id),
      (v_file.id, 'seller_disclosure_delivered', 'confirmed', 'Delivered · signed', v_now - interval '9 days', v_eileen_id),
      (v_file.id, 'lender_contact_captured', 'confirmed', 'Captured · loan officer + processor', v_now - interval '8 days', v_eileen_id),
      (v_file.id, 'hoa_estoppel_ordered', 'confirmed', 'Ordered · turnaround flagged', v_now - interval '6 days', v_eileen_id)
    on conflict (file_id, verification_key) do nothing;

    get diagnostics v_tmp = row_count;
    v_verifs_added := v_verifs_added + v_tmp;

    -- ---------- Deadlines ----------
    -- Mark a few key deadlines completed. We use the file's effective_date + offsets,
    -- and only mark "completed" if the date is past.
    insert into public.file_deadlines (file_id, deadline_key, due_date, original_due_date, completed_at, completed_by, notes)
    values
      (v_file.id, 'init_deposit',
        coalesce(v_file.effective_date, current_date - 12) + 3,
        coalesce(v_file.effective_date, current_date - 12) + 3,
        v_now - interval '10 days', v_eileen_id, 'EM receipted within deposit days'),
      (v_file.id, 'loan_app',
        coalesce(v_file.effective_date, current_date - 12) + 5,
        coalesce(v_file.effective_date, current_date - 12) + 5,
        v_now - interval '8 days', v_eileen_id, 'Lender confirmed app submitted'),
      (v_file.id, 'inspection_end',
        coalesce(v_file.effective_date, current_date - 12) + 15,
        coalesce(v_file.effective_date, current_date - 12) + 15,
        case when coalesce(v_file.effective_date, current_date - 12) + 15 < current_date
             then v_now - interval '4 days' else null end,
        case when coalesce(v_file.effective_date, current_date - 12) + 15 < current_date
             then v_eileen_id else null end,
        'Inspection report received + forwarded to agent'),
      (v_file.id, 'title_evidence',
        coalesce(v_file.closing_date, current_date + 14) - 15,
        coalesce(v_file.closing_date, current_date + 14) - 15,
        case when coalesce(v_file.closing_date, current_date + 14) - 15 < current_date
             then v_now - interval '2 days' else null end,
        case when coalesce(v_file.closing_date, current_date + 14) - 15 < current_date
             then v_eileen_id else null end,
        'Title commitment delivered to all parties'),
      (v_file.id, 'closing',
        coalesce(v_file.closing_date, current_date + 14),
        coalesce(v_file.closing_date, current_date + 14),
        case when v_file.status = 'closed' or v_file.transaction_stage = 'closed'
             then coalesce(v_file.closing_date::timestamptz, v_now) else null end,
        case when v_file.status = 'closed' or v_file.transaction_stage = 'closed'
             then v_eileen_id else null end,
        'Closing date · time of essence')
    on conflict (file_id, deadline_key) do nothing;

    get diagnostics v_tmp = row_count;
    v_deadlines_added := v_deadlines_added + v_tmp;

    -- ---------- Email sends (TC actions on the file) ----------
    -- 6 demo email sends per file with realistic timing.
    insert into public.file_email_sends (file_id, template_id, sent_at, sent_by, recipient_email, recipient_role, status, stage)
    values
      (v_file.id, 'sale_new_agent_setup',         v_now - interval '14 days', v_eileen_id, 'marlenyi@aarirealty.com', 'agent', 'succeeded', 'new'),
      (v_file.id, 'sale_uc_master_open',          v_now - interval '12 days', v_eileen_id, 'title@example.com',       'multi', 'succeeded', 'under_contract'),
      (v_file.id, 'sale_uc_title_open',           v_now - interval '12 days', v_eileen_id, 'title@example.com',       'title', 'succeeded', 'under_contract'),
      (v_file.id, 'sale_uc_lender_open',          v_now - interval '11 days', v_eileen_id, 'lender@example.com',      'lender', 'succeeded', 'under_contract'),
      (v_file.id, 'sale_insp_scheduled',          v_now - interval '8 days',  v_eileen_id, 'marlenyi@aarirealty.com', 'agent', 'succeeded', 'inspection'),
      (v_file.id, 'sale_insp_report_received',    v_now - interval '4 days',  v_eileen_id, 'marlenyi@aarirealty.com', 'agent', 'succeeded', 'inspection');

    get diagnostics v_tmp = row_count;
    v_emails_added := v_emails_added + v_tmp;

    -- Extra emails for CTC + closed stages
    if v_file.transaction_stage in ('ctc','closed') or v_file.status = 'closed' then
      insert into public.file_email_sends (file_id, template_id, sent_at, sent_by, recipient_email, recipient_role, status, stage)
      values
        (v_file.id, 'sale_ctc_client_wire_warning', v_now - interval '3 days', v_eileen_id, 'buyer@example.com',       'client', 'succeeded', 'ctc'),
        (v_file.id, 'sale_ctc_master_confirmation', v_now - interval '2 days', v_eileen_id, 'title@example.com',       'multi',  'succeeded', 'ctc'),
        (v_file.id, 'sale_closed_master_done',      v_now - interval '1 days', v_eileen_id, 'title@example.com',       'multi',  'succeeded', 'closed'),
        (v_file.id, 'sale_closed_client_welcome_referral', v_now - interval '1 days', v_eileen_id, 'buyer@example.com','client', 'succeeded', 'closed');
      get diagnostics v_tmp = row_count;
      v_emails_added := v_emails_added + v_tmp;
    end if;

  end loop;

  raise notice '=========================';
  raise notice 'Seeding complete:';
  raise notice '  Files updated:       %', v_files_updated;
  raise notice '  Verifications added: %', v_verifs_added;
  raise notice '  Deadlines added:     %', v_deadlines_added;
  raise notice '  Email sends added:   %', v_emails_added;
  raise notice '=========================';

end $$;

-- ============================================================================
-- CONFIRMATION QUERIES
-- ============================================================================
select 'Files for Marlenyi assigned to Eileen' as check_name,
  count(*) as result
from public.files f
join public.agents m on m.id = f.agent_id and m.email = 'marlenyi@aarirealty.com'
join public.agents e on e.id = f.assigned_tc_id and lower(e.first_name) like 'eileen%';

select 'Total verifications on Marlenyi files' as check_name,
  count(*) as result
from public.file_verifications v
join public.files f on f.id = v.file_id
join public.agents m on m.id = f.agent_id and m.email = 'marlenyi@aarirealty.com';

select 'Total deadlines on Marlenyi files' as check_name,
  count(*) as result
from public.file_deadlines d
join public.files f on f.id = d.file_id
join public.agents m on m.id = f.agent_id and m.email = 'marlenyi@aarirealty.com';

select 'Total emails sent on Marlenyi files' as check_name,
  count(*) as result
from public.file_email_sends s
join public.files f on f.id = s.file_id
join public.agents m on m.id = f.agent_id and m.email = 'marlenyi@aarirealty.com';
