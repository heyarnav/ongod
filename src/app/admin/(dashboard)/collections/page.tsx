import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader, Chip } from "@/components/admin/AdminTable";
import { CollectionManager } from "@/components/admin/CollectionManager";
import { storageUrl } from "@/lib/supabase/storage-url";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const { data } = await createAdminClient()
    .from("collections")
    .select("id, slug, name, number, subtitle, description, manifest, hero_image, artwork, published, sort_order, products ( id )")
    .order("sort_order", { ascending: true });

  const collections = data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader section="SECTION 02" title="Collections" note="Realms of the archive." />
      <CollectionManager
        collections={collections.map((c) => ({
          id: String(c.id),
          slug: String(c.slug),
          name: String(c.name),
          number: String(c.number),
          subtitle: String(c.subtitle ?? ""),
          description: String(c.description ?? ""),
          manifest: String(c.manifest ?? ""),
          heroImage: storageUrl(c.hero_image),
          artwork: storageUrl(c.artwork),
          published: Boolean(c.published),
          sortOrder: Number(c.sort_order ?? 0),
          productCount: Array.isArray(c.products) ? c.products.length : 0,
        }))}
      />
      <div className="mt-6">
        <Chip tone="info">NOTE</Chip>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
          Published collections appear on the home page, /archive and the index. The dedicated
          editorial page for a realm lives at /&lt;slug&gt; (e.g. /human).
        </p>
      </div>
    </div>
  );
}
