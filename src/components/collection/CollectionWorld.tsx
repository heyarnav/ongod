import Image from "next/image";
import Link from "next/link";
import type { CollectionSummary, ProductSummary } from "@/types";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  AnnotationLine,
  ArrowRight,
  Coordinates,
  Crosshair,
  MeasurementLine,
  OrbitalPath,
  PlateIndex,
  RedLine,
  RegistrationMark,
  SpecimenTag,
} from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";
import { PlateNumber } from "@/components/ui/PlateNumber";
import { formatINR } from "@/lib/format";
import { dropInfo } from "@/lib/drop";

type Fragment = { src: string; caption: string; span: string };

/**
 * Shared "world" template used by /human /celestial /divine.
 * Asymmetric, fragment-led, plate-driven — not a category grid.
 */
export function CollectionWorld({
  collection,
  products,
  fragments,
  statement,
  statementBy,
  note,
}: {
  collection: CollectionSummary;
  products: ProductSummary[];
  fragments: Fragment[];
  statement: string[];
  statementBy: string;
  note: string;
}) {
  const first = products[0];

  return (
    <div className="relative">
      <PlateNumber total={6} />
      <RedLine nodes={4} className="left-[7%] opacity-50" />

      {/* ── masthead ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-5 pb-20 pt-28 md:grid-cols-12 md:px-10 md:pt-40">
          <div className="md:col-span-7">
            <Reveal>
              <div className="flex items-center gap-3">
                <RegistrationMark className="h-3.5 w-3.5" />
                <ArchiveLabel tone="crimson">
                  ARCHIVE / {collection.number}
                </ArchiveLabel>
              </div>
              <h1 className="mt-6 font-serif-d text-[16vw] font-light leading-[0.9] text-bone md:text-[9vw]">
                {collection.name}
              </h1>
              <p className="mt-4 font-serif-d text-2xl italic text-bone/73 md:text-3xl">
                {collection.subtitle}
              </p>
            </Reveal>
          </div>
          <div className="hidden md:col-span-4 md:col-start-9 md:block">
            <Reveal delay={150}>
              {collection.heroImage && (
                <div className="relative aspect-[3/4] overflow-hidden border border-bone/26">
                  <Image
                    src={collection.heroImage}
                    alt={collection.name}
                    fill
                    sizes="33vw"
                    className="archive-img object-cover"
                    priority
                  />
                  <Crosshair className="inset-0" />
                </div>
              )}
              <Coordinates className="mt-6" x={12} y={4} z={9} />
            </Reveal>
          </div>
        </div>
      </header>

      {/* ── full-bleed artwork plate ─────────────────────────────── */}
      {collection.artwork && (
        <section className="relative border-y border-bone/26">
          <div className="relative mx-auto max-w-[1600px] px-5 py-20 md:px-10 md:py-28">
            <Reveal>
              <div className="relative">
                <div className="scanband relative aspect-[16/9] overflow-hidden md:aspect-[21/9]">
                  <Image
                    src={collection.artwork}
                    alt={`${collection.name} — archival plate`}
                    fill
                    sizes="100vw"
                    className="archive-img object-cover"
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 border border-bone/26" />
                <div className="mt-4 flex items-center justify-between">
                  <ArchiveLabel tone="faint">PLATE / {collection.number}.01</ArchiveLabel>
                  <MeasurementLine label="640 MM" className="hidden w-48 md:flex" />
                  <SpecimenTag>{statementBy}</SpecimenTag>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── statement in the void ────────────────────────────────── */}
      <section className="relative">
        <div className="mx-auto max-w-[1600px] px-5 py-32 text-center md:px-10 md:py-48">
          <Reveal>
            {statement.map((line, i) => (
              <p
                key={i}
                className="font-serif-d text-3xl font-light leading-snug text-bone/93 md:text-5xl"
              >
                {line}
              </p>
            ))}
            <div className="mx-auto mt-10 h-px w-16 bg-crimson/70" />
            <ArchiveLabel tone="faint" className="mt-6 block">
              {statementBy}
            </ArchiveLabel>
            <p className="mx-auto mt-12 max-w-md font-mono text-[11px] leading-relaxed text-bone/126">
              {note}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── fragments: examination wall ──────────────────────────── */}
      <section className="relative border-t border-bone/26">
        <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-10 md:py-28">
          <div className="mb-14 flex items-center justify-between">
            <ArchiveLabel tone="crimson">EXAMINATION WALL</ArchiveLabel>
            <PlateIndex from="01" to={`0${fragments.length}`} />
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-12 md:gap-10">
            {fragments.map((f, i) => (
              <Reveal
                key={i}
                delay={i * 90}
                className={f.span}
              >
                <figure className="group relative">
                  <div className="scanband relative aspect-[3/4] overflow-hidden border border-bone/26">
                    <Image
                      src={f.src}
                      alt={f.caption}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="archive-img object-cover transition-transform duration-[1400ms] group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 border border-bone/12" />
                  </div>
                  <figcaption className="mt-3 flex items-center justify-between">
                    <ArchiveLabel tone="faint">FIG. 0{i + 1}</ArchiveLabel>
                    <span className="font-mono text-[9px] tracking-widest text-bone/121">
                      {f.caption}
                    </span>
                  </figcaption>
                  {i === 1 && (
                    <AnnotationLine label="OBSERVED" className="-right-4 top-6 !flex" />
                  )}
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── the artifact(s) of this realm ────────────────────────── */}
      {first &&
        (() => {
          const drop = dropInfo(first);
          return (
        <section className="relative border-t border-bone/26">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-12 px-5 py-24 md:grid-cols-12 md:px-10 md:py-36">
            <div className="md:col-span-5">
              <Reveal>
                <ArchiveLabel tone="crimson">THE FIRST EDITION</ArchiveLabel>
                <h2 className="mt-6 font-serif-d text-5xl font-light text-bone md:text-6xl">
                  {first.collection?.name} / {first.archiveNumber}
                  <br />
                  <span className="italic">{first.name}</span>
                </h2>
                <p className="mt-6 max-w-sm font-mono text-[11px] leading-relaxed text-bone/60">
                  {first.subtitle}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <ArchiveLabel tone="crimson">{drop.editionLabel}</ArchiveLabel>
                  <ArchiveLabel tone={drop.orderable ? "crimson" : "default"}>
                    STATUS / {drop.label}
                  </ArchiveLabel>
                </div>
                {drop.windowLabel && (
                  <ArchiveLabel tone="faint" className="mt-3 block">
                    {drop.windowLabel}
                  </ArchiveLabel>
                )}
                <div className="mt-8 flex items-center gap-6 font-mono text-sm text-bone/161">
                  {formatINR(first.price)}
                  <span className="h-px w-8 bg-bone/36" />
                  <span className="font-mono text-[10px] tracking-archive text-bone/126">
                    {drop.orderable ? "PRE-ORDER" : drop.label}
                  </span>
                </div>
                <Link
                  href={`/archive/${first.collection?.slug ?? "human"}/${first.slug}`}
                  data-cursor="VIEW OBJECT"
                  className="group mt-10 inline-flex items-center gap-3 border border-bone/41 px-6 py-3 font-mono text-[10px] tracking-archive text-bone transition-colors hover:border-crimson/70 hover:text-crimson"
                >
                  {drop.orderable ? "PRE-ORDER" : "EXAMINE OBJECT"}
                  <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1" />
                </Link>

                {/* release process — packaging is part of the artifact */}
                <div className="mt-14 max-w-sm">
                  <ArchiveLabel tone="faint">
                    PRODUCED · INSPECTED · PACKED · DISPATCHED
                  </ArchiveLabel>
                  <div className="mt-4 flex flex-wrap items-center font-mono text-[9px] tracking-widest text-bone/121">
                    {["PRODUCED", "INSPECTED", "PACKED", "DISPATCHED"].map((step, i) => (
                      <span key={step} className="flex items-center">
                        {i > 0 && <span className="mx-2 text-crimson/60">→</span>}
                        {step}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 font-mono text-[9px] leading-relaxed text-bone/46">
                    EACH ORDER IS INDIVIDUALLY PREPARED AND MARKED:
                    OBJECT / {first.archiveNumber} — {first.collection?.name} / {first.name} — ON GOD.
                  </p>
                </div>
              </Reveal>
            </div>
            <div className="md:col-span-6 md:col-start-7">
              <Reveal delay={140}>
                <Link href={`/archive/${first.collection?.slug ?? "human"}/${first.slug}`} data-cursor="VIEW OBJECT" className="block">
                  <div className="relative aspect-[4/5] overflow-hidden border border-bone/26">
                    {first.cover && (
                      <Image
                        src={first.cover}
                        alt={`${first.name} — garment artifact`}
                        fill
                        sizes="(max-width: 768px) 100vw, 46vw"
                        className="archive-img object-cover transition-transform duration-[1400ms] group-hover:scale-[1.02]"
                      />
                    )}
                    <Crosshair className="inset-0 opacity-50" />
                  </div>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
          );
        })()}

      {/* ── orbital seal footer band ─────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-bone/26">
        <div className="relative mx-auto flex max-w-[1600px] flex-col items-center px-5 py-28 md:px-10">
          <OrbitalPath rings={3} className="absolute h-64 w-64 text-bone/19" />
          <ArchiveLabel tone="faint" className="relative">
            {collection.name} / {collection.number} — CONTINUED
          </ArchiveLabel>
          <p className="relative mt-6 max-w-sm text-center font-serif-d text-xl italic leading-relaxed text-bone/65">
            &ldquo;{collection.subtitle}&rdquo;
          </p>
        </div>
      </section>
    </div>
  );
}
