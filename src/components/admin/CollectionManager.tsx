"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/admin/AdminTable";

type Row = {
  id: string;
  slug: string;
  name: string;
  number: string;
  subtitle: string;
  description: string;
  heroImage: string;
  artwork: string;
  published: boolean;
  sortOrder: number;
  productCount: number;
};

const inputCls =
  "w-full border border-line bg-void px-3 py-2 font-mono text-[12px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60";

export function CollectionManager({ collections }: { collections: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    slug: "",
    name: "",
    number: "",
    subtitle: "",
    published: false,
  });

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error === "SLUG_EXISTS" ? "Slug already exists." : (data.error ?? "Create failed"));
      return;
    }
    setDraft({ slug: "", name: "", number: "", subtitle: "", published: false });
    setCreating(false);
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/admin/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  async function destroy(c: Row) {
    if (!confirm(`Delete collection ${c.name}? Its ${c.productCount} object(s) must be reassigned first.`))
      return;
    setBusy(true);
    const res = await fetch(`/api/admin/collections/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error === "COLLECTION_NOT_EMPTY" ? "Reassign its products first." : "Delete failed");
    router.refresh();
  }

  return (
    <div className="mt-8">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating((s) => !s)}
          className="border border-crimson/70 px-4 py-2 font-mono text-[10px] tracking-[0.25em] text-crimson transition-colors hover:bg-crimson hover:text-bone"
        >
          {creating ? "CANCEL" : "+ NEW COLLECTION"}
        </button>
      </div>

      {creating && (
        <div className="mt-4 border border-line p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="NAME — e.g. TERRA"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="SLUG — e.g. terra"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            />
            <input
              className={inputCls}
              placeholder="NUMBER — e.g. 004"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="SUBTITLE QUESTION — e.g. What lies beneath?"
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </div>
          <button
            onClick={create}
            disabled={busy || !draft.name || !draft.slug || !draft.number}
            className="mt-4 border border-bone/126 px-5 py-2 font-mono text-[10px] tracking-[0.25em] text-bone hover:border-crimson hover:text-crimson disabled:opacity-40"
          >
            CREATE
          </button>
        </div>
      )}

      {error && <p className="mt-4 font-mono text-[11px] text-crimson">{error}</p>}

      <ul className="mt-4 border border-line">
        {collections.map((c, i) => (
          <li key={c.id} className={`p-4 ${i > 0 ? "border-t border-line" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-serif text-xl text-crimson/80">{c.number}</span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg tracking-wide text-bone">
                  {c.name} <span className="font-mono text-[10px] text-faint">/{c.slug}</span>
                </p>
                <p className="font-mono text-[10px] text-faint">{c.subtitle}</p>
              </div>
              <Chip tone="off">{c.productCount} OBJECTS</Chip>
              <button
                onClick={() => patch(c.id, { published: !c.published })}
                className={`border px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] ${
                  c.published ? "border-bone/46 text-bone" : "border-line text-faint"
                }`}
              >
                {c.published ? "PUBLISHED" : "UNPUBLISHED"}
              </button>
              <button
                onClick={() => destroy(c)}
                className="font-mono text-[9px] tracking-[0.2em] text-faint hover:text-crimson"
              >
                DELETE
              </button>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer font-mono text-[10px] tracking-[0.2em] text-faint hover:text-bone">
                EDIT DETAILS
              </summary>
              <div className="mt-3 grid gap-3">
                <input
                  className={inputCls}
                  defaultValue={c.subtitle}
                  onBlur={(e) => e.target.value !== c.subtitle && patch(c.id, { subtitle: e.target.value })}
                  placeholder="Subtitle"
                />
                <textarea
                  className={`${inputCls} min-h-20`}
                  defaultValue={c.description}
                  onBlur={(e) => e.target.value !== c.description && patch(c.id, { description: e.target.value })}
                  placeholder="Realm description"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={inputCls}
                    defaultValue={c.heroImage}
                    onBlur={(e) => e.target.value !== c.heroImage && patch(c.id, { heroImage: e.target.value })}
                    placeholder="Hero image URL"
                  />
                  <input
                    className={inputCls}
                    defaultValue={c.artwork}
                    onBlur={(e) => e.target.value !== c.artwork && patch(c.id, { artwork: e.target.value })}
                    placeholder="Featured artwork URL"
                  />
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
