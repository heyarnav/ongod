"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Row = {
  id: string;
  url: string;
  alt: string;
  type: string;
  productName: string | null;
  createdAt: string;
};

export function MediaLibrary({ images }: { images: Row[] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        for (const f of Array.from(files)) fd.append("files", f);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "Upload failed");
      } catch {
        setError("Upload failed");
      } finally {
        setUploading(false);
        router.refresh();
      }
    },
    [router],
  );

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="mt-8">
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center border border-dashed px-6 py-10 transition-colors ${
          dragging ? "border-crimson/70 bg-crimson/5" : "border-line hover:border-bone/46"
        }`}
      >
        <p className="font-mono text-[11px] tracking-[0.25em] text-faint">
          {uploading ? "UPLOADING…" : "DROP IMAGES HERE — OR CLICK TO BROWSE"}
        </p>
        <p className="mt-2 font-mono text-[9px] text-faint/60">JPEG / PNG / WEBP / AVIF · 8 MB MAX</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      {error && <p className="mt-4 font-mono text-[11px] text-crimson">{error}</p>}

      {images.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((img) => (
            <li key={img.id} className="border border-line/70 p-2">
              <div className="relative aspect-square overflow-hidden bg-void">
                <Image src={img.url} alt={img.alt} fill sizes="200px" className="object-cover" unoptimized />
              </div>
              <p className="mt-2 truncate font-mono text-[9px] text-faint">
                {img.productName ?? "UNATTACHED"} · {img.type.toUpperCase()}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <button
                  onClick={() => copy(img.url)}
                  className="font-mono text-[9px] tracking-[0.15em] text-faint hover:text-bone"
                >
                  {copied === img.url ? "COPIED ✓" : "COPY URL"}
                </button>
                <span className="font-mono text-[8px] text-faint/50">
                  {new Date(img.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
