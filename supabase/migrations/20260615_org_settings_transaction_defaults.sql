-- Add all Transaction Defaults + Rental Defaults columns to org_settings
-- These were previously (incorrectly) stored on the agents table.
-- org_settings is a singleton row (id=1), broker-level settings.

alter table public.org_settings
  add column if not exists company_transaction_fee  text,
  add column if not exists retained_deposit_pct     text,
  add column if not exists conditional_termination  text,
  add column if not exists default_compensation     text,
  add column if not exists rental_cancellation_fee  text,
  add column if not exists rental_fee_basis         text,
  add column if not exists rental_fee_amount        text,
  add column if not exists default_signing_platform text;

-- Backfill sensible defaults
update public.org_settings
set
  company_transaction_fee  = coalesce(company_transaction_fee,  '$499'),
  retained_deposit_pct     = coalesce(retained_deposit_pct,     '50'),
  default_compensation     = coalesce(default_compensation,      '3%')
where id = 1;
