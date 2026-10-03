import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";
import { CollectionUpdateInput, collectionColumns } from "@/lib/admin-schemas";

/** Control Room: one collection. */

type Params = { params: Promise<{ id: string }> };

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

async function authorize() {
  const auth = await requireAdmin();
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const { data } = await createAdminClient()
    .from("collections")
    .select("*, products ( id )")
    .eq("id", id)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    collection: mapCollection(data as unknown as Record<string, unknown>),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const parsed = CollectionUpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await createAdminClient()
    .from("collections")
    .update(collectionColumns(parsed.data))
    .eq("id", id)
    .select("*, products ( id )")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    collection: mapCollection(data as unknown as Record<string, unknown>),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  // Products keep their content and are simply unlinked (ON DELETE SET NULL),
  // but silently orphaning a realm is almost never what was meant.
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "COLLECTION_NOT_EMPTY", count }, { status: 409 });
  }

  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}