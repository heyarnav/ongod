"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { emptyForm, type ProductFormValues } from "@/lib/product-form";

export { emptyForm };
export type { ProductFormValues };

type CollectionOption = { id: string; name: string; number: string };

const SIZE_AXIS = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const IMAGE_TYPES = ["hero", "front", "back", "detail", "artwork", "thumbnail"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

type DraftImage = { url: string; alt: string; type: ImageType; order: number };
type DraftVariant = { size: string; stock: number };

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[9px] tracking-[0.25em] text-faint">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1 block font-mono text-[9px] text-faint/60">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full border border-line bg-void px-3 py-2 font-mono text-[12px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60";

export function ProductForm({
  collections,
  initial,
  initialImages = [],
  initialVariants = [],
  productId,
}: {
  collections: CollectionOption[];
  initial?: Partial<ProductFormValues>;
  initialImages?: Array<{ id: string; url: string; alt: string; type: string; order: number }>;
  initialVariants?: Array<{ size: string; stock: number }>;
  productId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValues>({ ...emptyForm(), ...initial });
  const [images, setImages] = useState<DraftImage[]>(
    initialImages.map((i) => ({ url: i.url, alt: i.alt, type: (i.type as ImageType) ?? "front", order: i.order })),
  );
  const [variantStock, setVariantStock] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const size of SIZE_AXIS) map[size] = 0;
    for (const vv of initialVariants) if (vv.size in map) map[vv.size] = vv.stock;
    return map;
  });
  const [enabledSizes, setEnabledSizes] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const size of SIZE_AXIS) map[size] = false;
    for (const vv of initialVariants) if (vv.size in map) map[vv.size] = true;
    return map;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const upload = useCallback(async (files: FileList) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setImages((prev) => [
        ...prev,
        ...data.files.map((f: { url: string }, i: number) => ({
          url: f.url,
          alt: "",
          type: "front" as ImageType,
          order: prev.length + i,
        })),
      ]);
    } finally {
      setUploading(false);
    }
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const variants: DraftVariant[] = SIZE_AXIS.filter((s) => enabledSizes[s]).map((s) => ({
        size: s,
        stock: Math.max(0, Math.floor(variantStock[s] || 0)),
      }));

      const payload = {
        slug: v.slug.trim(),
        name: v.name.trim(),
        archiveNumber: v.archiveNumber.trim() || "000",
        subtitle: v.subtitle,
        collectionId: v.collectionId || null,
        description: v.description,
        story: v.story,
        purpose: v.purpose,
        limitation: v.limitation,
        state: v.state,
        adaptation: v.adaptation,
        price: Math.max(0, Math.round(parseFloat(v.priceRupees || "0") * 100)),
        comparePrice: v.comparePriceRupees
          ? Math.max(0, Math.round(parseFloat(v.comparePriceRupees) * 100))
          : null,
        model: v.model,
      featured: v.featured,
      status: v.status,
      dropStatus: v.dropStatus,
      editionLabel: v.editionLabel,
      preOrderStartsAt: v.preOrderStarts ? new Date(v.preOrderStarts).toISOString() : null,
      preOrderEndsAt: v.preOrderEnds ? new Date(v.preOrderEnds).toISOString() : null,
      productionPeriod: v.productionPeriod,
      dispatchPeriod: v.dispatchPeriod,
      preOrderNotice: v.preOrderNotice,
      inProductionMessage: v.inProductionMessage,
      fulfillingMessage: v.fulfillingMessage,
      soldOutMessage: v.soldOutMessage,
      seoTitle: v.seoTitle,
        seoDescription: v.seoDescription,
        ogImage: v.ogImage,
        sortOrder: v.sortOrder,
        sizes: variants,
        images: images.map((img, i) => ({ ...img, order: i })),
      };

      const res = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "SLUG_EXISTS"
            ? "That slug is already taken."
            : data.error === "INVALID_INPUT"
              ? "Check the highlighted fields — some input is invalid."
              : (data.error ?? "Save failed"),
        );
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!productId) return;
    if (!confirm("Delete this object permanently? This cannot be undone.")) return;
    setBusy(true);
    await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
    router.push("/admin/products");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl pb-16">
      {/* ── Identity ─────────────────────────────────────────────── */}
      <section className="border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
          IDENTITY
        </p>
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <Field label="NAME">
            <input
              className={inputCls}
              value={v.name}
              placeholder="FORM"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="SLUG" hint="URL: /shop/<slug> — lowercase, hyphens">
            <input
              className={inputCls}
              value={v.slug}
              placeholder="human-001-form"
              disabled={Boolean(productId)}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            />
          </Field>
          <Field label="ARCHIVE NUMBER">
            <input
              className={inputCls}
              value={v.archiveNumber}
              onChange={(e) => set("archiveNumber", e.target.value)}
            />
          </Field>
          <Field label="COLLECTION">
            <select
              className={inputCls}
              value={v.collectionId ?? ""}
              onChange={(e) => set("collectionId", e.target.value || null)}
            >
              <option value="">— none —</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SUBTITLE">
            <input className={inputCls} value={v.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
          </Field>
          <Field label="SORT ORDER">
            <input
              className={inputCls}
              type="number"
              value={v.sortOrder}
              onChange={(e) => set("sortOrder", parseInt(e.target.value || "0", 10))}
            />
          </Field>
        </div>
      </section>

      {/* ── Catalog ──────────────────────────────────────────────── */}
      <section className="mt-6 border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
          CATALOG
        </p>
        <div className="grid gap-5 p-4 md:grid-cols-3">
          <Field label="PRICE (₹)">
            <input
              className={inputCls}
              type="number"
              min="0"
              value={v.priceRupees}
              onChange={(e) => set("priceRupees", e.target.value)}
            />
          </Field>
          <Field label="COMPARE PRICE (₹, optional)">
            <input
              className={inputCls}
              type="number"
              min="0"
              value={v.comparePriceRupees}
              onChange={(e) => set("comparePriceRupees", e.target.value)}
            />
          </Field>
          <Field label="STATUS">
            <select
              className={inputCls}
              value={v.status}
              onChange={(e) => set("status", e.target.value as ProductFormValues["status"])}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </Field>
          <Field label="3D MODEL (GLB path, optional)" hint="e.g. /models/form.glb — served from /public">
            <input className={inputCls} value={v.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <div className="flex items-end gap-6">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-faint">
              <input
                type="checkbox"
                checked={v.featured}
                onChange={(e) => set("featured", e.target.checked)}
                className="accent-[#7F1518]"
              />
              FEATURED
            </label>
          </div>
        </div>
      </section>

      {/* ── Drop / pre-order lifecycle ─────────────────────────── */}
      <section className="mt-6 border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
          DROP / PRE-ORDER LIFECYCLE
        </p>
        <div className="grid gap-5 p-4 md:grid-cols-3">
          <Field label="DROP STATUS" hint="Controls all storefront messaging">
            <select
              className={inputCls}
              value={v.dropStatus}
              onChange={(e) => set("dropStatus", e.target.value)}
            >
              {[
                ["DRAFT", "DRAFT"],
                ["COMING_SOON", "COMING SOON"],
                ["PRE_ORDER", "PRE-ORDER OPEN"],
                ["PRE_ORDER_CLOSED", "PRE-ORDER CLOSED"],
                ["IN_PRODUCTION", "IN PRODUCTION"],
                ["FULFILLING", "FULFILLING"],
                ["SOLD_OUT", "SOLD OUT"],
                ["ARCHIVED", "ARCHIVED"],
              ].map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="EDITION LABEL">
            <input
              className={inputCls}
              value={v.editionLabel}
              onChange={(e) => set("editionLabel", e.target.value)}
            />
          </Field>
          <div />
          <Field label="PRE-ORDER WINDOW — STARTS">
            <input
              className={inputCls}
              type="datetime-local"
              value={v.preOrderStarts}
              onChange={(e) => set("preOrderStarts", e.target.value)}
            />
          </Field>
          <Field label="PRE-ORDER WINDOW — ENDS">
            <input
              className={inputCls}
              type="datetime-local"
              value={v.preOrderEnds}
              onChange={(e) => set("preOrderEnds", e.target.value)}
            />
          </Field>
          <Field label="ESTIMATED PRODUCTION" hint="Shown on the product page">
            <input
              className={inputCls}
              value={v.productionPeriod}
              placeholder="e.g. October 2026"
              onChange={(e) => set("productionPeriod", e.target.value)}
            />
          </Field>
          <Field label="ESTIMATED DISPATCH" hint="Shown at checkout">
            <input
              className={inputCls}
              value={v.dispatchPeriod}
              placeholder="e.g. November 2026"
              onChange={(e) => set("dispatchPeriod", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 border-t border-line p-4">
          <Field label="PRE-ORDER NOTICE" hint="Shown under the button and at checkout">
            <textarea
              className={`${inputCls} min-h-20`}
              value={v.preOrderNotice}
              placeholder="THIS IS A PRE-ORDER. …"
              onChange={(e) => set("preOrderNotice", e.target.value)}
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="IN PRODUCTION MESSAGE">
              <input
                className={inputCls}
                value={v.inProductionMessage}
                onChange={(e) => set("inProductionMessage", e.target.value)}
              />
            </Field>
            <Field label="FULFILLING MESSAGE">
              <input
                className={inputCls}
                value={v.fulfillingMessage}
                onChange={(e) => set("fulfillingMessage", e.target.value)}
              />
            </Field>
            <Field label="SOLD OUT MESSAGE">
              <input
                className={inputCls}
                value={v.soldOutMessage}
                onChange={(e) => set("soldOutMessage", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ── Specimen fields ──────────────────────────────────────── */}
      <section className="mt-6 border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
          SPECIMEN METADATA
        </p>
        <div className="grid gap-5 p-4 md:grid-cols-4">
          <Field label="PURPOSE">
            <input className={inputCls} value={v.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </Field>
          <Field label="LIMITATION">
            <input
              className={inputCls}
              value={v.limitation}
              onChange={(e) => set("limitation", e.target.value)}
            />
          </Field>
          <Field label="STATE">
            <input className={inputCls} value={v.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="ADAPTATION">
            <input
              className={inputCls}
              value={v.adaptation}
              onChange={(e) => set("adaptation", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 border-t border-line p-4">
          <Field label="DESCRIPTION">
            <textarea
              className={`${inputCls} min-h-24`}
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="STORY / CONCEPT NOTE">
            <textarea
              className={`${inputCls} min-h-20`}
              value={v.story}
              onChange={(e) => set("story", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* ── Inventory ────────────────────────────────────────────── */}
      <section className="mt-6 border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
          INVENTORY / SIZES
        </p>
        <div className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-6">
          {SIZE_AXIS.map((size) => (
            <div key={size} className="border border-line/70 p-3">
              <label className="flex items-center gap-2 font-mono text-[11px] text-bone">
                <input
                  type="checkbox"
                  checked={enabledSizes[size]}
                  onChange={(e) => setEnabledSizes((prev) => ({ ...prev, [size]: e.target.checked }))}
                  className="accent-[#7F1518]"
                />
                {size}
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                disabled={!enabledSizes[size]}
                value={enabledSizes[size] ? variantStock[size] : ""}
                onChange={(e) =>
                  setVariantStock((prev) => ({ ...prev, [size]: parseInt(e.target.value || "0", 10) }))
                }
                className="mt-2 w-full border border-line bg-void px-2 py-1 font-mono text-[11px] text-bone outline-none focus:border-crimson/60 disabled:opacity-30"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Media ────────────────────────────────────────────────── */}
      <section className="mt-6 border border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">MEDIA</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="font-mono text-[10px] tracking-[0.2em] text-crimson hover:underline disabled:opacity-40"
          >
            {uploading ? "UPLOADING…" : "+ UPLOAD IMAGES"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            hidden
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </div>
        <div className="p-4">
          {images.length === 0 ? (
            <p className="font-mono text-[11px] text-faint">
              No images yet. Upload front, back and detail plates.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img, i) => (
                <li key={`${img.url}-${i}`} className="border border-line/70 p-2">
                  <div className="relative aspect-square overflow-hidden bg-void">
                    <Image src={img.url} alt={img.alt} fill sizes="200px" className="object-cover" unoptimized />
                  </div>
                  <select
                    value={img.type}
                    onChange={(e) =>
                      setImages((prev) =>
                        prev.map((p, pi) => (pi === i ? { ...p, type: e.target.value as ImageType } : p)),
                      )
                    }
                    className="mt-2 w-full border border-line bg-void px-1 py-1 font-mono text-[9px] text-faint outline-none"
                  >
                    {IMAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-faint">
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, pi) => pi !== i))}
                      className="hover:text-crimson"
                    >
                      REMOVE
                    </button>
                    <span>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setImages((prev) => {
                              const next = [...prev];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              return next;
                            })
                          }
                          className="mr-2 hover:text-bone"
                        >
                          ←
                        </button>
                      )}
                      {i + 1}/{images.length}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── SEO ──────────────────────────────────────────────────── */}
      <section className="mt-6 border border-line">
        <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">SEO</p>
        <div className="grid gap-5 p-4">
          <Field label="SEO TITLE">
            <input className={inputCls} value={v.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
          </Field>
          <Field label="SEO DESCRIPTION">
            <textarea
              className={`${inputCls} min-h-16`}
              value={v.seoDescription}
              onChange={(e) => set("seoDescription", e.target.value)}
            />
          </Field>
          <Field label="OG IMAGE URL">
            <input className={inputCls} value={v.ogImage} onChange={(e) => set("ogImage", e.target.value)} />
          </Field>
        </div>
      </section>

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="border border-bone/126 bg-bone/12 px-6 py-3 font-mono text-[11px] tracking-[0.3em] text-bone transition-colors hover:border-crimson hover:text-crimson disabled:opacity-40"
        >
          {busy ? "SAVING…" : productId ? "SAVE CHANGES" : "CREATE OBJECT"}
        </button>
        {productId && (
          <button
            type="button"
            onClick={destroy}
            disabled={busy}
            className="border border-crimson/50 px-4 py-3 font-mono text-[10px] tracking-[0.25em] text-crimson/80 transition-colors hover:bg-crimson/10 disabled:opacity-40"
          >
            DELETE
          </button>
        )}
        {error && <p className="font-mono text-[11px] text-crimson">{error}</p>}
      </div>
    </div>
  );
}
