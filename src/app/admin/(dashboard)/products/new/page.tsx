import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { ProductForm } from "@/components/admin/ProductForm";
import { emptyForm } from "@/lib/product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const supabase = createAdminClient();

  const [{ data: collections }, { count }] = await Promise.all([
    supabase
      .from("collections")
      .select("id, name, number")
      .order("sort_order", { ascending: true }),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader section="SECTION 01" title="New Object" note="Catalog a new artifact." />
      <div className="mt-8">
        <ProductForm
          collections={collections ?? []}
          initial={emptyForm(((count ?? 0) + 1) * 10)}
        />
      </div>
    </div>
  );
}
