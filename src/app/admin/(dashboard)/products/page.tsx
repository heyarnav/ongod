import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader, StatusChip } from "@/components/admin/AdminTable";
import { storageUrl } from "@/lib/supabase/storage-url";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const { data } = await createAdminClient()
    .from("products")
    .select(
      `id, slug, name, archive_number, price, status, sort_order, created_at,
       collections ( name ),
       product_images ( storage_path, public_url, type, sort_order ),
       product_variants ( stock, active )`,
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const products = data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        section="SECTION 01"
        title="Products"
        note="Objects held in the archive."
        action={
          <Link
            href="/admin/products/new"
            className="border border-crimson/70 px-4 py-2 font-mono text-[10px] tracking-[0.25em] text-crimson transition-colors hover:bg-crimson hover:text-bone"
          >
            + NEW OBJECT
          </Link>
        }
      />

      <div className="mt-8 overflow-x-auto border border-line">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[9px] tracking-[0.25em] text-faint">
              <th className="px-4 py-3 font-normal">OBJECT</th>
              <th className="px-4 py-3 font-normal">COLLECTION</th>
              <th className="px-4 py-3 font-normal">PRICE</th>
              <th className="px-4 py-3 font-normal">STOCK</th>
              <th className="px-4 py-3 font-normal">STATUS</th>
              <th className="px-4 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 font-mono text-[11px] text-faint">
                  No objects yet — create the first.
                </td>
              </tr>
            )}
            {products.map((p) => {
              const collection = Array.isArray(p.collections)
                ? p.collections[0]
                : p.collections;
              const images = (p.product_images ?? []) as Array<Record<string, string | number>>;
              // Rank by plate type so the card is not the back print.
              const rank: Record<string, number> = {
                hero: 0, front: 1, artwork: 2, detail: 3, back: 4, thumbnail: 5,
              };
              const cover = [...images].sort((a, b) => {
                const ra = rank[String(a.type)] ?? 6;
                const rb = rank[String(b.type)] ?? 6;
                if (ra !== rb) return ra - rb;
                return Number(a.sort_order) - Number(b.sort_order);
              })[0];
              const totalStock = ((p.product_variants ?? []) as Array<{ stock: number; active: boolean }>)
                .filter((v) => v.active)
                .reduce((sum, v) => sum + v.stock, 0);

              return (
                <tr key={p.id} className="border-b border-line/50 last:border-0 hover:bg-graphite/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 border border-line bg-void">
                        {cover && (
                          <Image
                            src={storageUrl(String(cover.public_url ?? ""), String(cover.storage_path ?? ""))}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-mono text-[11px] text-bone">
                          {p.name} / {p.archive_number}
                        </p>
                        <p className="font-mono text-[10px] text-faint">/{p.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-faint">
                    {collection?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-bone">
                    ₹{(Number(p.price) / 100).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    <span className={totalStock === 0 ? "text-crimson" : "text-faint"}>
                      {totalStock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={String(p.status)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-mono text-[10px] tracking-[0.2em] text-faint hover:text-bone"
                    >
                      EDIT →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}