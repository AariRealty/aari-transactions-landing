-- ============================================================================
-- Aari Transactions · EMD tracking (June 2026 · Stage 3)
-- ============================================================================
-- One jsonb per file:
-- { "amount": "$5,000", "status": "pending|received|confirmed",
--   "additional_amount": "$2,500", "additional_status": "pending|received|confirmed" }
-- Due dates come from the deadline engine (emd_initial = E+3, emd_additional
-- = E+10, both FL-rolled, both tap-to-edit via deadline_overrides). "Overdue"
-- is computed at render (due date passed while still pending) — never stored,
-- so confirming late self-heals. Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists emd jsonb not null default '{}'::jsonb;
