-- ============================================================================
-- Signup team capture · the agent names their team lead at registration.
-- This is the CONSENT signal (the agent indicates who may see their files).
-- It does NOT grant access — the broker reviews and creates the team_members
-- link (broker-confirmed model). Pairs with 20260613_teams.sql.
-- ============================================================================

alter table public.agents add column if not exists team_lead_email text;

-- Recreate handle_new_agent to also persist team_lead_email from signup metadata.
-- (Same body as 20260527130000_agent_sa_signature_fields.sql + one column.)
create or replace function public.handle_new_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
begin
  profile := coalesce(new.raw_user_meta_data->'agent_profile', '{}'::jsonb);

  if exists (select 1 from public.agents where id = new.id) then
    return new;
  end if;

  insert into public.agents (
    id, email, first_name, last_name, phone, role,
    license_number, license_state, license_expires_at,
    brokerage_name, brokerage_address,
    broker_name, broker_email, broker_phone,
    agreement_signed_at, agreement_version, agreement_typed_name,
    team_lead_email
  )
  values (
    new.id,
    new.email,
    coalesce(profile->>'first_name', new.raw_user_meta_data->>'first_name', 'Agent'),
    coalesce(profile->>'last_name',  new.raw_user_meta_data->>'last_name',  '-'),
    profile->>'phone',
    'agent',
    coalesce(profile->>'license_number', 'PENDING'),
    coalesce(profile->>'license_state', 'FL'),
    coalesce((profile->>'license_expires_at')::date, '2099-12-31'::date),
    coalesce(profile->>'brokerage_name', 'Pending'),
    profile->>'brokerage_address',
    coalesce(profile->>'broker_name', 'Pending'),
    coalesce(profile->>'broker_email', new.email),
    profile->>'broker_phone',
    nullif(profile->>'agreement_signed_at','')::timestamptz,
    nullif(profile->>'agreement_version',''),
    nullif(profile->>'agreement_typed_name',''),
    nullif(profile->>'team_lead_email','')
  );
  return new;
exception when others then
  raise warning 'handle_new_agent insert failed for user %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_agent();

-- Broker review query · agents who named a lead but aren't yet linked to a team:
--   select a.id, a.first_name, a.last_name, a.email, a.team_lead_email
--   from public.agents a
--   where a.team_lead_email is not null
--     and not exists (select 1 from public.team_members tm where tm.agent_id = a.id);
