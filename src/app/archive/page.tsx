import { getCollections } from "@/lib/products";
import { getSettings } from "@/lib/settings";
import { ArchiveIndex } from "@/components/archive/ArchiveIndex";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Archive",
  description: "The index of realms — HUMAN / CELESTIAL / DIVINE.",
};

export default async function ArchivePage() {
  const [collections, s] = await Promise.all([getCollections(), getSettings()]);
  return <ArchiveIndex collections={collections} note={s.archive_note} />;
}
