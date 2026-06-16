-- Per-deal commission terms: a rate override + a flat bonus, stored on the file.
-- The 50/50 "company lead" split is already handled by files.splits (jsonb).
alter table public.files add column if not exists commission_pct numeric;          -- e.g. 3  (means 3%)
alter table public.files add column if not exists commission_flat_cents bigint;     -- flat commission, in cents (buyer-broker / fixed fee; totals with no sale price)
alter table public.files add column if not exists file_fee_cents bigint;            -- per-deal transaction fee override, in cents (default 499/299; e.g. 49500 = $495)
alter table public.files add column if not exists commission_bonus_cents bigint;   -- flat bonus, in cents (e.g. 300000 = $3,000)
alter table public.files add column if not exists brokerage_split_pct numeric;     -- % the AGENT KEEPS (default 100; 50 for company leads)
alter table public.files add column if not exists team_split_pct numeric;          -- team lead's % of the company's share (default 10)

comment on column public.files.commission_pct is 'Per-deal commission rate override (percent). NULL = fall back to the agent''s default rate.';
comment on column public.files.commission_bonus_cents is 'Flat commission bonus for this deal, in cents. Added on top of price x rate.';
comment on column public.files.brokerage_split_pct is 'Per-deal brokerage/company split (percent of commission). NULL = default 20 (50 for company leads).';
comment on column public.files.team_split_pct is 'Per-deal team-lead split (percent of the brokerage split). NULL = default 10.';
