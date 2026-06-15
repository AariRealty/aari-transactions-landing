-- Per-deal commission terms: a rate override + a flat bonus, stored on the file.
-- The 50/50 "company lead" split is already handled by files.splits (jsonb).
alter table public.files add column if not exists commission_pct numeric;          -- e.g. 3  (means 3%)
alter table public.files add column if not exists commission_bonus_cents bigint;   -- flat bonus, in cents (e.g. 300000 = $3,000)

comment on column public.files.commission_pct is 'Per-deal commission rate override (percent). NULL = fall back to the agent''s default rate.';
comment on column public.files.commission_bonus_cents is 'Flat commission bonus for this deal, in cents. Added on top of price x rate.';
