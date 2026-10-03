import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";

/**
 * Control Room: media upload.
 *
 * Uses the Supabase Storage SDK rather than hand-built REST calls, so the
 * bucket name, content type and public URL all come from the same source of
 * truth the rest of the application uses.
 *
 * There is no local /public/uploads fallback any more: Supabase Storage is the
 * only file system, and `ongod-media` is the only bucket.
 */

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

function bucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "ongod-media";
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) files.push(single);
  if (!files.length) return NextResponse.json({ error: "NO_FILES" }, { status: 400 });

  const supabase = createAdminClient();
  const bucket = bucketName();
  const prefix = typeof form.get("folder") === "string" ? String(form.get("folder")) : "uploads";

  const uploaded: Array<{ url: string; path: string; name: string; size: number }> = [];

  for (const file of files) {
    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return NextResponse.json({ error: "UNSUPPORTED_TYPE", type: file.type }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "FILE_TOO_LARGE", max: MAX_BYTES }, { status: 413 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);
    const path = `${prefix}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

    uploaded.push({
      url: urlData.publicUrl,
      path,
      name: file.name,
      size: file.size,
    });
  }

  return NextResponse.json({ files: uploaded, storage: "supabase", bucket }, { status: 201 });
}

/** Recent uploads are derivable from product_images — no separate table. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { data, error } = await createAdminClient()
    .from("product_images")
    .select(
      "id, storage_path, public_url, alt_text, type, sort_order, created_at, products ( name, slug )",
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    images: (data ?? []).map((i) => {
      const p = i.products as unknown as { name: string; slug: string } | null;
      const product = Array.isArray(p) ? p[0] : p;
      return {
        id: i.id,
        url: i.public_url || i.storage_path,
        storagePath: i.storage_path,
        alt: i.alt_text,
        type: i.type,
        order: i.sort_order,
        productName: product?.name ?? null,
        productSlug: product?.slug ?? null,
        createdAt: i.created_at,
      };
    }),
  });
}