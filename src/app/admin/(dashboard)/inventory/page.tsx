import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { InventoryGrid } from "@/components/admin/InventoryGrid";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const { data } = await createAdminClient()
    .from("products")
    .select(
      `id, name, archive_number, status, sort_order,
       collections ( name ),
       product_variants ( id, size, stock, active )`,
    )
    .neq("status", "ARCHIVED")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const products = data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader section="SECTION 03" title="Inventory" note="Per-size quantities. Changes save instantly." />
      <InventoryGrid
        products={products.map((p) => {
          const collection = Array.isArray(p.collections) ? p.collections[0] : p.collections;
          const variants = ((p.product_variants ?? []) as Array<{
            id: string;
            size: string;
            stock: number;
            active: boolean;
          }>)
            .filter((v) => v.active)
            .sort((a, b) => a.size.localeCompare(b.size));
          return {
            id: String(p.id),
            name: String(p.name),
            archiveNumber: String(p.archive_number),
            collectionName: collection?.name ?? "—",
            variants: variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock })),
          };
        })}
      />
    </div>
  );
}
