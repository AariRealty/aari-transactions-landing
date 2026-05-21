-- Aari Transactions · TC pay requests (digital invoices)
-- Eileen/Milennys submit pay requests · Broker (Marlenyi) approves and marks paid.
-- Run ONCE in Supabase SQL editor.
--
-- Created: May 2026

create table if not exists public.pay_requests (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  tc_id uuid not null references public.agents(id) on delete cascade,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.agents(id),
  paid_at timestamptz,
  paid_by uuid references public.agents(id),
  status text not null default 'pending' check (status in ('pending','approved','disputed','held','paid')),
  files jsonb not null,
  total_pay numeric(10,2) not null,
  total_revenue numeric(10,2) not null,
  notes text,
  dispute_reason text,
  updated_at timestamptz default now()
);

create index if not exists pay_requests_tc_idx on public.pay_requests(tc_id);
create index if not exists pay_requests_status_idx on public.pay_requests(status);
create index if not exists pay_requests_submitted_idx on public.pay_requests(submitted_at desc);

create or replace function public.pay_requests_touch_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists pay_requests_touch on public.pay_requests;
create trigger pay_requests_touch before update on public.pay_requests
  for each row execute function public.pay_requests_touch_updated_at();

alter table public.pay_requests enable row level security;

drop policy if exists "TC reads own pay requests" on public.pay_requests;
create policy "TC reads own pay requests" on public.pay_requests for select using (
  exists (select 1 from public.agents where agents.id = auth.uid() and agents.id = pay_requests.tc_id)
);

drop policy if exists "TC inserts own pay requests" on public.pay_requests;
create policy "TC inserts own pay requests" on public.pay_requests for insert with check (
  exists (select 1 from public.agents where agents.id = auth.uid() and agents.id = pay_requests.tc_id)
);

drop policy if exists "Broker reads all pay requests" on public.pay_requests;
create policy "Broker reads all pay requests" on public.pay_requests for select using (
  exists (select 1 from public.agents where agents.id = auth.uid() and agents.role = 'broker')
);

drop policy if exists "Broker updates all pay requests" on public.pay_requests;
create policy "Broker updates all pay requests" on public.pay_requests for update using (
  exists (select 1 from public.agents where agents.id = auth.uid() and agents.role = 'broker')
);

-- Auto-generate invoice number on insert: 2026-001, 2026-002, ...
create or replace function public.generate_invoice_no()
returns text as $$
declare
  yr text := to_char(now(), 'YYYY');
  num integer;
begin
  select coalesce(max(cast(split_part(invoice_no, '-', 2) as integer)), 0) + 1
  into num from public.pay_requests where invoice_no like yr || '-%';
  return yr || '-' || lpad(num::text, 3, '0');
end;
$$ language plpgsql;
