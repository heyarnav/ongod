import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { storageUrl } from "@/lib/supabase/storage-url";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const { data } = await createAdminClient()
    .from("product_images")
    .select(
      "id, storage_path, public_url, alt_text, type, created_at, products ( name, slug )",
    )
    .order("created_at", { ascending: false })
    .limit(120);

  const images = data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        section="SECTION 06"
        title="Media"
        note="Uploads land in the ongod-media bucket on Supabase Storage."
      />
      <MediaLibrary
        images={images.map((i) => {
          const p = i.products as unknown as { name: string; slug: string } | null;
          const product = Array.isArray(p) ? p[0] : p;
          return {
            id: String(i.id),
            url: storageUrl(String(i.public_url ?? ""), String(i.storage_path ?? "")),
            alt: String(i.alt_text ?? ""),
            type: String(i.type ?? "front"),
            productName: product?.name ?? null,
            createdAt: new Date(String(i.created_at)).toISOString(),
          };
        })}
      />
    </div>
  );
}
