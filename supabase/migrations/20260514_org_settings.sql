-- Aari Transactions · Org-level settings
-- Single-row table holding brokerage-wide configuration. Editable by broker only.

create table if not exists public.org_settings (
  id integer primary key default 1 check (id = 1),
  brand_name text not null default 'Aari Transactions',
  default_tc_inbox text not null default 'hello@aaritransactions.com',
  default_payout_one_side_cents integer not null default 0,
  default_payout_both_sides_cents integer not null default 0,
  default_payout_listing_cents integer not null default 0,
  friday_disbursement_enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.agents(id) on delete set null
);

-- Seed the singleton row
insert into public.org_settings (id) values (1)
on conflict (id) do nothing;

alter table public.org_settings enable row level security;

drop policy if exists "Staff read org settings" on public.org_settings;
create policy "Staff read org settings"
  on public.org_settings for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Broker writes org settings" on public.org_settings;
create policy "Broker writes org settings"
  on public.org_settings for update
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));
