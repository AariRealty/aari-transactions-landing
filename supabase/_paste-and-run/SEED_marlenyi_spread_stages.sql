-- ============================================================================
-- Spread Marlenyi's active files across the 6 agent kanban stages
-- ============================================================================
-- Distributes Marlenyi's non-closed files round-robin across:
--   new · under_contract · inspection · remedy · appraisal · ctc
-- Skips files that are already closed/archived.
--
-- After this runs, every lane in /portal.html should have at least one card
-- (assuming you have 6+ active files).
-- ============================================================================

with stages as (
  select 'new'::text             as stage, 1 as ord union all
  select 'under_contract'::text  as stage, 2 union all
  select 'inspection'::text      as stage, 3 union all
  select 'remedy'::text          as stage, 4 union all
  select 'appraisal'::text       as stage, 5 union all
  select 'ctc'::text             as stage, 6
),
marlenyi as (
  select id from public.agents where email = 'marlenyi@aarirealty.com' limit 1
),
ranked as (
  select
    f.id as file_id,
    row_number() over (order by f.created_at desc) as rn
  from public.files f
  join marlenyi m on f.agent_id = m.id
  where coalesce(f.status,'') not in ('closed','archived')
    and coalesce(f.transaction_stage,'') not in ('closed','expired','cancelled')
)
update public.files
   set transaction_stage = s.stage
  from ranked r
  join stages s on s.ord = ((r.rn - 1) % 6) + 1
 where public.files.id = r.file_id;

-- Confirmation
select
  coalesce(transaction_stage,'(null)') as stage,
  count(*) as files
from public.files f
join public.agents a on a.id = f.agent_id
where a.email = 'marlenyi@aarirealty.com'
group by coalesce(transaction_stage,'(null)')
order by case coalesce(transaction_stage,'(null)')
  when 'new' then 1
  when 'under_contract' then 2
  when 'inspection' then 3
  when 'remedy' then 4
  when 'appraisal' then 5
  when 'ctc' then 6
  when 'closed' then 7
  else 99
end;
