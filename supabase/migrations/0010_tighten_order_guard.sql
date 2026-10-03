-- ============================================================================
-- on god. — 0010_tighten_order_guard.sql
--
-- Tightens guard_order_payment_columns().
--
-- 0007 permitted the write when `session_user = 'postgres'`. That is the wrong
-- identity to test. `session_user` is whoever CONNECTED, which on the pooled
-- connection is postgres no matter which role the session has switched to — so
-- the guard waved through any statement that merely happened to arrive over a
-- postgres connection, including one running as `authenticated`.
--
-- The identity that matters is `current_user`, which is the role the statement
-- is actually executing as:
--
--   current_user = 'postgres'        migrations and this file's own owner
--   role = 'service_role'            PostgREST admin calls, Control Room
--   current_user = 'authenticated'   a customer -> REFUSED
--
-- Nothing legitimate breaks. place_order(), expire_reservations() and
-- mark_order_paid() are SECURITY DEFINER owned by postgres, so inside them
-- current_user IS postgres and their own writes still go through — which is
-- exactly what the reservation test asserts.
-- ============================================================================

create or replace function public.guard_order_payment_columns()
returns trigger
language plpgsql
as $$
begin
  if current_setting('role', true) = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'ORDER_NOT_WRITABLE: orders are written by the database only'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_order_payment_columns() from public, anon, authenticated;