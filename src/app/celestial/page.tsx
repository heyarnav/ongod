import { getCollections, getProducts } from "@/lib/products";
import { CollectionWorld } from "@/components/collection/CollectionWorld";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CELESTIAL — where are we?",
  description:
    "Orbital mechanics of a small life. The archive measures our position among ancient light.",
};

export default async function CelestialPage() {
  const [collection, products] = await Promise.all([
    getCollections().then((cs) => cs.find((c) => c.slug === "celestial") ?? null),
    getProducts({ collectionSlug: "celestial" }),
  ]);

  if (!collection) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-[11px] tracking-archive text-bone/126">
          CELESTIAL / 002 — SEALED. RETURN SHORTLY.
        </p>
      </div>
    );
  }

  return (
    <CollectionWorld
      collection={collection}
      products={products}
      fragments={[
        { src: "/images/fragment-moon.jpg", caption: "LUNAR SURFACE", span: "md:col-span-5 md:row-span-2 md:aspect-auto" },
        { src: "/images/collection-celestial.jpg", caption: "ORBITAL CHART", span: "md:col-span-3" },
        { src: "/images/hero-bust-alt.jpg", caption: "OBSERVER", span: "md:col-span-4" },
        { src: "/images/collection-human-arch.jpg", caption: "THE SPECIMEN", span: "md:col-span-3" },
        { src: "/images/fragment-veil.jpg", caption: "BEYOND", span: "md:col-span-4" },
      ]}
      statement={["WE ARE MADE", "OF ANCIENT LIGHT.", "MEASURED IN ORBITS."]}
      statementBy="CELESTIAL / 002 — FIELD NOTE"
      note="The chart is not the sky. The orbit is not the life. We map our smallness to understand our scale."
    />
  );
}
