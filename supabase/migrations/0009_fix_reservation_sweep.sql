-- ============================================================================
-- on god. — 0009_fix_reservation_sweep.sql
--
-- Fixes a defect in 0007's expire_reservations().
--
-- The sweep selected `payment_status = 'PENDING'`. That is wrong: a customer
-- who fails a payment attempt lands the order in 'FAILED', at which point it
-- stops matching the sweep and holds its stock FOREVER. Failing a card and
-- then walking away is one of the most common ways an order exists, so this is
-- not a corner case — it is the normal shape of an abandoned checkout.
--
-- The correct predicate is "has a deadline, is unpaid, and is not already
-- cancelled". PAID is the only state that legitimately keeps stock committed.
-- REFUNDED is deliberately included: that stock was returned by hand, and the
-- order still shows an unpaid reservation on screen.
-- ============================================================================

drop index if exists public.orders_open_reservations_idx;

-- Rewritten so the index matches the predicate below.
create index if not exists orders_open_reservations_idx
  on public.orders (reservation_expires_at)
  where reservation_expires_at is not null
    and payment_status <> 'PAID'
    and status <> 'CANCELLED';

create or replace function public.expire_reservations(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item  record;
  v_count integer := 0;
begin
  for v_order in
    select o.*
    from public.orders o
    where o.reservation_expires_at is not null
      and o.reservation_expires_at < now()
      and o.payment_status <> 'PAID'
      and o.status <> 'CANCELLED'
    order by o.reservation_expires_at asc
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked          -- a webhook on this row wins; we move on
  loop
    -- Return exactly what was taken.
    for v_item in
      select oi.variant_id, oi.quantity
      from public.order_items oi
      where oi.order_id = v_order.id
    loop
      update public.product_variants
         set stock = stock + v_item.quantity
       where id = v_item.variant_id;
    end loop;

    update public.orders
       set status = 'CANCELLED',
           reservation_expires_at = null,   -- hold is gone; do not re-expire
           updated_at = now()
     where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_reservations(integer) from public, anon, authenticated;
grant execute on function public.expire_reservations(integer) to service_role;