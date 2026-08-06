-- Fix · public.is_broker() is a stub that currently returns false (per its own comment,
-- the real implementation lives in 20260518_broker_impersonation.sql but that overwrite
-- didn't stick). My original at_ar_bills_broker_all policy used is_broker() so it
-- effectively blocked every SELECT and INSERT — the Realty Bills section in the broker's
-- Invoices tab rendered empty because the query returned zero rows even for Marlenyi.
--
-- Replaced with a direct role check against public.agents. Keeps behavior identical to
-- what other broker-only policies already do in this codebase, avoids touching is_broker()
-- itself in case some other policy depends on its current false-returning behavior.
--
-- Applied to production 2026-08-06.

drop policy if exists at_ar_bills_broker_all on public.at_ar_bills;

create policy at_ar_bills_broker_all on public.at_ar_bills
  for all
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'))
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));
