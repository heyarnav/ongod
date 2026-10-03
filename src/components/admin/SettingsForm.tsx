"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { key: string; label: string; kind: "text" | "textarea"; value: string };

const inputCls =
  "w-full border border-line bg-void px-3 py-2 font-mono text-[12px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60";

export function SettingsForm({ groups }: { groups: Array<{ name: string; fields: Field[] }> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f.key, f.value]))),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    const settings = Object.entries(values).map(([key, value]) => ({ key, value }));
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    setStatus(res.ok ? "saved" : "error");
    if (res.ok) {
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <div className="mt-8">
      {groups.map((g) => (
        <section key={g.name} className="mb-6 border border-line">
          <p className="border-b border-line px-4 py-2 font-mono text-[9px] tracking-[0.3em] text-faint">
            {g.name.toUpperCase()}
          </p>
          <div className="grid gap-5 p-4">
            {g.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="block font-mono text-[9px] tracking-[0.25em] text-faint">
                  {f.label.toUpperCase()}
                </span>
                {f.kind === "textarea" ? (
                  <textarea
                    className={`${inputCls} mt-2 min-h-24`}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={`${inputCls} mt-2`}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-6 flex items-center gap-4 border border-line bg-abyss/95 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="border border-bone/126 bg-bone/12 px-5 py-2 font-mono text-[10px] tracking-[0.3em] text-bone transition-colors hover:border-crimson hover:text-crimson disabled:opacity-40"
        >
          {status === "saving" ? "SAVING…" : "SAVE SETTINGS"}
        </button>
        {status === "saved" && (
          <span className="font-mono text-[10px] tracking-[0.2em] text-crimson">SAVED ✓</span>
        )}
        {status === "error" && (
          <span className="font-mono text-[10px] tracking-[0.2em] text-crimson">SAVE FAILED</span>
        )}
      </div>
    </div>
  );
}
