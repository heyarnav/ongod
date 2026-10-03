-- ============================================================================
-- on god. — 0008_checkout_otp_throttle.sql
--
-- A throttle for checkout OTP requests.
--
-- Deliberately not a general rate-limit system. The one thing checkout needs
-- is "this address cannot drain the SMTP budget by asking again every second",
-- and Supabase's own limiter does not cover the aggregate case: five hundred
-- distinct addresses, one per request, is 500 emails from one visitor.
--
-- The email is stored HASHED. The table exists to slow down a spammer, and a
-- table of plaintext customer addresses is a liability that buys nothing here:
-- the same row can be matched against a hash computed at request time.
--
-- No RLS policies: only the service role (which bypasses RLS) ever touches
-- this, via the route. Enabling RLS with zero policies means an anon-keyed
-- client reads and writes nothing.
-- ============================================================================

create table if not exists public.checkout_otp_requests (
  id           uuid primary key default gen_random_uuid(),
  email_hash   text not null,
  ip_hash      text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists checkout_otp_requests_email_idx
  on public.checkout_otp_requests (email_hash, created_at desc);
create index if not exists checkout_otp_requests_ip_idx
  on public.checkout_otp_requests (ip_hash, created_at desc);

alter table public.checkout_otp_requests enable row level security;

comment on table public.checkout_otp_requests is
  'Rate-limit ledger for checkout OTP sends. Service-role only; emails stored hashed.';

-- Old rows are worthless once they can no longer affect a decision. This keeps
-- the table small without needing a cron or a trigger.
create or replace function public.prune_checkout_otp_requests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.checkout_otp_requests
   where created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.prune_checkout_otp_requests() from public, anon, authenticated;
grant execute on function public.prune_checkout_otp_requests() to service_role;