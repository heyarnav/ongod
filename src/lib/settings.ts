import "server-only";

import { createClient } from "./supabase/server";

/**
 * Editable site content. Everything the admin can change without a deploy
 * lives in `site_settings`; defaults keep the site presentable on first run.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  announcement: "FIRST EDITION — PRE-ORDER OPEN — HUMAN / 001 — FORM",
  home_kicker: "A STUDY IN EXISTENCE",
  home_line_1: "THE HUMAN",
  home_line_2: "EXPERIENCE,",
  home_line_3: "DOCUMENTED.",
  home_sub: "DISCIPLINE CREATES FREEDOM.",
  home_note: "A NEW ARCHIVE. THREE REALMS. ONE CONTINUUM. THE STUDY HAS BEGUN.",
  newdrop_title: "NEW DROP",
  newdrop_kicker: "001",
  newdrop_label: "HUMAN / 001 — FORM",
  newdrop_body:
    "The first object in the archive. A study of the body, its limits, and its potential. Produced as a first edition once the pre-order window closes.",
  archive_note: "THREE REALMS, ONE CONTINUUM.",
  footer_motto: "NOT JUST CLOTHING. A WAY OF BEING.",
  about_body:
    "on god. is a clothing archive documenting the human experience through three realms: HUMAN, CELESTIAL and DIVINE.",
  contact_email: "archive@ongod.in",
  instagram_url: "https://instagram.com/ongod",
};

export type SiteSettings = Record<string, string>;

export async function getSettings(): Promise<SiteSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error) throw error;

    const map: SiteSettings = { ...SETTING_DEFAULTS };
    for (const row of data ?? []) map[row.key] = row.value;
    return map;
  } catch {
    // Table not ready (first boot) — fall back to defaults rather than 500.
    return { ...SETTING_DEFAULTS };
  }
}

export async function getSetting(key: string): Promise<string> {
  const all = await getSettings();
  return all[key] ?? "";
}

export const SETTING_META: Array<{
  key: string;
  label: string;
  group: string;
  kind: "text" | "textarea";
}> = [
  { key: "announcement", label: "Announcement banner", group: "Banner", kind: "text" },
  { key: "home_kicker", label: "Home kicker — brand statement", group: "Home", kind: "text" },
  { key: "home_line_1", label: "Home headline — line 1", group: "Home", kind: "text" },
  { key: "home_line_2", label: "Home headline — line 2", group: "Home", kind: "text" },
  { key: "home_line_3", label: "Home headline — line 3", group: "Home", kind: "text" },
  { key: "home_sub", label: "Home sub statement", group: "Home", kind: "text" },
  { key: "home_note", label: "Home closing note", group: "Home", kind: "text" },
  { key: "newdrop_title", label: "New drop — title", group: "New drop", kind: "text" },
  { key: "newdrop_kicker", label: "New drop — kicker number", group: "New drop", kind: "text" },
  { key: "newdrop_label", label: "New drop — object label", group: "New drop", kind: "text" },
  { key: "newdrop_body", label: "New drop — body copy", group: "New drop", kind: "textarea" },
  { key: "archive_note", label: "Archive index note", group: "Archive", kind: "text" },
  { key: "footer_motto", label: "Footer motto", group: "Brand", kind: "text" },
  { key: "about_body", label: "About paragraph", group: "Brand", kind: "textarea" },
  { key: "contact_email", label: "Contact email", group: "Brand", kind: "text" },
  { key: "instagram_url", label: "Instagram URL", group: "Brand", kind: "text" },
];