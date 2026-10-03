"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";

/**
 * SPECIMEN HERO — the examined object.
 *
 * Preferred stage: the self-hosted scan at /models/specimen.glb, rendered
 * by our own R3F examination rig — transparent canvas floating over the
 * page void, continuous turntable, drag to rotate, crimson survey marks.
 * No third-party chrome: no byline overlay, no badge, no forced stage
 * color.
 *
 * If the GLB is absent, the hero falls back to the Sketchfab embed of the
 * same object; if that cannot load either, a quiet examination plate.
 */

const SpecimenArtifact = dynamic(
  () => import("./SpecimenArtifact").then((m) => m.SpecimenArtifact),
  { ssr: false, loading: () => null },
);

const GLB_URL = "/models/specimen.glb";

const EMBED_SRC =
  "https://sketchfab.com/models/de078950bd474c73bb6cd7e1cf31de9b/embed" +
  "?autostart=1&preload=1&transparent=1&dnt=1&autospin=0.25" +
  "&ui_animations=0&ui_stop=0&ui_inspector=0&ui_watermark_link=0" +
  "&ui_watermark=0&ui_hint=0&ui_ar=0&ui_help=0&ui_settings=0" +
  "&ui_vr=0&ui_fullscreen=0&ui_annotations=0&ui_theme=dark&ui_scrollwheel=0";

export function SpecimenHero({ className }: { className?: string }) {
  // null = probing, true = GLB available, false = use embed
  const [glb, setGlb] = useState<boolean | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [staged, setStaged] = useState(false);
  const onReady = useCallback(() => setStaged(true), []);

  useEffect(() => {
    let dead = false;
    fetch(GLB_URL, { method: "HEAD" })
      .then((r) => {
        if (!dead) setGlb(r.ok);
      })
      .catch(() => {
        if (!dead) setGlb(false);
      });
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className={cx("relative h-full w-full", className)}>
      {/* examination field behind the object */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 40%, rgba(30,28,24,0.7) 0%, rgba(13,12,10,0.95) 100%)",
        }}
      />

      {/* the artifact itself — transparent canvas over the void */}
      {glb === true && <SpecimenArtifact onReady={onReady} />}

      {/* while the geometry streams: the rig is lit but the plate is empty.
          saying so beats flashing a stand-in object */}
      {glb === true && !staged && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-24">
          <span className="animate-pulse font-mono text-[9px] tracking-archive text-bone/35">
            STAGING SPECIMEN GEOMETRY
          </span>
        </div>
      )}

      {/* interim stage: Sketchfab embed until the GLB exists */}
      {glb === false && !embedFailed && (
        <EmbedStage onFail={() => setEmbedFailed(true)} />
      )}

      {/* museum vignette — feathers the stage into the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 95% at 50% 45%, transparent 52%, rgba(19,18,16,0.55) 78%, rgba(19,18,16,0.97) 100%)",
        }}
      />

      {/* quiet plate if nothing can render */}
      {glb === false && embedFailed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-archive text-bone/40">
            [ SPECIMEN UNAVAILABLE ]
          </span>
        </div>
      )}
    </div>
  );
}

/** Sketchfab fallback stage (only used while no GLB is hosted). */
function EmbedStage({ onFail }: { onFail: () => void }) {
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(false);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    failTimerRef.current = setTimeout(() => {
      if (!loadedRef.current) onFail();
    }, 12000);
    return () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    };
  }, [onFail]);

  return (
    <iframe
      title="Marble torso from a statue of Dionysos — on god. SPECIMEN 001"
      src={EMBED_SRC}
      onLoad={() => {
        loadedRef.current = true;
        if (failTimerRef.current) clearTimeout(failTimerRef.current);
        setTimeout(() => setReady(true), 600);
      }}
      allow="autoplay; fullscreen; xr-spatial-tracking"
      allowFullScreen
      frameBorder="0"
      className={cx(
        "absolute inset-0 h-full w-full transition-opacity duration-[1600ms]",
        ready ? "opacity-100" : "opacity-0",
      )}
      style={{ border: 0 }}
    />
  );
}
