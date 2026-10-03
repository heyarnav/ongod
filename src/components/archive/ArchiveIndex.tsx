"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { CollectionSummary } from "@/types";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  AnnotationLine,
  ArrowRight,
  Coordinates,
  OrbitalPath,
  RegistrationMark,
} from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";
import { PlateNumber } from "@/components/ui/PlateNumber";

const FRAGMENTS: Record<string, string> = {
  human: "/images/collection-human-arch.jpg",
  celestial: "/images/collection-celestial.jpg",
  divine: "/images/collection-divine.jpg",
};

export function ArchiveIndex({
  collections,
  note,
}: {
  collections: CollectionSummary[];
  note: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen">
      <PlateNumber total={4} />
      <OrbitalPath rings={4} className="fixed right-[-140px] top-1/3 h-[420px] w-[420px] text-bone/19" />

      {/* masthead */}
      <header className="relative mx-auto max-w-[1600px] px-5 pb-16 pt-28 md:px-10 md:pt-36">
        <Reveal>
          <div className="flex items-center gap-3">
            <RegistrationMark className="h-3.5 w-3.5" />
            <ArchiveLabel tone="crimson">INDEX OF REALMS</ArchiveLabel>
          </div>
          <h1 className="mt-6 font-serif-d text-6xl font-light tracking-wide text-bone md:text-8xl">
            THE ARCHIVE
          </h1>
          <p className="mt-5 font-mono text-[11px] tracking-wide text-bone/60">
            {note} <span className="text-bone/41">MMXXVI</span>
          </p>
        </Reveal>
      </header>

      {/* vertical index */}
      <div className="relative mx-auto max-w-[1600px] px-5 pb-32 md:px-10">
        <div className="absolute bottom-0 left-5 top-0 w-px bg-bone/19 md:left-10" />
        {collections.map((c, idx) => (
          <Reveal key={c.id} delay={idx * 80}>
            <Link
              href={`/${c.slug}`}
              data-cursor="ENTER"
              onMouseEnter={() => setActive(c.slug)}
              onMouseLeave={() => setActive(null)}
              className="group relative block border-b border-bone/26 py-14 pl-8 transition-colors md:py-20 md:pl-16"
            >
              {/* node on the timeline */}
              <span
                className={`absolute left-[-4.5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border transition-colors ${
                  active === c.slug ? "border-crimson bg-crimson" : "border-bone/46 bg-void"
                }`}
              />

              <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
                <div className="md:col-span-1">
                  <ArchiveLabel tone={active === c.slug ? "crimson" : "default"}>
                    {c.number}
                  </ArchiveLabel>
                </div>
                <div className="md:col-span-6">
                  <h2
                    className={`font-serif-d text-5xl font-light leading-none transition-all duration-500 md:text-7xl ${
                      active === c.slug ? "translate-x-2 text-bone" : "text-bone/167"
                    }`}
                  >
                    {c.name}
                  </h2>
                  <p className="mt-3 font-serif-d text-lg italic text-bone/65">{c.subtitle}</p>
                </div>
                <div className="md:col-span-4">
                  <div className="space-y-1 font-mono text-[10px] leading-relaxed text-bone/121">
                    <div>CLASS / {c.name}</div>
                    <div>STATUS / {c.published ? "OPEN" : "SEALED"}</div>
                    <div>OBJECTS / {c.number === "001" ? "01+" : "00"}</div>
                  </div>
                  <Coordinates className="mt-4 !text-bone/36" x={idx + 1} y={idx * 7 + 3} />
                </div>
                <div className="hidden justify-end md:col-span-1 md:flex">
                  <ArrowRight
                    className={`h-4 w-4 transition-all duration-500 ${
                      active === c.slug ? "translate-x-1 text-crimson" : "text-bone/41"
                    }`}
                  />
                </div>
              </div>

              {/* hover fragment — floats at the row edge */}
              <div
                className={`pointer-events-none absolute right-[8%] top-1/2 z-10 hidden w-52 -translate-y-1/2 transition-all duration-700 lg:block ${
                  active === c.slug ? "opacity-100" : "scale-95 opacity-0"
                }`}
              >
                {FRAGMENTS[c.slug] && (
                  <div className="relative aspect-[3/4] overflow-hidden border border-bone/26">
                    <Image
                      src={FRAGMENTS[c.slug]}
                      alt=""
                      fill
                      sizes="220px"
                      className="archive-img object-cover"
                    />
                    <AnnotationLine label={`FIG. 0${idx + 1}`} className="-left-6 top-3 !flex" />
                  </div>
                )}
              </div>
            </Link>
          </Reveal>
        ))}

        {/* seal */}
        <div className="flex items-center gap-4 pb-4 pl-8 pt-16 md:pl-16">
          <RegistrationMark className="h-4 w-4 text-bone/41" />
          <ArchiveLabel tone="faint">FURTHER REALMS — UNDISCLOSED</ArchiveLabel>
        </div>
      </div>
    </div>
  );
}
