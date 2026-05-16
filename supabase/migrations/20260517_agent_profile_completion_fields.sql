-- ============================================================================
-- Aari Transactions · Agent profile completion fields (Section 1 · Task 6)
-- ============================================================================
-- Backs the "Complete Your Profile" section in /portal. Each missing item gets
-- a dedicated Add button OR can be completed in one pass via Complete Full
-- Profile. Both paths write to the columns added here.
--
-- Columns intentionally nullable — completion percent is derived in JS.
-- ============================================================================

alter table public.agents
  add column if not exists on_team               text,
  add column if not exists greensheets_preference text,
  add column if not exists review_preference     text,
  add column if not exists social_facebook       text,
  add column if not exists social_instagram      text,
  add column if not exists birthday_month        smallint,
  add column if not exists birthday_day          smallint,
  add column if not exists closing_gift_preferences text,
  add column if not exists referral_source       text,
  add column if not exists notes                 text;

-- Guard ranges for the birthday fields
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'agents_birthday_month_range'
  ) then
    alter table public.agents
      add constraint agents_birthday_month_range
      check (birthday_month is null or (birthday_month between 1 and 12));
  end if;
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'agents_birthday_day_range'
  ) then
    alter table public.agents
      add constraint agents_birthday_day_range
      check (birthday_day is null or (birthday_day between 1 and 31));
  end if;
end $$;

comment on column public.agents.on_team is 'solo | team_leader | team_member';
comment on column public.agents.greensheets_preference is 'always | never | ask_per_file';
comment on column public.agents.review_preference is 'always | never | ask_per_file';
comment on column public.agents.closing_gift_preferences is 'Free-text agent preferences for closing gifts sent to clients';
comment on column public.agents.notes is 'Anything else the agent wants Aari to know';
