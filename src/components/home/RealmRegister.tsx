"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { cx } from "@/lib/format";
import { ArrowRight } from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";

export type Realm = {
  slug: string;
  name: string;
  number: string;
  subtitle: string;
  description: string;
  fragment: string;
};

/**
 * THE REALM REGISTER — the larger universe, folded small.
 * The three realms collapse into three hairline rows; a row expands on
 * hover (desktop) or tap to reveal its fragment plate. The universe is
 * present without owning the page — the current drop does that.
 */
export function RealmRegister({ realms }: { realms: Realm[] }) {
  const [open, setOpen] = useState<string | null>(realms[0]?.slug ?? null);

  return (
    <div className="border-t border-bone/26">
      {realms.map((r) => {
        const isOpen = open === r.slug;
        return (
          <Reveal key={r.slug}>
            <div
              onMouseEnter={() => setOpen(r.slug)}
              onClick={() => setOpen(r.slug)}
              data-cursor="OPEN"
              className={cx(
                "group relative border-b border-bone/26 transition-colors duration-700",
                isOpen ? "bg-graphite/40" : "hover:bg-graphite/25",
              )}
            >
              <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-6 px-5 md:grid-cols-12 md:px-10">
                {/* label row */}
                <div className="md:col-span-5">
                  <Link
                    href={`/${r.slug}`}
                    data-cursor="ENTER"
                    className="flex items-baseline gap-5 py-8"
                  >
                    <span
                      className={cx(
                        "font-mono text-[10px] tracking-archive transition-colors",
                        isOpen ? "text-crimson" : "text-bone/46",
                      )}
                    >
                      {r.number}
                    </span>
                    <span className="font-serif-d text-4xl font-light text-bone md:text-6xl">
                      {r.name}
                    </span>
                  </Link>
                </div>

                <div className="hidden md:col-span-3 md:block">
                  <p className="font-serif-d text-lg italic text-bone/65">{r.subtitle}</p>
                </div>

                {/* fragment plate — expands with the row */}
                <div className="hidden md:col-span-4 md:block">
                  <div
                    className={cx(
                      "scanband relative overflow-hidden border border-bone/26 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      isOpen ? "my-6 ml-auto h-40 w-full opacity-100" : "my-3 h-0 w-2/3 opacity-0",
                    )}
                  >
                    <Image
                      src={r.fragment}
                      alt={`${r.name} — ${r.subtitle}`}
                      fill
                      sizes="33vw"
                      className="archive-img object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* mobile description */}
              <div
                className={cx(
                  "mx-auto max-w-[1600px] px-5 transition-all duration-500 md:hidden",
                  isOpen ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <p className="overflow-hidden font-mono text-[10px] leading-relaxed text-bone/60">
                  {r.description}
                </p>
              </div>

              <Link
                href={`/${r.slug}`}
                data-cursor="ENTER"
                aria-label={`Open ${r.name}`}
                className={cx(
                  "absolute right-5 top-1/2 hidden -translate-y-1/2 items-center gap-2 font-mono text-[10px] tracking-archive transition-all duration-500 md:flex md:right-10",
                  isOpen ? "text-crimson opacity-100" : "text-bone/126 opacity-0",
                )}
              >
                OPEN
                <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
