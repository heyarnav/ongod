import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";
import { CollectionInput, collectionColumns } from "@/lib/admin-schemas";

/** Control Room: the realms of the archive. */

function mapCollection(c: Record<string, unknown>) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    number: c.number,
    subtitle: c.subtitle,
    description: c.description,
    manifest: c.manifest,
    heroImage: c.hero_image,
    artwork: c.artwork,
    published: c.published,
    sortOrder: c.sort_order,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    productCount: Array.isArray(c.products) ? c.products.length : 0,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { data, error } = await createAdminClient()
    .from("collections")
    .select("*, products ( id )")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    collections: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(mapCollection),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const parsed = CollectionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "SLUG_EXISTS" }, { status: 409 });

  const { data: collection, error } = await supabase
    .from("collections")
    .insert(collectionColumns(parsed.data))
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { collection: mapCollection(collection as unknown as Record<string, unknown>) },
    { status: 201 },
  );
}