-- Aari Transactions · handle_new_agent trigger (May 2026)
-- Auto-creates public.agents row from auth.users metadata on every signup.
-- Before this trigger existed, signup created the auth user but no agent profile,
-- locking new users out of /portal with "Account exists but no agent profile found."

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

  -- Idempotent · skip if profile already exists for this user id.
  if exists (select 1 from public.agents where id = new.id) then
    return new;
  end if;

  insert into public.agents (
    id, email, first_name, last_name, phone, role,
    license_number, license_state, license_expires_at,
    brokerage_name, brokerage_address,
    broker_name, broker_email, broker_phone
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
    profile->>'broker_phone'
  );
  return new;
exception when others then
  -- Don't block signup if the profile insert fails. Log the error context
  -- in postgres logs so we can debug later. The agent can still sign in,
  -- and a manual backfill or trigger re-fire can resolve.
  raise warning 'handle_new_agent insert failed for user %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_agent();
