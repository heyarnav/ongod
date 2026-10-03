/**
 * Resolve an image reference to something an <img> can load.
 *
 * Rows store `public_url` once media has been uploaded to the `ongod-media`
 * bucket. Before that happens the bucket path is still the source of truth, so
 * the public URL is derived from it — the bucket is public, so this URL works
 * with nothing more than the anon key.
 *
 * A value that already looks like a URL (or a site-relative path such as the
 * 3D model at /models/specimen.glb) is returned untouched.
 */
export function storageUrl(publicUrl?: string | null, storagePath?: string | null): string {
  const direct = (publicUrl ?? "").trim();
  if (direct && (/^https?:\/\//i.test(direct) || direct.startsWith("/"))) return direct;

  const path = (storagePath ?? "").trim();
  if (direct) return direct;
  if (!path) return "";

  if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "ongod-media";
  if (!base) return "";

  return `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, "")}`;
}