import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";

/**
 * Control Room: adjust one size's stock.
 *
 * This is an operator override, so it writes an absolute number rather than a
 * delta — but the guard clause keeps a stale tab from writing a negative
 * count if a concurrent order has already drawn the stock down.
 */

const Body = z.object({ stock: z.number().int().min(0).max(9999) });

type Params = { params: Promise<{ variantId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { variantId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("product_variants")
    .update({ stock: parsed.data.stock })
    .eq("id", variantId)
    .select("id, product_id, size, stock, active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    variant: {
      id: data.id,
      productId: data.product_id,
      size: data.size,
      stock: data.stock,
      active: data.active,
    },
  });
}