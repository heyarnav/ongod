import Link from "next/link";
import Image from "next/image";
import { getCollections, getProducts } from "@/lib/products";
import { dropInfo } from "@/lib/drop";
import { formatINR } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { Crosshair, RegistrationMark } from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";
import { PlateNumber } from "@/components/ui/PlateNumber";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop — selected artifacts",
  description: "Garments as archive objects. Limited. Catalogued. Numbered.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ realm?: string }>;
}) {
  const [{ realm }, products, collections] = await Promise.all([
    searchParams,
    getProducts(),
    getCollections(),
  ]);
  const published = collections.filter((c) => c.published);
  const activeRealm =
    realm && published.some((c) => c.slug === realm) ? realm : null;
  const visible = activeRealm
    ? products.filter((p) => p.collection?.slug === activeRealm)
    : products;

  return (
    <div className="relative min-h-screen">
      <PlateNumber total={3} />

      <header className="mx-auto max-w-[1600px] px-5 pb-12 pt-16 md:px-10 md:pt-20">
        <Reveal>
          <div className="flex items-center gap-3">
            <RegistrationMark className="h-3.5 w-3.5" />
            <ArchiveLabel tone="crimson">SELECTED ARTIFACTS</ArchiveLabel>
          </div>
          <h1 className="mt-6 font-serif-d text-6xl font-light tracking-wide text-bone md:text-8xl">
            SHOP
          </h1>
          <p className="mt-5 font-mono text-[11px] tracking-wide text-bone/60">
            GARMENTS AS ARCHIVE OBJECTS. <span className="text-bone/41">NUMBERED. CATALOGUED.</span>
          </p>
        </Reveal>

        {/* realm filter — real filters, not decoration */}
        <nav aria-label="Filter by realm" className="mt-10 flex flex-wrap gap-x-8 gap-y-2">
          <Link
            href="/shop"
            data-cursor="FILTER"
            aria-current={!activeRealm ? "true" : undefined}
            className={cx(
              "font-mono text-[10px] tracking-archive transition-colors",
              !activeRealm ? "text-crimson" : "text-bone/121 hover:text-bone",
            )}
          >
            ALL
          </Link>
          {published.map((c) => (
            <Link
              key={c.id}
              href={`/shop?realm=${c.slug}`}
              data-cursor="FILTER"
              aria-current={activeRealm === c.slug ? "true" : undefined}
              className={cx(
                "font-mono text-[10px] tracking-archive transition-colors",
                activeRealm === c.slug ? "text-crimson" : "text-bone/121 hover:text-bone",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 pb-32 md:px-10">
        {visible.length === 0 && (
          <p className="border-t border-bone/26 py-24 text-center font-mono text-[11px] tracking-archive text-bone/121">
            {activeRealm
              ? `NO OBJECTS CATALOGUED UNDER ${activeRealm.toUpperCase()} YET.`
              : "THE ARCHIVE IS BEING CATALOGUED. RETURN SHORTLY."}
          </p>
        )}

        <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p, idx) => {
            const drop = dropInfo(p);
            const orderable = p.dropStatus === "PRE_ORDER";
            return (
              <Reveal key={p.id} delay={idx * 60}>
                <Link
                  href={`/archive/${p.collection?.slug ?? "human"}/${p.slug}`}
                  data-cursor="VIEW OBJECT"
                  className="group block"
                >
                  {/* plate */}
                  <div className="scanband relative aspect-[4/5] overflow-hidden border border-bone/26 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(26,25,22,0.55)_0%,rgba(13,12,10,0.92)_100%)]">
                    {p.cover && (
                      <Image
                        src={p.cover}
                        alt={`${p.collection?.name ?? ""} / ${p.archiveNumber} — ${p.name}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="archive-img object-contain transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
                      />
                    )}
                    <Crosshair className="inset-0 opacity-40" />
                    <div className="pointer-events-none absolute left-3 top-3">
                      <span className="border border-bone/26 bg-void/85 px-1.5 py-0.5 font-mono text-[9px] tracking-archive text-crimson backdrop-blur-sm">
                        {orderable ? "[ PRE-ORDER ]" : "[ " + drop.label + " ]"}
                      </span>
                    </div>
                  </div>

                  {/* catalog entry */}
                  <div className="mt-5">
                    <ArchiveLabel tone="faint">
                      {p.collection?.name ?? "ARCHIVE"} / {p.archiveNumber}
                    </ArchiveLabel>
                    <h2 className="mt-2 font-serif-d text-3xl font-light leading-tight text-bone">
                      {p.name}
                      {p.subtitle && (
                        <span className="block text-base italic text-bone/65">
                          {p.subtitle}
                        </span>
                      )}
                    </h2>
                    <div className="mt-4 flex items-baseline justify-between gap-4">
                      <span className="font-mono text-base text-bone/90">
                        {formatINR(p.price)}
                      </span>
                      <span className="font-mono text-[10px] tracking-archive text-bone/65 transition-colors group-hover:text-crimson">
                        [ VIEW OBJECT ]
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}
