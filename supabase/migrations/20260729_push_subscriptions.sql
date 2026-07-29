-- ============================================================================
-- Aari Transactions · Web Push subscriptions
-- ============================================================================
-- Stores browser Push API subscriptions so send-web-push can fan out
-- lock-screen notifications when a website lead lands (or any other event
-- that wants a phone alert).
--
-- The client-side subscription flow already exists in files.html
-- (enablePhoneAlerts / save-push-subscription). This migration adds the
-- persistence layer that had been missing.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  -- The push endpoint URL is globally unique per subscription. If the same
  -- browser re-subscribes we just refresh the row instead of duplicating.
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users can see their own subscriptions (useful for a settings page later).
drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select using (user_id = auth.uid());

-- Users can delete their own subscriptions (e.g., "turn off phone alerts").
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- No client INSERT / UPDATE — only edge functions (service_role) write.

comment on table public.push_subscriptions is
  'Web Push API subscriptions keyed by browser endpoint. send-web-push reads this table to fan out lock-screen alerts to a given user.';
