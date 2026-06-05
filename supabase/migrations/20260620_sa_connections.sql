-- ============================================================================
-- Aari Transactions · Service Agreement connection fixes (June 2026 · Item 4)
-- ============================================================================
-- 1 · agents.agreement_pdf_path — pointer to the executed PDF in storage.
-- 2 · signed-agreements bucket (private) + read policies: agents see their
--     own executed agreement, staff see all. The PDF is uploaded by the
--     aari-sa-pdf-email function (service role) — no insert policy needed.
-- 3 · Profile-level submission gate: a file INSERT is blocked at the
--     DATABASE when the owning agent has never signed the Service Agreement.
--     Staff (tc/broker) submissions are exempt — their intake flow captures
--     the SA acknowledgment per file. Client code maps SA_NOT_SIGNED to a
--     friendly "Sign now" message.
-- Idempotent.
-- ============================================================================

alter table public.agents add column if not exists agreement_pdf_path text;

insert into storage.buckets (id, name, public)
values ('signed-agreements', 'signed-agreements', false)
on conflict (id) do nothing;

-- Agents read their own executed agreement ({agent_id}/sa_v...pdf).
drop policy if exists "signed_agreements_agent_read_own" on storage.objects;
create policy "signed_agreements_agent_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'signed-agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Staff read every executed agreement.
drop policy if exists "signed_agreements_staff_read_all" on storage.objects;
create policy "signed_agreements_staff_read_all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'signed-agreements'
    and exists (
      select 1 from public.agents a
      where a.id = auth.uid() and a.role in ('tc', 'broker')
    )
  );

-- ---- Profile-level SA gate · BEFORE INSERT on files ----
create or replace function public.tg_files_require_sa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_signed timestamptz;
begin
  -- Staff submissions (TC on-behalf, broker) are exempt — their intake flow
  -- captures the SA acknowledgment on the file itself.
  if auth.uid() is not null then
    select role into v_caller_role from public.agents where id = auth.uid();
    if v_caller_role in ('tc', 'broker') then
      return new;
    end if;
  end if;
  if new.agent_id is null then
    return new; -- ownerless inserts (system) are not the agent's act
  end if;
  select agreement_signed_at into v_signed
  from public.agents where id = new.agent_id;
  if v_signed is null then
    raise exception 'SA_NOT_SIGNED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_files_require_sa on public.files;
create trigger trg_files_require_sa
  before insert on public.files
  for each row execute function public.tg_files_require_sa();
