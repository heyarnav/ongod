-- ============================================================================
-- on god. — 0001_initial_schema.sql
-- Supabase PostgreSQL is the only database. No Prisma, no SQLite.
--
-- Money is stored as integer minor units (paise). Never floating point.
-- Shipping fields on `orders` and product fields on `order_items` are frozen
-- snapshots: they are never derived from the live product or address again.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── updated_at trigger ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- CUSTOMERS
-- One row per authenticated Supabase user. `supabase_user_id` is the identity
-- join for RLS; `email` is unique because it is the human-facing handle.
-- ============================================================================
create table if not exists public.customers (
  id               uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique not null references auth.users (id) on delete cascade,
  email            citext not null unique,
  name             text not null default '',
  phone            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists customers_created_at_idx on public.customers (created_at desc);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ADDRESSES
-- A customer's saved destinations. Editing one must never rewrite what an
-- order already shipped to — that copy lives frozen on `orders`.
-- ============================================================================
create table if not exists public.addresses (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  label           text not null default 'HOME',
  name            text not null default '',
  phone           text not null default '',
  address_line_1  text not null,
  address_line_2  text not null default '',
  city            text not null,
  state           text not null,
  postal_code     text not null,
  country         text not null default 'IN',
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint addresses_label_check check (label in ('HOME', 'WORK', 'OTHER'))
);

create index if not exists addresses_customer_id_idx on public.addresses (customer_id);

-- At most ONE default per customer. This is a database invariant, not
-- application discipline, so a race between two requests cannot produce two.
create unique index if not exists addresses_one_default_per_customer
  on public.addresses (customer_id)
  where is_default;

drop trigger if exists addresses_set_updated_at on public.addresses;
create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- ============================================================================
-- COLLECTIONS — a conceptual world: HUMAN / CELESTIAL / DIVINE
-- ============================================================================
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  number      text not null default '000',
  subtitle    text not null default '',
  description text not null default '',
  manifest    text not null default '',
  hero_image  text not null default '',
  artwork     text not null default '',
  sort_order  integer not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists collections_sort_order_idx on public.collections (sort_order);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

-- ============================================================================
-- PRODUCTS — an archive object.
-- `status` is the publication state; `drop_status` is the release lifecycle
-- and is what the storefront and checkout reason about.
-- ============================================================================
create table if not exists public.products (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  collection_id            uuid references public.collections (id) on delete set null,
  archive_number           text not null default '000',
  name                     text not null,
  subtitle                 text not null default '',
  description              text not null default '',
  story                    text not null default '',
  purpose                  text not null default '',
  limitation               text not null default '',
  state                    text not null default '',
  adaptation               text not null default '',
  price                    integer not null default 0 check (price >= 0),
  compare_price            integer check (compare_price is null or compare_price >= 0),
  currency                 text not null default 'INR',
  model                    text not null default '',
  sizes                    text not null default 'XS,S,M,L,XL,XXL',
  featured                 boolean not null default false,
  status                   text not null default 'DRAFT',
  drop_status              text not null default 'DRAFT',
  edition_label            text not null default 'FIRST EDITION',
  pre_order_starts_at      timestamptz,
  pre_order_ends_at        timestamptz,
  production_period        text not null default '',
  dispatch_period          text not null default '',
  pre_order_notice         text not null default '',
  in_production_message    text not null default '',
  fulfilling_message       text not null default '',
  sold_out_message         text not null default '',
  seo_title                text not null default '',
  seo_description          text not null default '',
  og_image                 text not null default '',
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint products_status_check check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  constraint products_drop_status_check check (drop_status in (
    'DRAFT', 'COMING_SOON', 'PRE_ORDER', 'PRE_ORDER_CLOSED',
    'IN_PRODUCTION', 'FULFILLING', 'SOLD_OUT', 'ARCHIVED'
  ))
);

create index if not exists products_collection_id_idx on public.products (collection_id);
create index if not exists products_status_featured_idx on public.products (status, featured);
create index if not exists products_sort_order_idx on public.products (sort_order, created_at);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================================
-- PRODUCT VARIANTS — per-size inventory. The size axis is data, not code.
-- ============================================================================
create table if not exists public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size       text not null,
  sku        text not null default '',
  stock      integer not null default 0 check (stock >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One variant per (product, size). Also makes the atomic stock decrement in
-- place_order() unambiguous.
create unique index if not exists product_variants_product_size_key
  on public.product_variants (product_id, size);
create index if not exists product_variants_product_id_idx on public.product_variants (product_id);

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ============================================================================
-- PRODUCT IMAGES — objects live in the `ongod-media` bucket. The row keeps the
-- storage path plus the resolved public URL.
-- ============================================================================
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  public_url   text not null default '',
  alt_text     text not null default '',
  type         text not null default 'front',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists product_images_product_id_idx
  on public.product_images (product_id, sort_order);

-- Also makes the seed idempotent: re-running it can never duplicate an image.
create unique index if not exists product_images_product_path_key
  on public.product_images (product_id, storage_path);

-- ============================================================================
-- ORDERS
-- The shipping_* columns are a FROZEN SNAPSHOT taken at checkout. Changing or
-- deleting the customer's saved address afterwards must never touch them.
-- Payment state lives here: no separate payments table until one is needed.
-- Razorpay is dormant, so payment_status stays PENDING.
-- ============================================================================
create table if not exists public.orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            text not null unique,
  customer_id             uuid references public.customers (id) on delete set null,
  address_id              uuid references public.addresses (id) on delete set null,

  status                  text not null default 'PENDING',
  payment_status          text not null default 'PENDING',

  subtotal                integer not null default 0 check (subtotal >= 0),
  shipping_amount         integer not null default 0 check (shipping_amount >= 0),
  total                   integer not null default 0 check (total >= 0),
  currency                text not null default 'INR',

  -- frozen address snapshot
  shipping_name           text not null default '',
  shipping_phone          text not null default '',
  shipping_address_line_1 text not null default '',
  shipping_address_line_2 text not null default '',
  shipping_city           text not null default '',
  shipping_state          text not null default '',
  shipping_postal_code    text not null default '',
  shipping_country        text not null default 'IN',

  -- frozen contact snapshot
  email                   text not null default '',

  -- dormant payment gateway seam (Razorpay). Empty while unconfigured.
  gateway_order_id        text not null default '',
  gateway_payment_id      text not null default '',
  gateway_signature       text not null default '',

  tracking_number         text not null default '',
  tracking_url            text not null default '',

  placed_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint orders_status_check check (status in (
    'PENDING', 'PAID', 'IN_PRODUCTION', 'QUALITY_CHECK',
    'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'
  )),
  constraint orders_payment_status_check check (payment_status in (
    'PENDING', 'PAID', 'FAILED', 'REFUNDED'
  ))
);

create index if not exists orders_customer_id_idx on public.orders (customer_id, placed_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);
create index if not exists orders_email_idx on public.orders (email);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ORDER ITEMS
-- product_name / variant_size / unit_price are snapshots frozen at purchase.
-- A historical order must stay correct even if the product is renamed,
-- repriced or deleted afterwards.
-- ============================================================================
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  variant_id    uuid references public.product_variants (id) on delete set null,
  product_name  text not null,
  variant_size  text not null,
  unit_price    integer not null default 0 check (unit_price >= 0),
  quantity      integer not null default 1 check (quantity > 0),
  image_url     text not null default '',
  drop_status   text not null default '',
  edition_label text not null default '',
  tracking_note text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- ============================================================================
-- ADMIN USERS — the deliberate authorization list for the Control Room.
-- Signing in as a Supabase user grants nothing on its own; a row here is the
-- only thing that makes someone staff.
-- ============================================================================
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique not null references auth.users (id) on delete cascade,
  email      citext not null unique,
  name       text not null default 'Keeper',
  role       text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('admin', 'staff'))
);

-- ============================================================================
-- SITE SETTINGS — editable content without a redeploy.
-- ============================================================================
create table if not exists public.site_settings (
  key        text primary key,
  value      text not null default '',
  group_name text not null default 'general',
  label      text not null default '',
  kind       text not null default 'text',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_settings_kind_check check (kind in ('text', 'textarea', 'image'))
);

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ANALYTICS EVENTS
-- Kept deliberately simple: a name, a path, and a JSON blob of context.
-- Anything that matters (an order placed) is written server-side, so a
-- browser can never forge a conversion.
-- ============================================================================
create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  event_name  text not null,
  path        text not null default '',
  product_id  uuid references public.products (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  session_id  text not null default '',
  referrer    text not null default '',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_product_id_idx
  on public.analytics_events (product_id);

-- ============================================================================
-- JOURNAL ENTRIES — the founding dispatches. Public read once published.
-- ============================================================================
create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  number        text not null,
  title         text not null,
  dek           text not null default '',
  body          text not null default '',
  read_minutes  integer not null default 4,
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists journal_entries_published_idx
  on public.journal_entries (published, number);

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();