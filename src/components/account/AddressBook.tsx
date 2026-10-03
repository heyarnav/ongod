"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import {
  ADDRESS_LABELS,
  ADDRESS_LABEL_TEXT,
  ADDRESS_LIMITS,
  formatAddress,
  type SavedAddress,
} from "@/lib/addresses";

/**
 * THE ADDRESS BOOK — saved destinations for the signed-in customer.
 * Add, edit, remove, and nominate one default. The list is passed in from
 * the server so it renders before any client fetch; every mutation goes to
 * /api/account/addresses and the server re-checks ownership.
 */

type Draft = Omit<SavedAddress, "id" | "isDefault">;

const EMPTY: Draft = {
  label: "HOME",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "IN",
};

const ERROR_TEXT: Record<string, string> = {
  INVALID_INPUT: "CHECK THE HIGHLIGHTED FIELDS.",
  ADDRESS_BOOK_FULL: `THE BOOK HOLDS ${ADDRESS_LIMITS.max} ADDRESSES. REMOVE ONE FIRST.`,
  NOT_FOUND: "THAT ADDRESS NO LONGER EXISTS.",
  UNAUTHORIZED: "SESSION EXPIRED — SIGN IN AGAIN.",
  SAVE_FAILED: "COULD NOT SAVE. TRY AGAIN.",
};

export function AddressBook({ initial }: { initial: SavedAddress[] }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<SavedAddress[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const atLimit = addresses.length >= ADDRESS_LIMITS.max;
  const isOpen = adding || editingId !== null;

  /**
   * Re-read the book after every mutation. The server-rendered `initial` is
   * only a first paint: a client component keeps its state when the server
   * re-renders, so relying on router.refresh() alone would leave a stale list.
   */
  async function reload() {
    const res = await fetch("/api/account/addresses");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.addresses)) setAddresses(data.addresses);
  }

  function startAdd() {
    setDraft(EMPTY);
    setEditingId(null);
    setAdding(true);
    setError(null);
    setNotice(null);
  }

  function startEdit(a: SavedAddress) {
    setDraft({
      label: a.label,
      name: a.name,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
    });
    setAdding(false);
    setEditingId(a.id);
    setError(null);
    setNotice(null);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, isDefault: false }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "SAVE_FAILED");
      cancel();
      await reload();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  /** Promote to default. Same endpoint, one field. */
  async function makeDefault(a: SavedAddress) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/addresses/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error("SAVE_FAILED");
      await reload();
      router.refresh();
    } catch {
      setError("SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: SavedAddress) {
    setBusy(true);
    setError(null);
    if (!window.confirm(`REMOVE ${a.label} — ${a.line1}?`)) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/account/addresses/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("SAVE_FAILED");
      if (editingId === a.id) cancel();
      setNotice("ADDRESS REMOVED.");
      await reload();
      router.refresh();
    } catch {
      setError("SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full border border-line bg-void px-3 py-2.5 font-mono text-[12px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60";
  const fieldLabel = "font-mono text-[9px] tracking-[0.25em] text-faint";

  return (
    <div>
      {/* ── the book ─────────────────────────────────────────────── */}
      {addresses.length === 0 ? (
        <p className="border border-line p-6 font-mono text-[11px] text-faint">
          No addresses on file. Add one below — it will be offered at checkout.
        </p>
      ) : (
        <ul className="border border-line">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start gap-4 border-b border-line/60 px-5 py-4 last:border-b-0"
            >
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <ArchiveLabel tone={a.isDefault ? "crimson" : "faint"}>
                    {ADDRESS_LABEL_TEXT[a.label as keyof typeof ADDRESS_LABEL_TEXT] ?? a.label}
                  </ArchiveLabel>
                  {a.isDefault && (
                    <span className="font-mono text-[9px] tracking-[0.25em] text-faint">
                      DEFAULT
                    </span>
                  )}
                </div>
                {a.name && (
                  <div className="mt-1.5 font-mono text-[12px] text-bone">{a.name}</div>
                )}
                <div className="mt-1 font-mono text-[11px] leading-relaxed text-bone/69">
                  {formatAddress(a)}
                </div>
                {a.phone && (
                  <div className="mt-1 font-mono text-[10px] text-faint">{a.phone}</div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-4">
                <button
                  onClick={() => startEdit(a)}
                  disabled={busy}
                  data-cursor="EDIT"
                  className="font-mono text-[10px] tracking-widest text-faint transition-colors hover:text-bone disabled:opacity-40"
                >
                  EDIT
                </button>
                {!a.isDefault && (
                  <button
                    onClick={() => makeDefault(a)}
                    disabled={busy}
                    data-cursor="DEFAULT"
                    className="font-mono text-[10px] tracking-widest text-faint transition-colors hover:text-crimson disabled:opacity-40"
                  >
                    MAKE DEFAULT
                  </button>
                )}
                <button
                  onClick={() => remove(a)}
                  disabled={busy}
                  data-cursor="REMOVE"
                  className="font-mono text-[10px] tracking-widest text-faint transition-colors hover:text-crimson disabled:opacity-40"
                >
                  REMOVE
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 font-mono text-[10px] text-crimson">{ERROR_TEXT[error] ?? error}</p>}
      {notice && !error && (
        <p className="mt-3 font-mono text-[10px] text-faint">{notice}</p>
      )}

      {/* ── add / edit ───────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={startAdd}
          disabled={atLimit}
          data-cursor="ADD"
          className="mt-6 w-full border border-bone/36 px-4 py-3.5 font-mono text-[10px] tracking-archive text-bone/73 transition-colors hover:border-crimson/60 hover:text-crimson disabled:cursor-not-allowed disabled:opacity-40"
        >
          {atLimit ? `BOOK IS FULL (${ADDRESS_LIMITS.max})` : "ADD AN ADDRESS +"}
        </button>
      )}

      {isOpen && (
        <form onSubmit={save} className="mt-6 border border-line p-5">
          <div className="flex items-center justify-between">
            <ArchiveLabel tone="crimson">
              {editingId ? "EDIT ADDRESS" : "NEW ADDRESS"}
            </ArchiveLabel>
            <button
              type="button"
              onClick={cancel}
              className="font-mono text-[10px] text-faint hover:text-bone"
            >
              CANCEL
            </button>
          </div>

          <div className="mt-5">
            <p className={fieldLabel}>LABEL</p>
            <div className="mt-2 flex gap-1.5">
              {ADDRESS_LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, label: l }))}
                  data-cursor="SELECT"
                  className={`border px-3 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
                    draft.label === l
                      ? "border-crimson/60 text-crimson"
                      : "border-line text-bone/69 hover:border-bone/46"
                  }`}
                >
                  {ADDRESS_LABEL_TEXT[l]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="RECIPIENT NAME (OPTIONAL)"
              className={inputCls}
            />
            <input
              maxLength={20}
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="PHONE (OPTIONAL)"
              className={inputCls}
            />
          </div>

          <div className="mt-3 space-y-3">
            <input
              required
              maxLength={200}
              value={draft.line1}
              onChange={(e) => setDraft((d) => ({ ...d, line1: e.target.value }))}
              placeholder="ADDRESS LINE 1"
              className={inputCls}
            />
            <input
              maxLength={200}
              value={draft.line2}
              onChange={(e) => setDraft((d) => ({ ...d, line2: e.target.value }))}
              placeholder="ADDRESS LINE 2 (OPTIONAL)"
              className={inputCls}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              required
              maxLength={80}
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              placeholder="CITY"
              className={inputCls}
            />
            <input
              required
              maxLength={80}
              value={draft.state}
              onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
              placeholder="STATE"
              className={inputCls}
            />
            <input
              required
              minLength={4}
              maxLength={10}
              value={draft.postalCode}
              onChange={(e) => setDraft((d) => ({ ...d, postalCode: e.target.value }))}
              placeholder="PINCODE"
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full border border-crimson/60 py-3 font-mono text-[10px] tracking-archive text-crimson transition-colors hover:bg-crimson hover:text-bone disabled:opacity-40"
          >
            {busy ? "SAVING…" : editingId ? "SAVE CHANGES" : "SAVE ADDRESS"}
          </button>
        </form>
      )}
    </div>
  );
}