import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { ProductForm } from "@/components/admin/ProductForm";
import { storageUrl } from "@/lib/supabase/storage-url";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Params) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: product }, { data: collections }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, slug, name, archive_number, subtitle, collection_id, description, story,
         purpose, limitation, state, adaptation, price, compare_price, model,
         featured, status, drop_status, edition_label, pre_order_starts_at,
         pre_order_ends_at, production_period, dispatch_period, pre_order_notice,
         in_production_message, fulfilling_message, sold_out_message,
         seo_title, seo_description, og_image, sort_order,
         product_images ( id, storage_path, public_url, alt_text, type, sort_order ),
         product_variants ( id, size, stock, active )`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("collections")
      .select("id, name, number")
      .order("sort_order", { ascending: true }),
  ]);

  if (!product) notFound();

  const images = (product.product_images ?? []) as Array<Record<string, string | number>>;
  const variants = (product.product_variants ?? []) as Array<{
    id: string;
    size: string;
    stock: number;
    active: boolean;
  }>;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        section="SECTION 01"
        title={String(product.name)}
        note={`Object ${product.archive_number} — /${product.slug}`}
      />
      <div className="mt-8">
        <ProductForm
          productId={String(product.id)}
          collections={collections ?? []}
          initial={{
            slug: String(product.slug),
            name: String(product.name),
            archiveNumber: String(product.archive_number),
            subtitle: String(product.subtitle ?? ""),
            collectionId: (product.collection_id as string | null) ?? null,
            description: String(product.description ?? ""),
            story: String(product.story ?? ""),
            purpose: String(product.purpose ?? ""),
            limitation: String(product.limitation ?? ""),
            state: String(product.state ?? ""),
            adaptation: String(product.adaptation ?? ""),
            priceRupees: (Number(product.price) / 100).toString(),
            comparePriceRupees:
              product.compare_price != null ? (Number(product.compare_price) / 100).toString() : "",
            model: String(product.model ?? ""),
            featured: Boolean(product.featured),
            status: product.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
            dropStatus: String(product.drop_status ?? "DRAFT"),
            editionLabel: String(product.edition_label ?? "FIRST EDITION"),
            preOrderStarts: product.pre_order_starts_at
              ? new Date(String(product.pre_order_starts_at)).toISOString().slice(0, 16)
              : "",
            preOrderEnds: product.pre_order_ends_at
              ? new Date(String(product.pre_order_ends_at)).toISOString().slice(0, 16)
              : "",
            productionPeriod: String(product.production_period ?? ""),
            dispatchPeriod: String(product.dispatch_period ?? ""),
            preOrderNotice: String(product.pre_order_notice ?? ""),
            inProductionMessage: String(product.in_production_message ?? ""),
            fulfillingMessage: String(product.fulfilling_message ?? ""),
            soldOutMessage: String(product.sold_out_message ?? ""),
            seoTitle: String(product.seo_title ?? ""),
            seoDescription: String(product.seo_description ?? ""),
            ogImage: String(product.og_image ?? ""),
            sortOrder: Number(product.sort_order ?? 0),
          }}
          initialImages={[...images]
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
            .map((i) => ({
              id: String(i.id),
              url: storageUrl(String(i.public_url ?? ""), String(i.storage_path ?? "")),
              alt: String(i.alt_text ?? ""),
              type: String(i.type ?? "front"),
              order: Number(i.sort_order ?? 0),
            }))}
          initialVariants={variants
            .filter((v) => v.active)
            .map((v) => ({ size: v.size, stock: v.stock }))}
        />
      </div>
    </div>
  );
}
