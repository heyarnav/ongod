import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";

/** Control Room: editable site copy. */

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select("*")
    .order("key", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: (data ?? []).map((s) => ({
      key: s.key,
      value: s.value,
      group: s.group_name,
      label: s.label,
      kind: s.kind,
      order: s.sort_order,
    })),
  });
}

const UpsertInput = z.object({
  settings: z
    .array(z.object({ key: z.string().min(1).max(80), value: z.string().max(2000) }))
    .min(1),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const parsed = UpsertInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error } = await createAdminClient()
    .from("site_settings")
    .upsert(
      parsed.data.settings.map((s) => ({ key: s.key, value: s.value })),
      { onConflict: "key" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: parsed.data.settings.length });
}