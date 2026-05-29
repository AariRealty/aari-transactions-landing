-- ============================================================================
-- Aari Transactions · file_deadlines override fields (May 2026)
-- ============================================================================
-- When parties agree to extend a deadline (addendum, mutual agreement, force
-- majeure), the TC can override the computed date. The original (auto-calc)
-- date is preserved so we can offer a 'reset to default' and show the audit
-- trail ('extended from May 15 · reason').
--
-- Idempotent.
-- ============================================================================

alter table public.file_deadlines
  add column if not exists original_due_date date,
  add column if not exists override_reason text,
  add column if not exists extended_at timestamptz,
  add column if not exists extended_by uuid references auth.users(id) on delete set null;

comment on column public.file_deadlines.original_due_date is
  'The contract auto-computed date. Immutable once set. Powers reset-to-default and audit display.';
comment on column public.file_deadlines.override_reason is
  'Why the date was overridden (addendum, mutual agreement, force majeure, lender delay, etc.).';
comment on column public.file_deadlines.extended_at is
  'Timestamp of the most recent override.';
comment on column public.file_deadlines.extended_by is
  'TC/broker who recorded the most recent override.';
