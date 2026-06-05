-- ============================================================================
-- Aari Transactions · Blog subscriber check (June 2026)
-- ============================================================================
-- The footer capture posts to Netlify (unchanged — that list stays the email
-- pickup). This table is the queryable mirror so the site can recognize a
-- returning subscriber: type your email → already on the list → sent to the
-- blog instead of re-captured.
--
-- Access is RPC-only (security definer). No select policy exists, so the
-- subscriber list can never be read from the browser. The function returns
-- true if the email was already subscribed, false if it was just added.
-- Idempotent.
-- ============================================================================

create table if not exists public.blog_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.blog_subscribers enable row level security;
-- No policies on purpose: all reads/writes go through the RPC below.

create or replace function public.subscribe_blog(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(p_email));
  v_exists boolean;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  select exists(select 1 from public.blog_subscribers where email = v_email)
    into v_exists;
  if not v_exists then
    insert into public.blog_subscribers (email) values (v_email)
    on conflict (email) do nothing;
  end if;
  return v_exists;  -- true = already subscribed → send them to the blog
end;
$$;

revoke all on function public.subscribe_blog(text) from public;
grant execute on function public.subscribe_blog(text) to anon, authenticated;
