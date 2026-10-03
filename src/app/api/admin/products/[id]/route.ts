import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";
import {
  ProductUpdateInput,
  imageColumns,
  productColumns,
} from "@/lib/admin-schemas";

/**
 * Control Room: one product.
 *
 * Authorisation first, always. The service role then performs the write.
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

type Params = { params: Promise<{ id: string }> };

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function mapProduct(p: Record<string, unknown>) {
  const collection = one(
    p.collections as { id: string; slug: string; name: string; number: string } | null,
  );
  const images = (p.product_images as Array<Record<string, unknown>>).sort(
    (a, b) => (a.sort_order as number) - (b.sort_order as number),
  );

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

async function authorize() {
  const auth = await requireAdmin();
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const { data } = await createAdminClient()
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ product: mapProduct(data as unknown as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const parsed = ProductUpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const { setVariants, addImages, reorderImages, setImageType, deleteImage, setCoverImage, sizes, ...rest } =
    d as Record<string, unknown> & {
      setVariants?: Array<{ id?: string; size: string; stock: number }>;
      addImages?: Array<{ url: string; alt: string; type: string; order: number }>;
      reorderImages?: Array<{ id: string; order: number }>;
      setImageType?: { id: string; type: string };
      deleteImage?: { id: string };
      setCoverImage?: { id: string };
      sizes?: Array<{ size: string; stock: number }>;
    };

  // Variant replacement.
  //
  // The form sends the whole size axis as `sizes`; `setVariants` is the older,
  // richer shape. Both mean the same thing — this is the complete axis — so
  // they take the same path.
  //
  // They used to diverge, and that divergence silently threw away stock: the
  // `sizes` branch wrote only the size NAMES into products.sizes and never
  // touched product_variants at all. An operator could set every number on the
  // inventory panel, save, and see the old quantities again on reopen — with a
  // success message and no error anywhere. Anything that persists the axis must
  // persist the stock on it, or it is not really saving the axis.
  const axis = setVariants?.length ? setVariants : sizes;
  if (axis) {
    const { data: current } = await supabase
      .from("product_variants")
      .select("id, size")
      .eq("product_id", id);

    const currentBySize = new Map((current ?? []).map((v) => [v.size as string, v.id as string]));
    // Sizes that were unticked. Deactivated rather than deleted: a variant
    // referenced by a historical order is still an FK target, and the snapshot
    // on the item is what an old order must keep reading.
    const drop = (current ?? [])
      .filter((v) => !axis.some((s) => s.size === v.size))
      .map((v) => v.id as string);

    if (drop.length) {
      await supabase.from("product_variants").update({ active: false }).in("id", drop);
    }

    if (axis.length) {
      // One write per row rather than a batched upsert.
      //
      // Both batched forms were tried and both are wrong here. Passing
      // `id: undefined` for a new size serialises as null and trips the NOT
      // NULL on id; omitting the key and upserting on (product_id,size) then
      // fails the moment the batch also contains rows that DO carry an id,
      // because merge-duplicates cannot resolve two conflict targets at once.
      // Separate update-or-insert per size is boring and cannot be wrong. The
      // axis is at most a handful of rows, so it costs nothing.
      for (const v of axis) {
        const existingId = currentBySize.get(v.size);
        const write = existingId
          ? supabase.from("product_variants").update({ stock: v.stock, active: true }).eq("id", existingId)
          : supabase.from("product_variants").insert({
              product_id: id,
              size: v.size,
              stock: v.stock,
              active: true,
            });
        const { error: writeError } = await write;
        if (writeError) {
          return NextResponse.json({ error: writeError.message }, { status: 500 });
        }
      }
    }

    // An empty axis is meaningful too — it means every size is off sale, and
    // products.sizes has to become "" rather than keeping yesterday's list.
    await supabase
      .from("products")
      .update({ sizes: axis.map((v) => v.size).join(",") })
      .eq("id", id);
  }

  // Image operations.
  if (addImages?.length) {
    await supabase
      .from("product_images")
      .insert(addImages.map((img) => ({ product_id: id, ...imageColumns(img) })));
  }
  for (const r of reorderImages ?? []) {
    await supabase
      .from("product_images")
      .update({ sort_order: r.order })
      .eq("id", r.id)
      .eq("product_id", id);
  }
  if (setImageType) {
    await supabase
      .from("product_images")
      .update({ type: setImageType.type })
      .eq("id", setImageType.id)
      .eq("product_id", id);
  }
  if (deleteImage) {
    await supabase.from("product_images").delete().eq("id", deleteImage.id).eq("product_id", id);
  }
  if (setCoverImage) {
    // The cover is derived from plate type first, then sort order. Promoting
    // a chosen image means making it a hero at the head of the list.
    await supabase
      .from("product_images")
      .update({ type: "hero", sort_order: 0 })
      .eq("id", setCoverImage.id)
      .eq("product_id", id);
  }

  const columns = productColumns(rest as Record<string, unknown>);
  delete columns.sizes;
  if (Object.keys(columns).length > 0) {
    const { error } = await supabase.from("products").update(columns).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: product } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .single();

  return NextResponse.json({
    product: mapProduct(product as unknown as Record<string, unknown>),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const { error } = await createAdminClient().from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}