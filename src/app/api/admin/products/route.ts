import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";
import {
  ProductCreateInput,
  defaultSizeAxis,
  imageColumns,
  productColumns,
} from "@/lib/admin-schemas";

/**
 * Control Room: the product catalogue.
 *
 * Authorised by `requireAdmin()` — a Supabase session alone is not enough,
 * there must be a row in `admin_users`. The service-role client is used
 * afterwards because an administrator legitimately needs to see DRAFT and
 * ARCHIVED products that RLS hides from the storefront.
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

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function mapProduct(p: Record<string, unknown>) {
  const collection = one(
    p.collections as { id: string; slug: string; name: string; number: string } | null,
  );
  const images = (
    p.product_images as Array<Record<string, unknown>>
  ).sort((a, b) => (a.sort_order as number) - (b.sort_order as number));

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    archiveNumber: p.archive_number,
    subtitle: p.subtitle,
    collectionId: p.collection_id,
    collection: collection
      ? { id: collection.id, slug: collection.slug, name: collection.name, number: collection.number }
      : null,
    description: p.description,
    story: p.story,
    purpose: p.purpose,
    limitation: p.limitation,
    state: p.state,
    adaptation: p.adaptation,
    price: p.price,
    comparePrice: p.compare_price,
    currency: p.currency,
    model: p.model,
    sizes: String(p.sizes ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    featured: p.featured,
    status: p.status,
    dropStatus: p.drop_status,
    editionLabel: p.edition_label,
    preOrderStartsAt: p.pre_order_starts_at,
    preOrderEndsAt: p.pre_order_ends_at,
    productionPeriod: p.production_period,
    dispatchPeriod: p.dispatch_period,
    preOrderNotice: p.pre_order_notice,
    inProductionMessage: p.in_production_message,
    fulfillingMessage: p.fulfilling_message,
    soldOutMessage: p.sold_out_message,
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    ogImage: p.og_image,
    sortOrder: p.sort_order,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    images: images.map((i) => ({
      id: i.id,
      url: i.public_url || i.storage_path,
      storagePath: i.storage_path,
      alt: i.alt_text,
      type: i.type,
      order: i.sort_order,
    })),
    variants: (p.product_variants as Array<Record<string, unknown>>).map((v) => ({
      id: v.id,
      size: v.size,
      stock: v.stock,
      active: v.active,
    })),
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { data, error } = await createAdminClient()
    .from("products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    products: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(mapProduct),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const parsed = ProductCreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("slug", d.slug)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "SLUG_EXISTS" }, { status: 409 });

  const axis = d.sizes.length ? d.sizes : defaultSizeAxis().map((size) => ({ size: size as "XS" | "S" | "M" | "L" | "XL" | "XXL", stock: 0 }));

  const columns = productColumns({ ...d, sizes: undefined });
  columns.sizes = axis.map((s) => s.size).join(",");

  const { data: product, error } = await supabase
    .from("products")
    .insert(columns)
    .select("id")
    .single();

  if (error || !product) {
    return NextResponse.json({ error: error?.message ?? "CREATE_FAILED" }, { status: 500 });
  }

  if (axis.length) {
    const { error: variantError } = await supabase.from("product_variants").insert(
      axis.map((v) => ({
        product_id: product.id,
        size: v.size,
        sku: `${d.slug.toUpperCase()}-${v.size}`,
        stock: v.stock,
        active: true,
      })),
    );
    if (variantError) {
      return NextResponse.json({ error: variantError.message }, { status: 500 });
    }
  }

  if (d.images.length) {
    await supabase.from("product_images").insert(
      d.images.map((img) => ({ product_id: product.id, ...imageColumns(img) })),
    );
  }

  const { data: created } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", product.id)
    .single();

  return NextResponse.json(
    { product: mapProduct(created as unknown as Record<string, unknown>) },
    { status: 201 },
  );
}