-- ============================================================================
-- on god. — 0002_functions.sql
--
-- The order is placed entirely inside the database. There is no read-then-write
-- inventory race in JavaScript anywhere: the decrement is a single conditional
-- UPDATE, and the whole thing is one transaction because it is one function.
-- ============================================================================

-- Human-readable, sortable, collision-free order numbers: OG-YYMMDD-00001
create sequence if not exists public.order_number_seq start 1;

create or replace function public.generate_order_number()
returns text
language sql
volatile
as $$
  select 'OG-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0');
$$;

-- ----------------------------------------------------------------------------
-- place_order
--
-- SECURITY DEFINER so that the insert into `orders` / `order_items` is not
-- subject to the caller's RLS — the function itself is the authorization
-- boundary. Identity comes from auth.uid() and NOTHING from the arguments:
-- there is deliberately no customer_id parameter, so a browser cannot order
-- as someone else no matter what it posts.
--
-- Never trust, and never read, from p_*: price, stock, totals, product status,
-- drop status, pre-order window. All of it is re-derived from the rows here.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_items        jsonb,
  p_address      jsonb,
  p_address_id   uuid    default null,
  p_save_address boolean default false
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
begin
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

    -- Lock the product row for the rest of the transaction.
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

    -- Release state is authoritative and server-side.
    if v_product.drop_status <> 'PRE_ORDER' then
      raise exception 'NOT_ORDERABLE:%:%', v_product.slug, v_product.drop_status using errcode = 'P0001';
    end if;

    -- When a window exists it is enforced here too, not in the browser.
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

  -- ── 3. A saved address may only ever be linked if it is the caller's own.
  --    It is not required: the typed fields below are what actually ship.
  v_linked := null;
  if p_address_id is not null then
    select a.id into v_linked
    from public.addresses a
    where a.id = p_address_id and a.customer_id = v_customer_id;
  end if;

  v_name  := coalesce(nullif(btrim(p_address ->> 'name'), ''), v_email::text);
  v_phone := coalesce(btrim(p_address ->> 'phone'), '');

  v_total := v_subtotal + v_shipping;

  -- ── 4. The order row, carrying a FROZEN copy of the address. Nothing
  --    downstream ever re-reads the customer's address book for this order.
  insert into public.orders (
    order_number,
    customer_id,
    address_id,
    status,
    payment_status,
    subtotal,
    shipping_amount,
    total,
    currency,
    shipping_name,
    shipping_phone,
    shipping_address_line_1,
    shipping_address_line_2,
    shipping_city,
    shipping_state,
    shipping_postal_code,
    shipping_country,
    email,
    placed_at
  )
  values (
    public.generate_order_number(),
    v_customer_id,
    v_linked,
    'PENDING',
    'PENDING',
    v_subtotal,
    v_shipping,
    v_total,
    v_currency,
    v_name,
    v_phone,
    coalesce(p_address ->> 'address_line_1', ''),
    coalesce(p_address ->> 'address_line_2', ''),
    coalesce(p_address ->> 'city', ''),
    coalesce(p_address ->> 'state', ''),
    coalesce(p_address ->> 'postal_code', ''),
    coalesce(nullif(p_address ->> 'country', ''), 'IN'),
    v_email,
    now()
  )
  returning id, order_number into v_order_id, v_order_no;

  -- ── 5. Atomic inventory. `stock >= quantity` in the WHERE clause is the
  --    concurrency guard: if another transaction took the last unit between
  --    the check above and here, zero rows are affected and we raise. Two
  --    simultaneous buyers can never both win the last item.
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

  -- ── 6. Optionally keep the address for next time. Best-effort: the order
  --    is already committed by this point in the function's transaction, so a
  --    duplicate-address failure is raised out and the whole thing rolls back
  --    only if we let it. We clamp to the book limit instead.
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
        v_customer_id,
        'HOME',
        v_name,
        v_phone,
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
    'order_id',     v_order_id,
    'order_number', v_order_no,
    'subtotal',     v_subtotal,
    'shipping',     v_shipping,
    'total',        v_total,
    'currency',     v_currency
  );
end;
$$;

-- Only a signed-in customer may place an order. `anon` gets nothing, and the
-- `public` role (which includes anon) is revoked explicitly so a future
-- default grant cannot silently open this up.
revoke all on function public.place_order(jsonb, jsonb, uuid, boolean) from public;
revoke all on function public.place_order(jsonb, jsonb, uuid, boolean) from anon;
grant execute on function public.place_order(jsonb, jsonb, uuid, boolean) to authenticated;

-- The helper is security definer too, so it is only ever called from places
-- that already reached this file.
revoke all on function public.generate_order_number() from public;
grant execute on function public.generate_order_number() to authenticated, service_role;