-- Add company_transaction_fee to org_settings
-- This field was previously (incorrectly) mapped to the agents table.
-- It is a brokerage-level setting and belongs in org_settings.

alter table public.org_settings
  add column if not exists company_transaction_fee text;

-- Backfill: set the default value to match the UI placeholder
update public.org_settings set company_transaction_fee = '$395' where company_transaction_fee is null;
