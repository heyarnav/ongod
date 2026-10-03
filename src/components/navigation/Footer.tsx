import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";
import { AdminChromeGate } from "@/components/navigation/AdminChromeGate";

export async function Footer() {
  const s = await getSettings();
  return (
    <AdminChromeGate>
      <FooterBody s={s} />
    </AdminChromeGate>
  );
}

function FooterBody({
  s,
}: {
  s: Record<string, string>;
}) {
  return (
    <footer className="border-t border-bone/26 bg-abyss">
      <div className="mx-auto max-w-[1600px] px-5 py-12 md:px-10 md:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-black-d text-[28px] leading-none text-bone">on god.</div>
            <ArchiveLabel tone="faint" className="mt-3 block">
              {s.footer_motto}
            </ArchiveLabel>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-x-6 gap-y-2 md:gap-x-8">
              <Link href="/archive" className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone">
                ARCHIVE
              </Link>
              <Link href="/shop" className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone">
                SHOP
              </Link>
              <Link href="/about" className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone">
                ABOUT
              </Link>
              <Link href="/account" className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone">
                ACCOUNT
              </Link>
              <Link href="/policies" className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone">
                POLICIES
              </Link>
              <a
                href={s.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone"
              >
                INSTAGRAM
              </a>
              <a
                href={`mailto:${s.contact_email}`}
                className="link-sweep font-mono text-[10px] tracking-archive text-bone/65 hover:text-bone"
              >
                CONTACT
              </a>
            </div>
            <div className="mt-4 flex items-center gap-4 md:justify-end">
              <RegistrationMark className="h-3 w-3" />
              <ArchiveLabel tone="faint">EST. 2026 — HUMAN / CELESTIAL / DIVINE</ArchiveLabel>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-bone/12">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-3 md:px-10">
          <ArchiveLabel tone="faint">© 2026 on god. ALL RIGHTS RESERVED.</ArchiveLabel>
          <ArchiveLabel tone="faint">19.0760° N — 72.8777° E</ArchiveLabel>
        </div>
      </div>
    </footer>
  );
}
