import Link from "next/link";
import Image from "next/image";
import { getSettings } from "@/lib/settings";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  AnnotationLine,
  ArrowRight,
  Coordinates,
  Crosshair,
  MeasurementLine,
  OrbitalPath,
  RegistrationMark,
  RedLine,
} from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";
import { PlateNumber } from "@/components/ui/PlateNumber";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About — the study",
  description:
    "on god. is an independent clothing archive documenting existence — HUMAN, CELESTIAL, DIVINE.",
};

const REALMS = [
  {
    n: "001",
    name: "HUMAN",
    q: "What are we?",
    note: "THE BODY. ITS STRUCTURE, ITS LIMITS, ITS REPAIR.",
    href: "/human",
    live: true,
  },
  {
    n: "002",
    name: "CELESTIAL",
    q: "Where are we?",
    note: "ORBIT, CYCLE, TIDE — THE BODY MEASURED AGAINST THE SKY.",
    href: "/celestial",
    live: false,
  },
  {
    n: "003",
    name: "DIVINE",
    q: "What is above us?",
    note: "THE VEILED QUESTION — DOCUMENTED AT A RESPECTFUL DISTANCE.",
    href: "/divine",
    live: false,
  },
];

const METHOD = [
  ["01", "NUMBER", "Every release carries an archive number. Objects are catalogued, not stocked."],
  ["02", "EDITION", "First editions are produced once the pre-order window closes. No restocks."],
  ["03", "OBSERVE", "Crimson marks observation: measurements, annotations, the current state of a release."],
  ["04", "RECORD", "Each object records the method as it is learned — the archive documents itself."],
];

export default async function AboutPage() {
  const s = await getSettings();

  return (
    <div className="relative">
      <PlateNumber total={3} />
      <RedLine nodes={3} className="right-[8%] hidden opacity-30 lg:block" />

      {/* ── the study ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-[1600px] px-5 pb-20 pt-16 md:px-10 md:pb-28 md:pt-20">
        <Reveal>
          <div className="flex items-center gap-3">
            <RegistrationMark className="h-3.5 w-3.5" />
            <ArchiveLabel tone="crimson">THE STUDY</ArchiveLabel>
          </div>
          <h1 className="mt-6 font-serif-d text-6xl font-light leading-[1.02] text-bone md:text-8xl">
            A STUDY IN
            <br />
            EXISTENCE.
          </h1>
          <p className="mt-9 max-w-xl font-serif-d text-xl leading-[1.85] text-bone/77 md:text-2xl">
            on god. is an independent clothing archive documenting existence — the
            human experience, the universe it moves through, and what stands above
            it. The work is divided into three realms of inquiry, recorded in
            numbered garments and the imagery bound to them.
          </p>
          <MeasurementLine label="EST. 2026" className="mt-10 w-48" />
        </Reveal>
      </header>

      {/* ── the method — document principles, not features ────────── */}
      <section className="border-t border-bone/26">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-12 px-5 py-20 md:grid-cols-12 md:px-10 md:py-28">
          <div className="md:col-span-4">
            <Reveal>
              <ArchiveLabel tone="faint">[ METHOD ]</ArchiveLabel>
              <h2 className="mt-4 font-serif-d text-4xl font-light text-bone md:text-5xl">
                THE REGISTER
              </h2>
              <p className="mt-6 max-w-xs font-mono text-[11px] leading-relaxed text-bone/60">
                FOUR PRINCIPLES GOVERN EVERYTHING THIS ARCHIVE RELEASES.
              </p>
            </Reveal>
          </div>
          <div className="md:col-span-8">
            {METHOD.map(([num, title, body], i) => (
              <Reveal key={num} delay={i * 60}>
                <div className="grid grid-cols-[3rem_1fr] gap-x-6 border-t border-bone/26 py-7 first:border-t-0 md:grid-cols-[4rem_9rem_1fr] md:items-baseline">
                  <span className="font-mono text-[10px] tracking-archive text-bone/41">
                    {num}
                  </span>
                  <span className="font-mono text-[11px] tracking-archive text-crimson/85">
                    {title}
                  </span>
                  <p className="mt-3 font-serif-d text-lg leading-relaxed text-bone/77 md:col-span-1 md:mt-0 md:text-xl">
                    {body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── the three realms ──────────────────────────────────────── */}
      <section className="border-t border-bone/26">
        <div className="mx-auto max-w-[1600px] px-5 py-20 md:px-10 md:py-28">
          <Reveal>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <ArchiveLabel tone="faint">[ THE REALMS ]</ArchiveLabel>
                <h2 className="mt-4 font-serif-d text-4xl font-light text-bone md:text-5xl">
                  THREE QUESTIONS
                </h2>
              </div>
              <ArchiveLabel tone="faint">
                ONE EXISTS — TWO ARE SURVEYED
              </ArchiveLabel>
            </div>
          </Reveal>

          <div className="mt-14 space-y-0">
            {REALMS.map((r, i) => {
              const body = (
                <>
                  <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 md:grid-cols-[6rem_1fr_1fr_auto]">
                    <span className="font-mono text-sm text-crimson/90 tabular-nums">
                      {r.n}
                    </span>
                    <span className="font-serif-d text-4xl font-light text-bone md:text-6xl">
                      {r.name}
                    </span>
                    <span className="col-span-2 mt-2 font-serif-d text-lg italic text-bone/65 md:col-span-1 md:mt-0 md:text-xl">
                      {r.q}
                    </span>
                    <span className="col-span-2 mt-3 font-mono text-[9px] tracking-archive text-bone/46 md:col-span-1 md:mt-0 md:text-right">
                      {r.live ? "REALM OPEN" : "SURVEYED — UNRELEASED"}
                    </span>
                  </div>
                  <p className="mt-4 max-w-lg font-mono text-[10px] leading-relaxed text-bone/121">
                    {r.note}
                  </p>
                </>
              );
              return (
                <Reveal key={r.n} delay={i * 70}>
                  {r.live ? (
                    <Link
                      href={r.href}
                      data-cursor="ENTER"
                      className="group block border-t border-bone/26 py-12 first:border-t-0"
                    >
                      {body}
                      <span className="mt-6 inline-flex items-center gap-3 font-mono text-[10px] tracking-archive text-bone/65 transition-colors group-hover:text-crimson">
                        OPEN {r.n}
                        <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1.5" />
                      </span>
                    </Link>
                  ) : (
                    <div className="border-t border-bone/26 py-12 opacity-50 first:border-t-0">
                      {body}
                    </div>
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── the object — first release statement ──────────────────── */}
      <section className="border-t border-bone/26">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-14 px-5 py-20 md:grid-cols-12 md:px-10 md:py-28">
          <div className="relative md:col-span-5">
            <Reveal>
              <div className="scanband relative aspect-[4/5] overflow-hidden border border-bone/26">
                <Image
                  src="/images/hero-bust.jpg"
                  alt="Cracked marble bust under examination"
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="archive-img object-cover"
                  priority={false}
                />
                <Crosshair className="inset-0 opacity-50" />
                <AnnotationLine label="SPECIMEN" className="right-4 top-6 !flex" />
              </div>
              <OrbitalPath
                rings={2}
                className="absolute -left-14 -top-14 h-44 w-44 text-bone/19"
              />
            </Reveal>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <Reveal delay={120}>
              <ArchiveLabel tone="crimson">THE FIRST OBJECT</ArchiveLabel>
              <h2 className="mt-5 font-serif-d text-4xl font-light leading-tight text-bone md:text-6xl">
                HUMAN / 001 —<br />
                <span className="italic">FORM</span>
              </h2>
              <p className="mt-7 max-w-md font-serif-d text-lg leading-[1.85] text-bone/73 md:text-xl">
                The study opens with the body. A heavyweight garment, printed with
                the anatomy it is worn against — a flayed figure, an eye, a spine, a
                heart. Produced as a first edition. Numbered, not restocked.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-6">
                <Link
                  href="/archive/human/human-001-form"
                  data-cursor="VIEW OBJECT"
                  className="group inline-flex items-center gap-3 border border-bone/41 px-6 py-3 font-mono text-[10px] tracking-archive text-bone transition-colors hover:border-crimson/70 hover:text-crimson"
                >
                  EXAMINE THE OBJECT
                  <ArrowRight className="transition-transform duration-500 group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── contact ───────────────────────────────────────────────── */}
      <section className="border-t border-bone/26">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-5 py-20 md:flex-row md:items-end md:justify-between md:px-10 md:py-24">
          <Reveal>
            <ArchiveLabel tone="faint">[ CORRESPONDENCE ]</ArchiveLabel>
            <a
              href={`mailto:${s.contact_email}`}
              data-cursor="[ WRITE ]"
              className="link-sweep mt-4 inline-block font-serif-d text-3xl font-light text-bone/90 hover:text-bone md:text-4xl"
            >
              {s.contact_email}
            </a>
            <Coordinates className="mt-6 !text-bone/26" x={7} y={21} z={3} />
          </Reveal>
          <Reveal delay={120}>
            <div className="max-w-xs font-mono text-[10px] leading-relaxed text-bone/46">
              FOR ORDERS, THE ACCOUNT PORTAL HOLDS EVERY RECORD. FOR EVERYTHING
              ELSE — OBSERVATIONS, CORRECTIONS, CONTRIBUTIONS — WRITE TO THE
              ARCHIVE.
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
