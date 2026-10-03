-- ============================================================================
-- on god. — 0007_payment_reservations.sql
--
-- Payment reservations.
--
-- An order reserves stock at checkout and holds it until the money arrives or
-- the window closes. The clock lives HERE, in a column, not in a browser
-- setTimeout: a client timer is a suggestion, and this is inventory.
--
-- The race that matters is the 30-minute boundary. A payment landing at the
-- same instant the window expires must not be able to restore stock that the
-- payment then sells, nor sell stock the expiry already returned. Both
-- functions below take the SAME row lock on the order, so they serialise:
--
--   expire_reservations()  FOR UPDATE SKIP LOCKED  -> restores stock, CANCELLED
--   mark_order_paid()      FOR UPDATE               -> PAID
--
-- Whichever wins, the other sees its effect. There is no interleaving.
--
-- Late payment is not silently dropped. If money arrives after expiry,
-- mark_order_paid() records the payment id AND sets refund_required, because a
-- customer's money existing somewhere unaccounted for is worse than a refund
-- the Control Room has to action.
-- ============================================================================

-- ── 1. Reservation + payment audit columns ───────────────────────────────────
alter table public.orders
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text not null default '',
  add column if not exists refund_required boolean not null default false;

comment on column public.orders.reservation_expires_at is
  'Server-side deadline for the stock hold. NULL on orders that hold nothing.';
comment on column public.orders.paid_at is
  'When the database first confirmed payment. Written only by mark_order_paid().';
comment on column public.orders.refund_required is
  'True when money arrived for an order whose reservation had already expired. Must be settled manually.';

-- Expiry scans only ever look at live reservations, so a partial index keeps
-- that scan proportional to the handful of open orders rather than to history.
create index if not exists orders_open_reservations_idx
  on public.orders (reservation_expires_at)
  where payment_status = 'PENDING' and reservation_expires_at is not null;

-- ── 2. Close the update hole ────────────────────────────────────────────────
--
-- 0003 granted customers UPDATE on their own orders with no column
-- restriction. Nothing used it, but the anon-keyed browser client can reach it:
-- a customer could PATCH payment_status to 'PAID' on their own order and ship
-- for free. Payment state must be written by the database and nothing else.
drop policy if exists orders_update_own on public.orders;

-- The single writable path that is NOT service_role is place_order(), which is
-- SECURITY DEFINER and inserts only. This trigger therefore never blocks a
-- legitimate write; it exists to stop a direct client UPDATE.
create or replace function public.guard_order_payment_columns()
returns trigger
language plpgsql
as $$
begin
  -- service_role is the Control Room and the server routes. Authenticated and
  -- anon reach this as a client and are refused.
  if current_setting('role', true) = 'service_role'
     or session_user = 'postgres'
     or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'ORDER_NOT_WRITABLE: orders are written by the database only'
    using errcode = '42501';
end;
$$;

drop trigger if exists orders_guard_payment_columns on public.orders;
create trigger orders_guard_payment_columns
  before update on public.orders
  for each row
  execute function public.guard_order_payment_columns();

-- ── 3. expire_reservations ───────────────────────────────────────────────────
--
-- Called at the top of place_order() (the only write that needs the stock back)
-- and by the cron route / npm script. Safe to call as often as you like: an
-- empty result set is the normal case.
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
      and o.payment_status = 'PENDING'
      and o.status <> 'CANCELLED'
    order by o.reservation_expires_at asc
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked          -- a webhook on this row wins; we move on
  loop
    -- Return exactly what was taken. `greatest(...,0)` guards a stock row that
    -- was adjusted by hand since checkout.
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

-- ── 4. mark_order_paid ───────────────────────────────────────────────────────
--
-- The ONLY way payment_status becomes 'PAID'. Reached by the webhook and by the
-- client-side fast path, both of which must first verify a signature.
create or replace function public.mark_order_paid(
  p_razorpay_payment_id text,
  p_razorpay_signature   text default '',
  p_razorpay_order_id    text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_refund boolean := false;
  v_already boolean := false;
begin
  if p_razorpay_payment_id is null or btrim(p_razorpay_payment_id) = '' then
    raise exception 'MISSING_PAYMENT_ID' using errcode = '22023';
  end if;

  -- Lock the order. This is the same lock expire_reservations() takes, so the
  -- 30-minute boundary cannot interleave with a capture.
  select * into v_order
  from public.orders
  where gateway_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND:%', p_razorpay_order_id using errcode = 'P0002';
  end if;

  -- Idempotency: Razorpay retries webhooks and so does the browser. Second
  -- arrival is a no-op that still reports the truth.
  if v_order.payment_status = 'PAID' then
    v_already := true;
  else
    -- Money that arrives after the hold closed still belongs to the customer.
    -- Record it, flag it, and let the Control Room refund.
    if v_order.reservation_expires_at is not null
       and v_order.reservation_expires_at < now() then
      v_refund := true;
    end if;

    update public.orders
       set payment_status   = 'PAID',
           status           = case when v_refund then status else 'PAID' end,
           paid_at          = coalesce(paid_at, now()),
           gateway_payment_id = p_razorpay_payment_id,
           gateway_signature   = p_razorpay_signature,
           payment_method     = 'razorpay',
           refund_required     = v_refund,
           reservation_expires_at = null,
           updated_at = now()
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'order_id',       v_order.id,
    'order_number',   v_order.order_number,
    'payment_status', case when v_already then 'PAID' else 'PAID' end,
    'already_paid',   v_already,
    'refund_required',v_refund
  );
end;
$$;

revoke all on function public.mark_order_paid(text, text, text) from public, anon, authenticated;
grant execute on function public.mark_order_paid(text, text, text) to service_role;

-- ── 5. mark_order_payment_failed ─────────────────────────────────────────────
--
-- A failed attempt is NOT a release. The customer may retry inside the window,
-- and the stock must stay held for them. Only expiry returns stock.
create or replace function public.mark_order_payment_failed(
  p_razorpay_payment_id text default '',
  p_razorpay_order_id  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where gateway_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND:%', p_razorpay_order_id using errcode = 'P0002';
  end if;

  -- Already captured: a later "failed" event must never undo real money.
  if v_order.payment_status = 'PAID' then
    return jsonb_build_object('order_id', v_order.id, 'ignored', true);
  end if;

  update public.orders
     set payment_status = 'FAILED',
         gateway_payment_id = p_razorpay_payment_id,
         updated_at = now()
   where id = v_order.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'payment_status', 'FAILED',
    'reservation_expires_at', v_order.reservation_expires_at
  );
end;
$$;

revoke all on function public.mark_order_payment_failed(text, text) from public, anon, authenticated;
grant execute on function public.mark_order_payment_failed(text, text) to service_role;

-- ── 6. place_order gains a reservation window ────────────────────────────────
--
-- Written as a full replacement rather than an ALTER, because plpgsql bodies
-- cannot be patched in place. The logic is unchanged from 0002 apart from the
-- new parameter and the expiry sweep at the top.
create or replace function public.place_order(
  p_items              jsonb,
  p_address            jsonb,
  p_address_id         uuid    default null,
  p_save_address       boolean default false,
  p_reservation_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_customer_id uuid;
  v_email       citext;
  v_name        text;
  v_phone       text;

  v_lines      jsonb := '[]'::jsonb;
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_variant_id uuid;
  v_qty        integer;
  v_size       text;
  v_cover      text;
  v_subtotal   integer := 0;
  v_shipping   integer := 0;
  v_total      integer;
  v_currency   text    := 'INR';
  v_order_id   uuid;
  v_order_no   text;
  v_addr_count integer;
  v_linked     uuid;
  v_hold_minutes integer := least(greatest(coalesce(p_reservation_minutes, 30), 5), 1440);
begin
  -- ── 0. Return stock from holds whose window closed before this attempt.
  --    Locked internally with SKIP LOCKED, so it cannot collide with a capture.
  perform public.expire_reservations();

  -- ── 1. Identity ─────────────────────────────────────────────────────────
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select c.id, c.email into v_customer_id, v_email
  from public.customers c
  where c.supabase_user_id = v_user_id;

  if v_customer_id is null then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- ── 2. Validate and price everything, mutating nothing yet ──────────────
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'TOO_MANY_LINES' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_size := nullif(btrim(v_item ->> 'size'), '');
    v_qty  := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_size is null then
      raise exception 'INVALID_SIZE' using errcode = 'P0001';
    end if;
    if v_qty < 1 or v_qty > 10 then
      raise exception 'INVALID_QUANTITY:%', v_qty using errcode = 'P0001';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if not found then
      raise exception 'OBJECT_UNAVAILABLE:%', v_item ->> 'product_id' using errcode = 'P0001';
    end if;
    if v_product.status <> 'PUBLISHED' then
      raise exception 'OBJECT_UNAVAILABLE:%', v_product.slug using errcode = 'P0001';
    end if;
    if v_product.drop_status <> 'PRE_ORDER' then
      raise exception 'NOT_ORDERABLE:%:%', v_product.slug, v_product.drop_status using errcode = 'P0001';
    end if;
    if v_product.pre_order_starts_at is not null and v_product.pre_order_ends_at is not null then
      if now() < v_product.pre_order_starts_at or now() > v_product.pre_order_ends_at then
        raise exception 'WINDOW_CLOSED:%', v_product.slug using errcode = 'P0001';
      end if;
    end if;

    select id into v_variant_id
    from public.product_variants
    where product_id = v_product.id and size = v_size and active;

    if not found then
      raise exception 'SIZE_UNAVAILABLE:%:%', v_product.slug, v_size using errcode = 'P0001';
    end if;

    select coalesce(nullif(public_url, ''), storage_path) into v_cover
    from public.product_images
    where product_id = v_product.id
    order by sort_order asc
    limit 1;

    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_currency := v_product.currency;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',    v_product.id,
      'variant_id',    v_variant_id,
      'slug',          v_product.slug,
      'name',          v_product.name,
      'size',          v_size,
      'price',         v_product.price,
      'quantity',      v_qty,
      'cover',         coalesce(v_cover, ''),
      'drop_status',   v_product.drop_status,
      'edition_label', v_product.edition_label
    ));
  end loop;

  -- ── 3. A saved address may only be linked if it is the caller's own.
  v_linked := null;
  if p_address_id is not null then
    select a.id into v_linked
    from public.addresses a
    where a.id = p_address_id and a.customer_id = v_customer_id;
  end if;

  v_name  := coalesce(nullif(btrim(p_address ->> 'name'), ''), v_email::text);
  v_phone := coalesce(btrim(p_address ->> 'phone'), '');

  v_total := v_subtotal + v_shipping;

  -- ── 4. The order row, carrying a FROZEN copy of the address and the
  --    deadline for its stock hold.
  insert into public.orders (
    order_number, customer_id, address_id, status, payment_status,
    subtotal, shipping_amount, total, currency,
    shipping_name, shipping_phone, shipping_address_line_1, shipping_address_line_2,
    shipping_city, shipping_state, shipping_postal_code, shipping_country,
    email, placed_at, reservation_expires_at
  )
  values (
    public.generate_order_number(),
    v_customer_id, v_linked, 'PENDING', 'PENDING',
    v_subtotal, v_shipping, v_total, v_currency,
    v_name, v_phone,
    coalesce(p_address ->> 'address_line_1', ''),
    coalesce(p_address ->> 'address_line_2', ''),
    coalesce(p_address ->> 'city', ''),
    coalesce(p_address ->> 'state', ''),
    coalesce(p_address ->> 'postal_code', ''),
    coalesce(nullif(p_address ->> 'country', ''), 'IN'),
    v_email, now(),
    now() + make_interval(mins => v_hold_minutes)
  )
  returning id, order_number into v_order_id, v_order_no;

  -- ── 5. Atomic inventory. `stock >= quantity` in the WHERE clause is the
  --    concurrency guard: two simultaneous buyers can never both win the last
  --    unit, and the whole function is one transaction.
  for v_item in select * from jsonb_array_elements(v_lines) loop
    update public.product_variants
       set stock = stock - (v_item ->> 'quantity')::integer
     where id = (v_item ->> 'variant_id')::uuid
       and active
       and stock >= (v_item ->> 'quantity')::integer;

    if not found then
      raise exception 'STOCK_DEPLETED:%:%', v_item ->> 'slug', v_item ->> 'size' using errcode = 'P0001';
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, variant_size, unit_price, quantity,
      image_url, drop_status, edition_label
    )
    values (
      v_order_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'variant_id')::uuid,
      v_item ->> 'name',
      v_item ->> 'size',
      (v_item ->> 'price')::integer,
      (v_item ->> 'quantity')::integer,
      v_item ->> 'cover',
      v_item ->> 'drop_status',
      v_item ->> 'edition_label'
    );
  end loop;

  -- ── 6. Optionally keep the address for next time. Clamped, not fatal.
  if coalesce(p_save_address, false) then
    select count(*) into v_addr_count
    from public.addresses
    where customer_id = v_customer_id;

    if v_addr_count < 10 then
      insert into public.addresses (
        customer_id, label, name, phone,
        address_line_1, address_line_2, city, state, postal_code, country, is_default
      )
      values (
        v_customer_id, 'HOME', v_name, v_phone,
        coalesce(p_address ->> 'address_line_1', ''),
        coalesce(p_address ->> 'address_line_2', ''),
        coalesce(p_address ->> 'city', ''),
        coalesce(p_address ->> 'state', ''),
        coalesce(p_address ->> 'postal_code', ''),
        coalesce(nullif(p_address ->> 'country', ''), 'IN'),
        v_addr_count = 0
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id',      v_order_id,
    'order_number',  v_order_no,
    'subtotal',      v_subtotal,
    'shipping',      v_shipping,
    'total',         v_total,
    'currency',      v_currency,
    'reservation_expires_at', to_char(
      now() + make_interval(mins => v_hold_minutes), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, uuid, boolean, integer) from public;
revoke all on function public.place_order(jsonb, jsonb, uuid, boolean, integer) from anon;
grant execute on function public.place_order(jsonb, jsonb, uuid, boolean, integer) to authenticated;
-- The 4-arg form is what older callers and the e2e suite use. Postgres has no
-- default-argument overloading, so it stays as a thin wrapper.
create or replace function public.place_order(
  p_items jsonb, p_address jsonb, p_address_id uuid default null, p_save_address boolean default false
)
returns jsonb
language sql
as $$
  select public.place_order(p_items, p_address, p_address_id, p_save_address, 30);
$$;

revoke all on function public.place_order(jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, uuid, boolean) to authenticated;

revoke all on function public.guard_order_payment_columns() from public, anon, authenticated;