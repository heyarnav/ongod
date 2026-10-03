import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { SETTING_META, SETTING_DEFAULTS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { data: rows } = await createAdminClient()
    .from("site_settings")
    .select("key, value");

  const values: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows ?? []) values[r.key] = r.value;

  const groups = [...new Set(SETTING_META.map((m) => m.group))];

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader section="SECTION 07" title="Settings" note="Site copy and banner text — no deploy needed." />
      <SettingsForm
        groups={groups.map((g) => ({
          name: g,
          fields: SETTING_META.filter((m) => m.group === g).map((m) => ({
            key: m.key,
            label: m.label,
            kind: m.kind,
            value: values[m.key] ?? "",
          })),
        }))}
      />
    </div>
  );
}
