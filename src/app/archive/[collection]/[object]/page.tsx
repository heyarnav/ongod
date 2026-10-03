import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getCollection, getProducts } from "@/lib/products";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  RedLine,
  RegistrationMark,
} from "@/components/ui/marks";
import { ArtifactViewer } from "@/components/product/ArtifactViewer";
import { AcquirePanel } from "@/components/product/AcquirePanel";
import { PreOrderPanel } from "@/components/product/PreOrderPanel";
import { PlateNumber } from "@/components/ui/PlateNumber";
import { dropInfo } from "@/lib/drop";
import { recordEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * /archive/human/human-001-form — the canonical artifact catalog.
 * The record lives at its archival address; /shop/[slug] forwards here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string; object: string }>;
}) {
  const { object } = await params;
  const p = await getProductBySlug(object);
  if (!p) return { title: "Object not found" };
  return {
    title: p.seoTitle || `${p.collection?.name ?? "ARCHIVE"} / ${p.archiveNumber} — ${p.name}`,
    description: p.seoDescription || p.description,
    openGraph: {
      title: p.seoTitle || `${p.name} — on god.`,
      description: p.seoDescription || p.description,
      images: p.ogImage ? [p.ogImage] : p.cover ? [p.cover] : [],
    },
    alternates: { canonical: `/archive/${p.collection?.slug ?? "human"}/${p.slug}` },
  };
}

const DETAILS: Array<[string, string]> = [
  ["FABRIC", "240 GSM heavyweight cotton. Garment-dyed, enzyme washed. Pre-shrunk."],
  ["CONSTRUCTION", "Double-stitched seams. Ribbed collar. Drop shoulder. Boxy archive fit."],
  ["PRINT", "Water-based discharge print, front plate + spinal reverse. Distressed by design."],
  ["FIT", "Oversized. Model wears L. Measurements in the size register."],
];

export default async function ArtifactRecordPage({
  params,
}: {
  params: Promise<{ collection: string; object: string }>;
}) {
  const { collection: collectionSlug, object } = await params;

  // The archive address maps 1:1 to the object slug (e.g. 001-form → human-001-form).
  const product = await getProductBySlug(object);
  if (!product || product.status !== "PUBLISHED") notFound();

  // Verify the collection segment matches the object's realm; else the record
  // exists but not at this address.
  const realm = product.collection
    ? await getCollection(product.collection.slug)
    : null;
  if (!realm || realm.slug !== collectionSlug) notFound();

  // Recorded server-side: a view is a page render, so the server knows about
  // it even when the beacon never arrives. Never awaited on the render path.
  void recordEvent({
    name: "VIEW_PRODUCT",
    path: `/archive/${collectionSlug}/${object}`,
    productId: product.id,
  });

  const drop = dropInfo(product);

  const related = (await getProducts()).filter((p) => p.id !== product.id).slice(0, 2);

  return (
    <div className="relative">
      <PlateNumber total={4} />
      <RedLine nodes={2} className="right-[6%] opacity-40" />

      {/* breadcrumb register */}
      <div className="mx-auto max-w-[1600px] px-5 pt-8 md:px-10 md:pt-10">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-archive text-bone/46">
          <Link href="/archive" className="hover:text-bone/73">ARCHIVE</Link>
          <span>/</span>
          <Link href={`/${realm.slug}`} className="hover:text-bone/73">
            {realm.name}
          </Link>
          <span>/</span>
          <span className="text-bone/73">
            {product.archiveNumber} — {product.name}
          </span>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-14 px-5 py-8 md:grid-cols-12 md:gap-10 md:px-10 md:py-12">
        {/* ── examination column ─────────────────────────────────── */}
        <div className="md:col-span-7">
          <ArtifactViewer
            images={product.images}
            objectNo={product.archiveNumber}
            statusLabel={drop.label}
          />
        </div>

        {/* ── register column ────────────────────────────────────── */}
        <aside className="md:col-span-5 md:pl-6">
          <div className="md:sticky md:top-28">
            <div className="flex items-center gap-3">
              <RegistrationMark className="h-3 w-3" />
              <ArchiveLabel tone="crimson">
                {realm.name} / {realm.number}
              </ArchiveLabel>
            </div>
            <h1 className="mt-5 font-serif-d text-5xl font-light leading-[1.02] text-bone md:text-6xl">
              {product.name}
              {product.subtitle && (
                <span className="mt-1 block text-2xl italic text-bone/65">
                  {product.subtitle}
                </span>
              )}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ArchiveLabel tone="crimson">{drop.editionLabel}</ArchiveLabel>
              <span className="text-bone/36">·</span>
              <ArchiveLabel tone={drop.orderable ? "crimson" : "default"}>
                STATUS / {drop.label}
              </ArchiveLabel>
            </div>
            {drop.windowLabel && (
              <ArchiveLabel tone="faint" className="mt-2 block">
                {drop.windowLabel}
                <span className="ml-4">OBJECT NO. {product.archiveNumber}</span>
              </ArchiveLabel>
            )}

            <div className="mt-8">
              <AcquirePanel product={product} />
            </div>

            {/* pre-order process + status messaging — first paint, no scroll */}
            <div className="mt-6">
              <PreOrderPanel drop={drop} price={product.price} />
            </div>

            {product.story && (
              <p className="mt-10 border-t border-bone/26 pt-8 font-mono text-[11px] leading-relaxed text-bone/65">
                {product.story}
              </p>
            )}

            {/* object details register */}
            <div className="mt-10 border-t border-bone/26">
              {DETAILS.map(([k, v]) => (
                <details key={k} className="group border-b border-bone/26">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-mono text-[10px] tracking-archive text-bone/69 transition-colors hover:text-bone [&::-webkit-details-marker]:hidden">
                    {k}
                    <span className="text-bone/41 transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-5 font-mono text-[10px] leading-relaxed text-bone/60">{v}</p>
                </details>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ── related objects ─────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="mx-auto max-w-[1600px] border-t border-bone/26 px-5 py-20 md:px-10">
          <ArchiveLabel tone="faint">ADJACENT OBJECTS</ArchiveLabel>
          <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/archive/${r.collection?.slug ?? "human"}/${r.slug}`}
                data-cursor="VIEW OBJECT"
                className="group flex items-center gap-6"
              >
                {r.cover && (
                  <div className="relative h-36 w-28 shrink-0 overflow-hidden border border-bone/26">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.cover} alt={r.name} className="archive-img h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                  </div>
                )}
                <div>
                  <ArchiveLabel>{r.collection?.name} / {r.archiveNumber}</ArchiveLabel>
                  <div className="mt-2 font-serif-d text-2xl text-bone/90">{r.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
