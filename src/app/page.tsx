import Link from "next/link";
import Image from "next/image";
import {
  getCollections,
  getProducts,
  getProductBySlug,
} from "@/lib/products";
import { getSettings } from "@/lib/settings";
import { dropInfo } from "@/lib/drop";
import { formatINR } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  AnnotationLine,
  ArrowRight,
  Coordinates,
  Crosshair,
  RedLine,
  RegistrationMark,
} from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";
import { PlateNumber } from "@/components/ui/PlateNumber";
import { WireTicker } from "@/components/ui/WireTicker";
import { SpecimenHero } from "@/components/three/SpecimenHero";
import { DropConsole } from "@/components/home/DropConsole";
import { RealmRegister } from "@/components/home/RealmRegister";

export const dynamic = "force-dynamic";

const WORLD_IMAGES: Record<string, string> = {
  human: "/images/collection-human-arch.jpg",
  celestial: "/images/collection-celestial.jpg",
  divine: "/images/collection-divine.jpg",
};

/**
 * HOME — a solo exhibition of the first object.
 * The page exists to sell HUMAN / 001 — FORM; the wider universe is kept
 * as a folded register below it. BRAND → OBJECT → REALMS → STUDY.
 */
export default async function HomePage() {
  const [collections, products, s] = await Promise.all([
    getCollections(),
    getProducts(),
    getSettings(),
  ]);

  const featuredSummary = products.find((p) => p.featured) ?? products[0] ?? null;
  const featured = featuredSummary
    ? await getProductBySlug(featuredSummary.slug)
    : null;
  const drop = featured ? dropInfo(featured) : null;

  const objectHref = featured
    ? `/archive/${featured.collection?.slug ?? "human"}/${featured.slug}`
    : "/archive";

  // THE WIRE — drop facts ticking past.
  const wireItems: Array<string | React.JSX.Element> = [
    s.announcement,
    ...(drop?.windowLabel ? [drop.windowLabel] : []),
    `${featured?.collection?.name ?? "HUMAN"} / ${featured?.archiveNumber ?? "001"} — ${featured?.name ?? "FORM"} — ${featured ? formatINR(featured.price) : "₹3,499"}`,
    "FIRST EDITION — NUMBERED — PRODUCED AFTER THE WINDOW CLOSES",
    <Link
      key="cta"
      href="#object"
      data-cursor="PRE-ORDER"
      className="text-crimson-bright underline decoration-crimson/60 underline-offset-4 transition-colors hover:text-crimson"
    >
      PRE-ORDER NOW
    </Link>,
  ];

  return (
    <>
      <PlateNumber total={6} />

      {/* ── THE WIRE — crimson ticker of drop facts ─────────────────── */}
      <WireTicker items={wireItems} className="mt-2" />

      {/* ── OPENING — brand thesis over the examined bust ───────────── */}
      <section className="relative flex min-h-[88vh] items-center overflow-hidden">
        <div className="absolute inset-y-0 right-[-32%] w-[128%] sm:right-[-4%] sm:w-[80%] md:right-0 md:w-[56%]">
          <SpecimenHero className="h-full w-full" />
        </div>
        {/* mobile scrim — the headline owns the left half, so the scrim is
            opaque under the type and clears toward the specimen */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-void via-void/88 to-void/20 md:hidden"
        />

        <RedLine nodes={3} className="left-1/2 hidden opacity-60 md:block" />

        {/* scroll cue — the record continues below */}
        <Link
          href="#object"
          data-cursor="SCROLL"
          aria-label="Scroll to the object record"
          className="group absolute bottom-5 right-5 z-10 flex flex-col items-center gap-2 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:gap-3"
        >
          <span className="font-mono text-[9px] tracking-archive text-bone/46 transition-colors group-hover:text-crimson">
            <span className="md:hidden">SCROLL</span>
            <span className="hidden md:inline">SCROLL — 001 · OBJECT DOSSIER</span>
          </span>
          <span className="relative block h-12 w-px overflow-hidden bg-bone/15">
            <span className="scroll-cue absolute inset-x-0 top-0 h-4 bg-crimson/80" />
          </span>
        </Link>

        <div className="pointer-events-none absolute inset-0">
          <Crosshair className="inset-0" />
          <Coordinates className="absolute bottom-10 left-5 hidden md:block" x={4} y={18} />
          <AnnotationLine
            label="SPECIMEN"
            className="right-[16%] top-[24%] hidden lg:flex"
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1600px] px-5 md:px-10">
          <div className="max-w-3xl">
            <Reveal>
              <div className="flex items-center gap-3">
                <RegistrationMark className="h-3.5 w-3.5" />
                <ArchiveLabel tone="crimson">{s.home_kicker}</ArchiveLabel>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <h1 className="mt-8 font-serif-d text-[13vw] font-light leading-[0.95] text-bone md:text-[7.2vw]">
                {s.home_line_1}
                <br />
                {s.home_line_2}
                <br />
                <span className="text-bone/90">{s.home_line_3}</span>
              </h1>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-8 h-px w-16 bg-bone/41" />
              <p className="mt-6 max-w-sm font-mono text-[11px] leading-relaxed tracking-wide text-bone/65">
                {s.home_note}
              </p>
            </Reveal>

            <Reveal delay={380}>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link
                  href="#object"
                  data-cursor="PRE-ORDER"
                  className="group inline-flex items-center gap-3 border border-crimson bg-crimson px-8 py-4 font-mono text-xs tracking-archive text-bone transition-colors hover:border-crimson/60 hover:bg-transparent hover:text-crimson"
                >
                  PRE-ORDER THE FIRST EDITION
                  <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1.5" />
                </Link>
                <Link
                  href="/archive"
                  data-cursor="ENTER"
                  className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 transition-colors hover:text-bone"
                >
                  ENTER THE ARCHIVE
                </Link>
              </div>
            </Reveal>

            <Reveal delay={440}>
              <p className="mt-6 font-mono text-[9px] tracking-widest text-bone/46">
                {featured ? `${formatINR(featured.price)} — ` : ""}
                {drop?.windowLabel ?? "FIRST EDITION"}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── NEW DROP — the object, purchasable in place ─────────────── */}
      {featured && drop && (
        <section id="object" className="cv-defer relative scroll-mt-24 border-t border-bone/26">
          <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-10 md:py-28">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-6 border-b border-bone/26 pb-8">
                <div>
                  <ArchiveLabel tone="crimson">[ {s.newdrop_kicker} — {s.newdrop_title} ]</ArchiveLabel>
                  <h2 className="mt-4 font-serif-d text-5xl font-light leading-none text-bone md:text-7xl">
                    {s.newdrop_label}
                  </h2>
                </div>
                <div className="max-w-xs">
                  <p className="font-mono text-[10px] leading-relaxed text-bone/60">
                    {s.newdrop_body}
                  </p>
                  <Link
                    href={objectHref}
                    data-cursor="EXAMINE"
                    className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] tracking-archive text-bone/73 transition-colors hover:text-crimson"
                  >
                    FULL RECORD
                    <ArrowRight />
                  </Link>
                </div>
              </div>
            </Reveal>

            <div className="mt-12">
              <DropConsole product={featured} drop={drop} />
            </div>
          </div>
        </section>
      )}

      {/* ── THE REALM REGISTER — the wider universe, folded ─────────── */}
      {collections.length > 0 && (
        <section className="cv-defer relative border-t border-bone/26">
          <div className="mx-auto max-w-[1600px] px-5 pt-16 md:px-10 md:pt-24">
            <Reveal>
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <ArchiveLabel tone="faint">[ THE ARCHIVE — THREE REALMS ]</ArchiveLabel>
                <Link
                  href="/archive"
                  data-cursor="ENTER"
                  className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone"
                >
                  OPEN FULL INDEX
                </Link>
              </div>
            </Reveal>
          </div>

          <div className="mt-10">
            <RealmRegister
              realms={collections.map((c) => ({
                slug: c.slug,
                name: c.name,
                number: c.number,
                subtitle: c.subtitle,
                description: c.description,
                fragment: WORLD_IMAGES[c.slug] ?? c.heroImage,
              }))}
            />
          </div>
        </section>
      )}

      {/* ── THE STUDY — closing statement ───────────────────────────── */}
      <section className="cv-defer relative border-t border-bone/26">
        <div className="mx-auto max-w-[1600px] px-5 py-28 md:px-10 md:py-36">
          <Reveal>
            <ArchiveLabel tone="faint">[ THE STUDY ]</ArchiveLabel>
            <p className="mt-8 max-w-2xl font-serif-d text-2xl font-light leading-[1.7] text-bone/167 md:text-3xl">
              on god. is a clothing archive documenting the human experience.
              Three realms of inquiry — <span className="text-bone">HUMAN</span>,{" "}
              <span className="text-bone">CELESTIAL</span>,{" "}
              <span className="text-bone">DIVINE</span> — recorded in numbered,
              first-edition objects and written dispatches.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-8">
              <Link
                href="/about"
                data-cursor="ENTER"
                className="group inline-flex items-center gap-3 border border-bone/41 px-6 py-3 font-mono text-[10px] tracking-archive text-bone transition-colors hover:border-crimson/70 hover:text-crimson"
              >
                ABOUT THE ARCHIVE
                <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/shop"
                data-cursor="ENTER"
                className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone"
              >
                SHOP
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
