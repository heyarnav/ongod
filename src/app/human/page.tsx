import { getCollections, getProducts } from "@/lib/products";
import { CollectionWorld } from "@/components/collection/CollectionWorld";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "HUMAN — what are we?",
  description:
    "A study of the body. Its structure. Its limits. Its potential. Its decay. Not a celebration of perfection, but a documentation of becoming.",
};

export default async function HumanPage() {
  const [collection, products] = await Promise.all([
    getCollections().then((cs) => cs.find((c) => c.slug === "human") ?? null),
    getProducts({ collectionSlug: "human" }),
  ]);

  if (!collection) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-[11px] tracking-archive text-bone/126">
          HUMAN / 001 — SEALED. RETURN SHORTLY.
        </p>
      </div>
    );
  }

  return (
    <CollectionWorld
      collection={collection}
      products={products}
      fragments={[
        { src: "/images/human-flayed.jpg", caption: "MUSCULAR SYSTEM", span: "md:col-span-5 md:row-span-2 md:aspect-auto" },
        { src: "/images/human-spine.jpg", caption: "SPINAL COLUMN", span: "md:col-span-3" },
        { src: "/images/fragment-heart.jpg", caption: "CARDIAC FIG. 04", span: "md:col-span-4" },
        { src: "/images/fragment-bust-mini.jpg", caption: "MARBLE / FORM", span: "md:col-span-3" },
        { src: "/images/product-skeleton.jpg", caption: "SKELETAL PRINT", span: "md:col-span-4" },
      ]}
      statement={["THE BODY BREAKS.", "REPAIRS. ADAPTS.", "REPEATS."]}
      statementBy="HUMAN / 001 — FIELD NOTE"
      note="Not a celebration of perfection, but a documentation of becoming. Every scar is an annotation. Every limitation, a measurement."
    />
  );
}
