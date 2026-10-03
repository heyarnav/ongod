-- ============================================================================
-- on god. — 0011_checkout_drafts.sql
--
-- A server-side holding pen for a checkout that is halfway through proving an
-- email address.
--
-- The problem this exists to solve: the shopper's cart lives in localStorage
-- and the checkout form in sessionStorage. Both are per-browser, so the moment
-- the emailed confirmation link is opened anywhere else — Gmail's in-app
-- viewer, a phone, a private window, a different browser — both are gone, and
-- the shopper lands on a page telling them they have nothing to buy, holding
-- an intent worth real money. That is a lost sale, not a cosmetic glitch.
--
-- So the intent to buy is recorded on the server BEFORE the email goes out,
-- keyed by an opaque random token. That token is the only draft detail that
-- ever appears in a URL; no address, name, product or price travels in the
-- link, and the token is useless to anyone who did not receive the mail.
--
-- This holds no stock and creates no order. place_order() still runs only after
-- the shopper proceeds to payment, so an abandoned verification leaves a row
-- here that expires, and nothing else.
--
-- No RLS policies: only the service role (which bypasses RLS) touches this. An
-- anon-keyed client reads nothing and writes nothing. Same posture as 0008.
-- ============================================================================

create table if not exists public.checkout_drafts (
  id         uuid primary key default gen_random_uuid(),
  -- base64url of 32 random bytes. Opaque, unguessable, and the only draft
  -- detail that leaves the server in a URL.
  token      text not null unique,
  -- The address being proven. Matched against the session's email on restore,
  -- so possession of the token is not sufficient: the reader must also control
  -- the inbox.
  email      text not null,
  -- [{ productId, size, quantity }] as it stood when the link was sent.
  cart       jsonb not null default '[]'::jsonb,
  -- { name, phone, address1, address2, city, state, pincode }
  form       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists checkout_drafts_email_idx
  on public.checkout_drafts (email, created_at desc);
create index if not exists checkout_drafts_expires_idx
  on public.checkout_drafts (expires_at);

alter table public.checkout_drafts enable row level security;

comment on table public.checkout_drafts is
  'Pre-verification checkout drafts. Service-role only; holds no stock and creates no order.';

-- Rows past their deadline are dead weight and must never be readable, so
-- deletion is belt-and-braces: reads check expires_at regardless of whether
-- the row has been pruned yet.
create or replace function public.prune_checkout_drafts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.checkout_drafts where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.prune_checkout_drafts() from public, anon, authenticated;
grant execute on function public.prune_checkout_drafts() to service_role;
