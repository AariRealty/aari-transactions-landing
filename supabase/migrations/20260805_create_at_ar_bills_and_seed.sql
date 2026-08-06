-- Aari Transactions · inter-company billing ledger (AR → AT)
-- Tracks TC services rendered by Aari Transactions to Aari Realty at the
-- internal negotiated rate (50% of the public catalog). Separate from
-- realty_invoices (agent plan fees) and payments (Stripe-processed) so
-- neither dashboard cross-contaminates the other.
--
-- Reconciles 1:1 with the AT_BILLED_SEED array on the Financial Hub side
-- (aari-financial-hub/index.html, IDs 1754344800001 through 1754344800021).
--
-- Applied to production 2026-08-05 via supabase apply_migration; row count
-- and totals verified: 21 rows, 18 paid ($900), 3 unpaid ($300 · Milennys
-- $100 + Eileen $200), AR ref-ID range 1754344800001–1754344800021.

create table if not exists public.at_ar_bills (
  id             uuid primary key default gen_random_uuid(),
  ar_ref_id      bigint unique,
  bill_date      date not null,
  tc_id          uuid references public.agents(id),
  tc_name        text,
  file_property  text,
  service_type   text not null check (service_type in ('file_organization','full_tc_buyer','full_tc_seller','full_tc_both')),
  amount         numeric(10,2) not null check (amount >= 0),
  status         text not null default 'unpaid' check (status in ('paid','unpaid','canceled')),
  paid_at        timestamptz,
  lifecycle_note text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists at_ar_bills_bill_date_idx on public.at_ar_bills (bill_date);
create index if not exists at_ar_bills_status_idx    on public.at_ar_bills (status);
create index if not exists at_ar_bills_tc_id_idx     on public.at_ar_bills (tc_id);

alter table public.at_ar_bills enable row level security;

drop policy if exists at_ar_bills_broker_all on public.at_ar_bills;
create policy at_ar_bills_broker_all on public.at_ar_bills
  for all using (public.is_broker()) with check (public.is_broker());

create or replace function public.tg_at_ar_bills_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_at_ar_bills_touch_updated_at on public.at_ar_bills;
create trigger trg_at_ar_bills_touch_updated_at
  before update on public.at_ar_bills
  for each row execute function public.tg_at_ar_bills_touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Seed · 21 rows. paid_at for paid rows is bill_date at 12:00 UTC
-- (approximation since exact payment date wasn't logged; source of truth is
-- status='paid'). Uses `on conflict (ar_ref_id) do nothing` so this migration
-- is safely re-runnable if the state ever needs to be rebuilt from source.
-- ────────────────────────────────────────────────────────────────────────────

insert into public.at_ar_bills (ar_ref_id, bill_date, tc_id, tc_name, file_property, service_type, amount, status, paid_at, lifecycle_note) values
(1754344800001, '2026-01-19', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '705 Harding Lane, Lehigh Acres',   'file_organization', 50.00, 'paid', '2026-01-19 12:00:00+00', null),
(1754344800002, '2026-03-19', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '1201 W 11th Street, Lehigh Acres', 'file_organization', 50.00, 'paid', '2026-03-19 12:00:00+00', null),
(1754344800003, '2026-04-23', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '2608 40th St W, Lehigh Acres',     'file_organization', 50.00, 'paid', '2026-04-23 12:00:00+00', null),
(1754344800004, '2026-04-27', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '4917 2nd Street',                  'file_organization', 50.00, 'paid', '2026-04-27 12:00:00+00', 'canceled #1'),
(1754344800005, '2026-04-27', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '4917 2nd Street',                  'file_organization', 50.00, 'paid', '2026-04-27 12:00:00+00', 'canceled #2'),
(1754344800006, '2026-04-27', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '4917 2nd St W',                    'file_organization', 50.00, 'paid', '2026-04-27 12:00:00+00', 'closed'),
(1754344800007, '2026-04-28', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '1109 Congress Avenue',             'file_organization', 50.00, 'paid', '2026-04-28 12:00:00+00', null),
(1754344800008, '2026-05-01', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '7896 1st Place',                   'file_organization', 50.00, 'paid', '2026-05-01 12:00:00+00', null),

(1754344800009, '2026-01-16', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '783 Pine Cone Avenue, Montura Ranches', 'file_organization', 50.00, 'paid',   '2026-01-16 12:00:00+00', null),
(1754344800010, '2026-02-09', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '1219 Hibiscus Avenue, Lehigh Acres',    'file_organization', 50.00, 'paid',   '2026-02-09 12:00:00+00', null),
(1754344800011, '2026-04-05', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '844 Bell Boulevard, Lehigh Acres',      'file_organization', 50.00, 'paid',   '2026-04-05 12:00:00+00', null),
(1754344800012, '2026-04-11', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '1912 NW 24th Avenue, Cape Coral',       'file_organization', 50.00, 'paid',   '2026-04-11 12:00:00+00', null),
(1754344800013, '2026-04-24', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '425 Fawnwood Avenue',                   'file_organization', 50.00, 'paid',   '2026-04-24 12:00:00+00', 'TC #1'),
(1754344800014, '2026-04-24', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '425 Fawnwood Avenue',                   'file_organization', 50.00, 'paid',   '2026-04-24 12:00:00+00', 'TC #2'),
(1754344800015, '2026-04-24', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '1219 Hibiscus Avenue',                  'file_organization', 50.00, 'paid',   '2026-04-24 12:00:00+00', 'canceled'),
(1754344800016, '2026-04-24', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '425 Fawnwood Avenue',                   'file_organization', 50.00, 'paid',   '2026-04-24 12:00:00+00', 'closed'),
(1754344800017, '2026-05-24', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '223 Lane Avenue',                       'file_organization', 50.00, 'paid',   '2026-05-24 12:00:00+00', null),
(1754344800018, '2026-06-18', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '3222 Deason Ave',                       'file_organization', 50.00, 'paid',   '2026-06-18 12:00:00+00', null),
(1754344800019, '2026-07-14', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '19183 NW 288th ST',                     'file_organization', 50.00, 'unpaid', null,                     null),
(1754344800020, '2026-07-17', 'f346659d-ea0c-40a0-b02f-e099cdb3cd41', 'Milennys Vargas', '1607 Roosevelt Ave',                    'file_organization', 50.00, 'unpaid', null,                     null)
on conflict (ar_ref_id) do nothing;

insert into public.at_ar_bills (ar_ref_id, bill_date, tc_id, tc_name, file_property, service_type, amount, status, paid_at, lifecycle_note, notes) values
(1754344800021, '2026-08-14', '9312836b-2bc3-46a2-8fb8-411b28e6a05f', 'Eileen Hernandez', '816 Frederick Reid St', 'full_tc_buyer', 200.00, 'unpaid', null, null, 'One-off Full TC (buyer side) — negotiated internal rate $200 (retail $400)')
on conflict (ar_ref_id) do nothing;

-- Validation · aborts (rolls back) if anything's off
do $$
declare n int; v numeric;
begin
  select count(*) into n from public.at_ar_bills;
  if n <> 21 then raise exception 'Expected 21 rows in at_ar_bills after seed, found %', n; end if;

  select count(*) into n from public.at_ar_bills where status = 'paid';
  if n <> 18 then raise exception 'Expected 18 paid rows, found %', n; end if;

  select count(*) into n from public.at_ar_bills where status = 'unpaid';
  if n <> 3 then raise exception 'Expected 3 unpaid rows, found %', n; end if;

  select sum(amount) into v from public.at_ar_bills where status = 'unpaid';
  if v <> 300.00 then raise exception 'Expected $300 total unpaid, found %', v; end if;

  select sum(amount) into v from public.at_ar_bills where status = 'unpaid' and tc_id = 'f346659d-ea0c-40a0-b02f-e099cdb3cd41';
  if v <> 100.00 then raise exception 'Expected $100 unpaid for Milennys, found %', v; end if;

  select sum(amount) into v from public.at_ar_bills where status = 'unpaid' and tc_id = '9312836b-2bc3-46a2-8fb8-411b28e6a05f';
  if v <> 200.00 then raise exception 'Expected $200 unpaid for Eileen, found %', v; end if;
end $$;
