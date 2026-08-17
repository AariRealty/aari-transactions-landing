-- ============================================================================
-- Aari Transactions · Schedule send-checkout-nudge every 30 minutes (2026-08-16)
-- ============================================================================
-- Fires at minute :05 and :35 to avoid the :00 cron stampede other schedules
-- concentrate on. Payload is empty; the function reads all state from the
-- files table (checkout_reminder_1_sent_at + checkout_reminder_2_sent_at).
-- ============================================================================

select cron.schedule(
  'send_checkout_nudge_every_30m',
  '5,35 * * * *',
  $$select public.call_edge_function('send-checkout-nudge', '{}'::jsonb)$$
);
