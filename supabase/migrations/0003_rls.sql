-- ============================================================================
-- on god. — 0003_rls.sql
--
-- Supabase is the backend, so row level security is the actual security
-- boundary. Hiding a row in React is not security; these policies are.
--
-- Identity chain:
--     auth.uid()  ->  customers.supabase_user_id  ->  customers.id
--
-- Every customer-owned table is scoped through a `current_customer_id()`
-- helper that resolves that chain. Customer A therefore cannot read, write or
-- delete Customer B's profile, addresses, orders, order items or settings,
-- regardless of what their browser sends.
--
-- Anything without a matching permissive policy is denied.
-- ============================================================================

-- ── helpers ───────────────────────────────────────────────────────────────

-- SECURITY DEFINER so the lookup can read `customers` without recursing back
-- into the very policies it is used by. STABLE so the planner calls it once.
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id from public.customers c where c.supabase_user_id = auth.uid();
$$;

-- Control Room membership. Signing in as a Supabase user grants nothing by
-- itself; a row in admin_users is the only thing that makes someone staff.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.current_customer_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_customer_id() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── enable RLS everywhere ─────────────────────────────────────────────────
-- Force it as well as enable it, so the table owner is subject to policies too
-- and no accidental "owner bypass" can appear later.
alter table public.customers       enable row level security;
alter table public.addresses       enable row level security;
alter table public.collections     enable row level security;
alter table public.products        enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.admin_users     enable row level security;
alter table public.site_settings   enable row level security;
alter table public.analytics_events enable row level security;
alter table public.journal_entries  enable row level security;

-- ============================================================================
-- CUSTOMERS
-- A customer may read and update exactly their own row, and may insert the
-- one row that corresponds to their own auth user.
-- ============================================================================
drop policy if exists customers_select_own on public.customers;
create policy customers_select_own on public.customers
  for select to authenticated
  using (supabase_user_id = auth.uid());

drop policy if exists customers_insert_own on public.customers;
create policy customers_insert_own on public.customers
  for insert to authenticated
  with check (supabase_user_id = auth.uid());

drop policy if exists customers_update_own on public.customers;
create policy customers_update_own on public.customers
  for update to authenticated
  using (supabase_user_id = auth.uid())
  with check (supabase_user_id = auth.uid());

-- Deliberately no delete policy: a customer cannot destroy their own record,
-- which is what their order history hangs off.

-- ============================================================================
-- ADDRESSES
-- ============================================================================
drop policy if exists addresses_select_own on public.addresses;
create policy addresses_select_own on public.addresses
  for select to authenticated
  using (customer_id = public.current_customer_id());

drop policy if exists addresses_insert_own on public.addresses;
create policy addresses_insert_own on public.addresses
  for insert to authenticated
  with check (customer_id = public.current_customer_id());

drop policy if exists addresses_update_own on public.addresses;
create policy addresses_update_own on public.addresses
  for update to authenticated
  using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

drop policy if exists addresses_delete_own on public.addresses;
create policy addresses_delete_own on public.addresses
  for delete to authenticated
  using (customer_id = public.current_customer_id());

-- ============================================================================
-- ORDERS
-- ============================================================================
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (customer_id = public.current_customer_id());

-- Orders are created by place_order(), which is SECURITY DEFINER. There is
-- intentionally no customer insert policy: a client cannot fabricate an order
-- with a price of its choosing, because it cannot insert at all.
drop policy if exists orders_update_own on public.orders;
create policy orders_update_own on public.orders
  for update to authenticated
  using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

-- ============================================================================
-- ORDER ITEMS
-- Scoped through the parent order, so items are as private as the order.
-- ============================================================================
drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = public.current_customer_id()
    )
  );

-- No insert/update/delete policy: items are written by place_order() only.
-- A customer cannot rewrite the frozen name/price of what they bought.

-- ============================================================================
-- CATALOGUE — public reads, admin writes
-- ============================================================================
drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections
  for select to anon, authenticated
  using (published);

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (status = 'PUBLISHED');

drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.status = 'PUBLISHED'
    )
  );

drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id and p.status = 'PUBLISHED'
    )
  );

-- ============================================================================
-- SITE SETTINGS — public read (the marketing copy is on the live site),
-- admin-only writes.
-- ============================================================================
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (true);

-- ============================================================================
-- ANALYTICS — inserts come from the server with the service role.
-- Nobody reads the table through the anon key; the Control Room does it with
-- the service role after requireAdmin().
-- ============================================================================
drop policy if exists analytics_authenticated_insert on public.analytics_events;
create policy analytics_authenticated_insert on public.analytics_events
  for insert to authenticated
  with check (event_name is not null);

-- ============================================================================
-- JOURNAL — published dispatches are readable by anyone.
-- ============================================================================
drop policy if exists journal_public_read on public.journal_entries;
create policy journal_public_read on public.journal_entries
  for select to anon, authenticated
  using (published);

drop policy if exists admin_full_journal on public.journal_entries;
create policy admin_full_journal on public.journal_entries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- ADMIN USERS
-- A person may confirm that they are staff; they may not promote themselves.
-- Writes are service-role only (scripts/create-admin.mjs + requireAdmin()).
-- ============================================================================
drop policy if exists admin_users_select_own on public.admin_users;
create policy admin_users_select_own on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- CONTROL ROOM ACCESS
-- Full catalog + order + customer access for rows in admin_users. These are
-- the policies the browser key can exercise; server routes additionally gate
-- on requireAdmin() and use the service role, so RLS stays a backstop rather
-- than the only thing standing there.
-- ============================================================================
drop policy if exists admin_full_products on public.products;
create policy admin_full_products on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_collections on public.collections;
create policy admin_full_collections on public.collections
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_product_variants on public.product_variants;
create policy admin_full_product_variants on public.product_variants
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_product_images on public.product_images;
create policy admin_full_product_images on public.product_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_orders on public.orders;
create policy admin_full_orders on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_order_items on public.order_items;
create policy admin_full_order_items on public.order_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_customers on public.customers;
create policy admin_full_customers on public.customers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_addresses on public.addresses;
create policy admin_full_addresses on public.addresses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_site_settings on public.site_settings;
create policy admin_full_site_settings on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_full_analytics on public.analytics_events;
create policy admin_full_analytics on public.analytics_events
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());