import { z } from "zod";
import { SIZE_AXIS } from "./format";

/**
 * Admin input schemas and column mappers.
 *
 * The Control Room UI was written against a camelCase API, so the request and
 * response shapes stay camelCase while the database is snake_case. The
 * conversion lives here rather than being repeated in each route.
 */

export const VariantInput = z.object({
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]),
  stock: z.number().int().min(0).max(9999),
});

export const VariantUpdateInput = VariantInput.extend({
  id: z.string().uuid().optional(),
});

export const ImageInput = z.object({
  url: z.string().min(1),
  alt: z.string().max(200).default(""),
  type: z
    .enum(["hero", "front", "back", "detail", "artwork", "thumbnail"])
    .default("front"),
  order: z.number().int().min(0).default(0),
});

const DropStatus = z.enum([
  "DRAFT",
  "COMING_SOON",
  "PRE_ORDER",
  "PRE_ORDER_CLOSED",
  "IN_PRODUCTION",
  "FULFILLING",
  "SOLD_OUT",
  "ARCHIVED",
]);

export const ProductCreateInput = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  archiveNumber: z.string().min(1).max(10).default("000"),
  subtitle: z.string().max(200).default(""),
  collectionId: z.string().uuid().nullable().optional(),
  description: z.string().max(4000).default(""),
  story: z.string().max(2000).default(""),
  purpose: z.string().max(80).default(""),
  limitation: z.string().max(80).default(""),
  state: z.string().max(80).default(""),
  adaptation: z.string().max(80).default(""),
  price: z.number().int().min(0),
  comparePrice: z.number().int().min(0).nullable().optional(),
  model: z.string().max(300).default(""),
  sizes: z.array(VariantInput).default([]),
  featured: z.boolean().default(false),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  dropStatus: DropStatus.default("DRAFT"),
  editionLabel: z.string().max(60).default("FIRST EDITION"),
  preOrderStartsAt: z.string().datetime().nullable().optional(),
  preOrderEndsAt: z.string().datetime().nullable().optional(),
  productionPeriod: z.string().max(120).default(""),
  dispatchPeriod: z.string().max(120).default(""),
  preOrderNotice: z.string().max(600).default(""),
  inProductionMessage: z.string().max(300).default(""),
  fulfillingMessage: z.string().max(300).default(""),
  soldOutMessage: z.string().max(300).default(""),
  seoTitle: z.string().max(200).default(""),
  seoDescription: z.string().max(400).default(""),
  ogImage: z.string().max(500).default(""),
  images: z.array(ImageInput).default([]),
  sortOrder: z.number().int().default(0),
});

export const ProductUpdateInput = ProductCreateInput.omit({ slug: true }).partial().extend({
  setVariants: z.array(VariantUpdateInput).optional(),
  addImages: z.array(ImageInput).optional(),
  reorderImages: z.array(z.object({ id: z.string().uuid(), order: z.number().int().min(0) })).optional(),
  setImageType: z.object({ id: z.string().uuid(), type: z.string().max(40) }).optional(),
  setCoverImage: z.object({ id: z.string().uuid() }).optional(),
  deleteImage: z.object({ id: z.string().uuid() }).optional(),
});

export const CollectionInput = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  number: z.string().min(1).max(10),
  subtitle: z.string().max(200).default(""),
  description: z.string().max(2000).default(""),
  manifest: z.string().max(8000).default(""),
  heroImage: z.string().max(500).default(""),
  artwork: z.string().max(500).default(""),
  published: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const CollectionUpdateInput = CollectionInput.partial();

/** camelCase request keys -> snake_case columns. */
export function productColumns(d: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    archiveNumber: "archive_number",
    collectionId: "collection_id",
    comparePrice: "compare_price",
    preOrderStartsAt: "pre_order_starts_at",
    preOrderEndsAt: "pre_order_ends_at",
    productionPeriod: "production_period",
    dispatchPeriod: "dispatch_period",
    preOrderNotice: "pre_order_notice",
    inProductionMessage: "in_production_message",
    fulfillingMessage: "fulfilling_message",
    soldOutMessage: "sold_out_message",
    dropStatus: "drop_status",
    editionLabel: "edition_label",
    seoTitle: "seo_title",
    seoDescription: "seo_description",
    ogImage: "og_image",
    sortOrder: "sort_order",
  };

  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(d)) {
    if (value === undefined) continue;
    if (key === "sizes" || key === "images") continue;
    columns[map[key] ?? key] = value;
  }
  return columns;
}

export function collectionColumns(d: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    heroImage: "hero_image",
    sortOrder: "sort_order",
  };

  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(d)) {
    if (value === undefined) continue;
    columns[map[key] ?? key] = value;
  }
  return columns;
}

export function imageColumns(d: { url: string; alt: string; type: string; order: number }) {
  return {
    // `url` here is a Storage public URL; the path is recovered from it so
    // the row can be re-resolved without depending on the bucket layout.
    storage_path: storagePathFromUrl(d.url),
    public_url: d.url,
    alt_text: d.alt,
    type: d.type,
    sort_order: d.order,
  };
}

/** `.../object/public/ongod-media/a/b.jpg` -> `a/b.jpg` */
export function storagePathFromUrl(url: string): string {
  const marker = "/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const rest = url.slice(i + marker.length);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "ongod-media";
  if (rest.startsWith(`${bucket}/`)) return rest.slice(bucket.length + 1);
  return rest;
}

/** The size axis to persist when the form did not supply one. */
export function defaultSizeAxis() {
  return [...SIZE_AXIS];
}