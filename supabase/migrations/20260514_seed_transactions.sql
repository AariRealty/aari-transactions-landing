-- Aari Transactions · seed 3 closed compliance-review transactions (May 2026)
-- Source: aari-transactions.csv uploaded by Marlenyi on 2026-05-14
--
-- Rows imported:
--   TX-G01 · 4917 2nd St W, Lehigh Acres, FL 33971 · Alied Machuca · buyer side · closed
--   TX-G02 · 425 Fawnwood Ave, Lake Placid, FL · Milennys Vargas (Aari Realty) · buyer side · closed
--   TX-G03 · 425 Fawnwood Ave, Lake Placid, FL · Milennys Vargas · FLAGGED as possible duplicate of TX-G02
--
-- All 3 are Compliance Review services at $200 each, effective 2026-04-15, closed 2026-04-30,
-- compliance status "Approved" → broker_review_status='approved'.
--
-- Safety: this script uses ON CONFLICT DO NOTHING on property_address+closing_date so re-running
-- it won't create duplicate rows. The agent_id lookup matches by lower(first_name || last_name)
-- and inserts NULL agent_id if no matching agent is found (you can backfill later).

-- ───────────────────────────────────────────────────────────────────────────
-- TX-G01 · Alied Machuca · 4917 2nd St W, Lehigh Acres
-- ───────────────────────────────────────────────────────────────────────────
insert into public.files (
  id, property_address, status, service_type, transaction_side,
  agent_id, closing_date, created_at, updated_at, broker_review_status
)
select
  gen_random_uuid(),
  '4917 2nd St W, Lehigh Acres, FL 33971',
  'closed',
  'compliance_review',
  'buyer',
  (select id from public.agents where lower(first_name)='alied' and lower(last_name)='machuca' limit 1),
  '2026-04-30'::date,
  '2026-04-15T00:00:00Z'::timestamptz,
  now(),
  'approved'
where not exists (
  select 1 from public.files
  where property_address = '4917 2nd St W, Lehigh Acres, FL 33971'
    and closing_date = '2026-04-30'::date
);

-- ───────────────────────────────────────────────────────────────────────────
-- TX-G02 · Milennys Vargas · 425 Fawnwood Ave, Lake Placid
-- ───────────────────────────────────────────────────────────────────────────
insert into public.files (
  id, property_address, status, service_type, transaction_side,
  agent_id, closing_date, created_at, updated_at, broker_review_status
)
select
  gen_random_uuid(),
  '425 Fawnwood Ave, Lake Placid, FL',
  'closed',
  'compliance_review',
  'buyer',
  (select id from public.agents where lower(first_name)='milennys' and lower(last_name)='vargas' limit 1),
  '2026-04-30'::date,
  '2026-04-15T00:00:00Z'::timestamptz,
  now(),
  'approved'
where not exists (
  select 1 from public.files
  where property_address = '425 Fawnwood Ave, Lake Placid, FL'
    and closing_date = '2026-04-30'::date
);

-- ───────────────────────────────────────────────────────────────────────────
-- TX-G03 · FLAGGED AS POSSIBLE DUPLICATE of TX-G02 (same address, same agent, same dates)
-- Commented out by default. Uncomment ONLY if you confirm this is a separate transaction
-- (e.g., different side or different deal that happened to share the property).
-- ───────────────────────────────────────────────────────────────────────────
-- insert into public.files (
--   id, property_address, status, service_type, transaction_side,
--   agent_id, closing_date, created_at, updated_at, broker_review_status
-- )
-- values (
--   gen_random_uuid(),
--   '425 Fawnwood Ave, Lake Placid, FL (TX-G03)',
--   'closed',
--   'compliance_review',
--   'buyer',
--   (select id from public.agents where lower(first_name)='milennys' and lower(last_name)='vargas' limit 1),
--   '2026-04-30'::date,
--   '2026-04-15T00:00:00Z'::timestamptz,
--   now(),
--   'approved'
-- );
