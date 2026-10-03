import "server-only";

import type {
  CollectionSummary,
  ProductDetail,
  ProductSummary,
} from "@/types";
import { createClient } from "./supabase/server";
import { storageUrl } from "./supabase/storage-url";

/**
 * Server-side archive queries. All storefront reads go through here.
 *
 * The exports and their shapes are deliberately identical to what the
 * components already consume — only the data layer moved to Supabase
 * Postgres. Nothing above this file knows the difference.
 *
 * Reads use the anon server client, so the catalogue is subject to the RLS
 * policies in 0003_rls.sql: an anonymous visitor can only ever see published
 * collections, published products and their variants.
 */

const PRODUCT_SELECT = `
  id, slug, collection_id, archive_number, name, subtitle, description, story,
  purpose, limitation, state, adaptation, price, compare_price, currency,
  model, sizes, featured, status, drop_status, edition_label,
  pre_order_starts_at, pre_order_ends_at, production_period, dispatch_period,
  pre_order_notice, in_production_message, fulfilling_message, sold_out_message,
  seo_title, seo_description, og_image, sort_order, created_at, updated_at,
  collections ( id, slug, name, number ),
  product_images ( id, storage_path, public_url, alt_text, type, sort_order ),
  product_variants ( id, size, stock, active )
`;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  archive_number: string;
  subtitle: string;
  description: string;
  story: string;
  purpose: string;
  limitation: string;
  state: string;
  adaptation: string;
  model: string;
  sizes: string;
  seo_title: string;
  seo_description: string;
  og_image: string;
  in_production_message: string;
  fulfilling_message: string;
  sold_out_message: string;
  price: number;
  compare_price: number | null;
  currency: string;
  status: string;
  featured: boolean;
  drop_status: string;
  edition_label: string;
  pre_order_starts_at: string | null;
  pre_order_ends_at: string | null;
  production_period: string;
  dispatch_period: string;
  pre_order_notice: string;
  collections:
    | { id: string; slug: string; name: string; number: string }
    | null
    | Array<{ id: string; slug: string; name: string; number: string }>;
  product_images: Array<{
    id: string;
    storage_path: string;
    public_url: string;
    alt_text: string;
    type: string;
    sort_order: number;
  }>;
  product_variants: Array<{ id: string; size: string; stock: number; active: boolean }>;
};

/** PostgREST returns an embedded 1:1 as an array or an object depending on shape. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Best image for a card. Ranked by plate type rather than upload order, so a
 * product is never represented by its back print or its artwork crop.
 */
function coverUrl(
  images: Array<{ storage_path: string; public_url: string; type: string; sort_order: number }>,
): string {
  if (!images.length) return "";
  const rank: Record<string, number> = {
    hero: 0,
    front: 1,
    artwork: 2,
    detail: 3,
    back: 4,
    thumbnail: 5,
  };
  const sorted = [...images].sort((a, b) => {
    const ra = rank[a.type] ?? 6;
    const rb = rank[b.type] ?? 6;
    if (ra !== rb) return ra - rb;
    return a.sort_order - b.sort_order;
  });
  return storageUrl(sorted[0].public_url, sorted[0].storage_path);
}

function mapSummary(p: ProductRow): ProductSummary {
  const collection = one(p.collections);
  const variants = p.product_variants.filter((v) => v.active);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    archiveNumber: p.archive_number,
    subtitle: p.subtitle,
    price: p.price,
    comparePrice: p.compare_price,
    currency: p.currency,
    status: p.status,
    featured: p.featured,
    cover: coverUrl(p.product_images),
    collection: collection
      ? { slug: collection.slug, name: collection.name, number: collection.number }
      : null,
    totalStock: variants.reduce((s, v) => s + v.stock, 0),
    dropStatus: p.drop_status,
    editionLabel: p.edition_label,
    preOrderStartsAt: p.pre_order_starts_at,
    preOrderEndsAt: p.pre_order_ends_at,
    productionPeriod: p.production_period,
    dispatchPeriod: p.dispatch_period,
    preOrderNotice: p.pre_order_notice,
  };
}

export async function getCollections(includeUnpublished = false): Promise<CollectionSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("collections")
    .select("id, slug, name, number, subtitle, description, hero_image, artwork, sort_order, published")
    .order("sort_order", { ascending: true });

  // RLS already hides unpublished rows from anon. The explicit filter only
  // matters for the service-role client, which bypasses RLS.
  if (!includeUnpublished) query = query.eq("published", true);

  const { data, error } = await query;
  if (error) throw new Error(`collections: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    number: c.number,
    subtitle: c.subtitle,
    description: c.description,
    heroImage: storageUrl(c.hero_image),
    artwork: storageUrl(c.artwork),
    published: c.published,
    sortOrder: c.sort_order,
  }));
}

export async function getCollection(slug: string): Promise<CollectionSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, name, number, subtitle, description, hero_image, artwork, sort_order, published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`collection: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    number: data.number,
    subtitle: data.subtitle,
    description: data.description,
    heroImage: storageUrl(data.hero_image),
    artwork: storageUrl(data.artwork),
    published: data.published,
    sortOrder: data.sort_order,
  };
}

export async function getProducts(options?: {
  collectionSlug?: string;
  includeUnpublished?: boolean;
}): Promise<ProductSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeUnpublished) query = query.eq("status", "PUBLISHED");
  if (options?.collectionSlug) {
    query = query.eq("collections.slug", options.collectionSlug);
  }

  const { data, error } = await query;
  if (error) throw new Error(`products: ${error.message}`);

  return ((data ?? []) as unknown as ProductRow[]).map(mapSummary);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`product: ${error.message}`);
  if (!data) return null;

  const p = data as unknown as ProductRow;
  const summary = mapSummary(p);
  const variants = p.product_variants.filter((v) => v.active);

  return {
    ...summary,
    description: p.description,
    story: p.story,
    purpose: p.purpose,
    limitation: p.limitation,
    state: p.state,
    adaptation: p.adaptation,
    model: p.model,
    sizes: p.sizes ? p.sizes.split(",").map((s) => s.trim()).filter(Boolean) : [],
    images: [...p.product_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.id,
        url: storageUrl(i.public_url, i.storage_path),
        alt: i.alt_text,
        type: i.type,
        order: i.sort_order,
      })),
    variants: [...variants]
      .sort((a, b) => a.size.localeCompare(b.size))
      .map((v) => ({ id: v.id, size: v.size, stock: v.stock })),
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    ogImage: storageUrl("", p.og_image),
    inProductionMessage: p.in_production_message,
    fulfillingMessage: p.fulfilling_message,
    soldOutMessage: p.sold_out_message,
  };
}

/**
 * Ordered sizes as offered by the product, intersected with inventory.
 * The size axis is data (`products.sizes`), not hardcoded in a component.
 */
export function offeredSizes(detail: ProductDetail): Array<{ size: string; stock: number }> {
  const axis = detail.sizes.length ? detail.sizes : ["S", "M", "L", "XL"];
  return axis
    .map((size) => ({
      size,
      stock: detail.variants.find((v) => v.size === size)?.stock ?? 0,
    }))
    .sort((a, b) => {
      const ia = ["XS", "S", "M", "L", "XL", "XXL"].indexOf(a.size);
      const ib = ["XS", "S", "M", "L", "XL", "XXL"].indexOf(b.size);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}