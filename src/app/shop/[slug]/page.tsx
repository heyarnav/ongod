import { notFound, redirect } from "next/navigation";
import { getProductBySlug } from "@/lib/products";

/**
 * /shop/[slug] — commerce paths forward to the artifact's canonical
 * archive record at /archive/[collection]/[object].
 */
export default async function ShopObjectForward({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p || p.status !== "PUBLISHED") notFound();
  redirect(`/archive/${p.collection?.slug ?? "human"}/${p.slug}`);
}
