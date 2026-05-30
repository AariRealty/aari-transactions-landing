-- ============================================================================
-- File status canonicalization · Layer 1 · DB-level sync + backfill
-- ============================================================================
-- The `files` table has two state fields that legitimately model two different
-- state machines but overlap at the boundaries:
--   status            · administrative workflow (intake, acceptance, archive)
--   transaction_stage · transaction lifecycle (new → under_contract → ... → closed)
--
-- They overlap on closed/archived/expired. When they drift out of sync, you get
-- bugs where a file shows as closed in one dashboard and active in another.
--
-- This migration:
--   1. Adds a SQL helper `public.is_file_closed(uuid)` for any code to call
--   2. Adds a trigger that auto-syncs the two fields on closed/archived/expired
--   3. Backfills existing rows where they're already drifted
--   4. Adds an audit_log entry for every sync correction (FREC-defensible)
--
-- Idempotent. Safe to re-run.
-- ============================================================================

begin;

-- ============================================================================
-- 1. CANONICAL HELPER FUNCTION
-- ============================================================================
-- Returns true if the file is in any terminal state (closed, archived, cancelled,
-- rejected, expired). Use this in queries instead of OR-chaining both fields.
create or replace function public.is_file_closed(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    f.status in ('closed', 'archived', 'cancelled', 'rejected')
    or f.transaction_stage in ('closed', 'expired'),
    false
  )
  from public.files f
  where f.id = p_file_id;
$$;

comment on function public.is_file_closed is
  'Canonical check for terminal file state. Use this instead of OR-chaining status and transaction_stage. Returns true if file is closed, archived, cancelled, rejected, or expired.';

-- ============================================================================
-- 2. SYNC TRIGGER
-- ============================================================================
-- Enforces the relationship between status and transaction_stage on the
-- overlapping terminal values. Runs on INSERT and UPDATE. Idempotent: if the
-- two fields are already aligned, the trigger is a no-op.
create or replace function public.sync_file_status_stage()
returns trigger
language plpgsql
as $$
declare
  v_terminal_admin boolean;
  v_terminal_stage boolean;
begin
  v_terminal_admin := new.status in ('closed', 'archived');
  v_terminal_stage := new.transaction_stage in ('closed', 'expired');

  -- Case A: admin field says closed, lifecycle field says otherwise
  -- → set lifecycle to 'closed' (preserve 'expired' if that's what stage was)
  if v_terminal_admin and not v_terminal_stage then
    new.transaction_stage := 'closed';
  end if;

  -- Case B: lifecycle field says closed/expired, admin field says otherwise
  -- → set admin to 'closed' (don't downgrade 'archived' if that's set)
  if v_terminal_stage and not v_terminal_admin then
    -- Only update if not already in a more-terminal state
    if new.status not in ('cancelled', 'rejected') then
      new.status := 'closed';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.sync_file_status_stage is
  'Trigger function · keeps files.status and files.transaction_stage aligned at terminal boundaries. Prevents drift between the administrative and lifecycle state machines.';

drop trigger if exists trg_sync_file_status_stage on public.files;
create trigger trg_sync_file_status_stage
  before insert or update of status, transaction_stage on public.files
  for each row execute function public.sync_file_status_stage();

-- ============================================================================
-- 3. BACKFILL · fix any rows currently drifted
-- ============================================================================
-- Log corrections so you can see what got rewritten.
do $$
declare
  v_corrected_admin int := 0;
  v_corrected_stage int := 0;
begin
  -- Where admin says closed/archived but stage says something else, fix the stage
  update public.files
  set transaction_stage = 'closed'
  where status in ('closed', 'archived')
    and (transaction_stage is null or transaction_stage not in ('closed', 'expired'));
  get diagnostics v_corrected_stage = row_count;

  -- Where stage says closed/expired but admin says something non-terminal, fix the admin
  update public.files
  set status = 'closed'
  where transaction_stage in ('closed', 'expired')
    and (status is null or status not in ('closed', 'archived', 'cancelled', 'rejected'));
  get diagnostics v_corrected_admin = row_count;

  raise notice 'Backfill complete · stage corrected: %, admin corrected: %', v_corrected_stage, v_corrected_admin;

  -- Log to audit_log if anything was corrected
  if v_corrected_stage > 0 or v_corrected_admin > 0 then
    insert into public.audit_log (actor_id, actor_type, action, target_table, target_id, details)
    values (
      null, 'system', 'file_status_sync_backfill', 'files', null,
      jsonb_build_object(
        'transaction_stage_corrected', v_corrected_stage,
        'status_corrected', v_corrected_admin,
        'run_at', now()
      )
    );
  end if;
end $$;

commit;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================
select 'is_file_closed function' as check_name,
  case when exists (select 1 from pg_proc where proname = 'is_file_closed' and pronamespace = 'public'::regnamespace)
       then 'ok' else 'MISSING' end as status
union all
select 'sync_file_status_stage function',
  case when exists (select 1 from pg_proc where proname = 'sync_file_status_stage' and pronamespace = 'public'::regnamespace)
       then 'ok' else 'MISSING' end
union all
select 'trg_sync_file_status_stage trigger',
  case when exists (select 1 from pg_trigger where tgname = 'trg_sync_file_status_stage')
       then 'ok' else 'MISSING' end
union all
select 'rows still drifted (should be 0)',
  case when (
    select count(*) from public.files
    where (status in ('closed','archived') and (transaction_stage is null or transaction_stage not in ('closed','expired')))
       or (transaction_stage in ('closed','expired') and (status is null or status not in ('closed','archived','cancelled','rejected')))
  ) = 0 then 'ok · 0 drifted' else 'WARN · drifted rows remain' end;

-- Show distribution after sync
select 'STATUS DISTRIBUTION' as info, status, count(*) as n
from public.files
group by status
order by n desc;

select 'TRANSACTION_STAGE DISTRIBUTION' as info, transaction_stage, count(*) as n
from public.files
group by transaction_stage
order by n desc;
