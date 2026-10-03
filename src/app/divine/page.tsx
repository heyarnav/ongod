import { getCollections, getProducts } from "@/lib/products";
import { CollectionWorld } from "@/components/collection/CollectionWorld";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "DIVINE — what is above us?",
  description:
    "The veiled figure. The unanswered measurement. The archive records what it cannot explain.",
};

export default async function DivinePage() {
  const [collection, products] = await Promise.all([
    getCollections().then((cs) => cs.find((c) => c.slug === "divine") ?? null),
    getProducts({ collectionSlug: "divine" }),
  ]);

  if (!collection) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-[11px] tracking-archive text-bone/126">
          DIVINE / 003 — SEALED. RETURN SHORTLY.
        </p>
      </div>
    );
  }

  return (
    <CollectionWorld
      collection={collection}
      products={products}
      fragments={[
        { src: "/images/fragment-veil.jpg", caption: "THE VEILED", span: "md:col-span-5 md:row-span-2 md:aspect-auto" },
        { src: "/images/collection-divine.jpg", caption: "ASCENSION STUDY", span: "md:col-span-3" },
        { src: "/images/label-macro.jpg", caption: "MARK OF THE ARCHIVE", span: "md:col-span-4" },
        { src: "/images/fragment-moon.jpg", caption: "WITNESS", span: "md:col-span-3" },
        { src: "/images/hero-bust.jpg", caption: "AFTER THE FALL", span: "md:col-span-4" },
      ]}
      statement={["SOMETHING WATCHES.", "IT WEARS A VEIL.", "IT KEEPS OUR RECORDS."]}
      statementBy="DIVINE / 003 — FIELD NOTE"
      note="The final realm is not an answer. It is the shelf where unanswerable questions are stored."
    />
  );
}
