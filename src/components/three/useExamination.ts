"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * "Artifact under examination" motion rig.
 * - idle: near-still with an almost imperceptible breathing sway
 * - pointer: whole-canvas parallax, eased, clamped
 * - drag: direct manipulation that gently decays back after release
 * - reduced motion: everything frozen at rest pose
 */
export function useExamination(opts?: {
  parallax?: number; // radians of pointer-follow tilt
  dragScale?: number; // radians per pixel of drag
  returnSpeed?: number; // 0..1 per frame lerp back to rest
  sway?: number; // idle sway amplitude, radians
}) {
  const {
    parallax = 0.06,
    dragScale = 0.0045,
    returnSpeed = 0.015,
    sway = 0.006,
  } = opts ?? {};

  const group = useRef<THREE.Group>(null);
  const target = useRef({ rx: 0, ry: 0 });
  const current = useRef({ rx: 0, ry: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const rest = useRef({ rx: 0, ry: 0 });
  const elapsed = useRef(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    elapsed.current += delta;

    if (reduced.current) {
      g.rotation.x = rest.current.rx;
      g.rotation.y = rest.current.ry;
      return;
    }

    // pointer parallax (canvas-space, already updated by the Canvas)
    const px = state.pointer.x * parallax;
    const py = state.pointer.y * parallax * 0.6;

    const tx = rest.current.rx + py + target.current.rx;
    const ty = rest.current.ry + px + target.current.ry;

    const k = dragging.current ? 0.18 : 1 - Math.pow(1 - returnSpeed, delta * 60);
    current.current.rx += (tx - current.current.rx) * k;
    current.current.ry += (ty - current.current.ry) * k;

    if (!dragging.current) {
      target.current.rx *= 0.95;
      target.current.ry *= 0.95;
    }

    const breathe = Math.sin(elapsed.current * 0.5) * sway;

    g.rotation.x = current.current.rx + breathe * 0.4;
    g.rotation.y = current.current.ry + breathe;
  });

  const onPointerDown = (e: { clientX: number; clientY: number }) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      target.current.ry += (ev.clientX - last.current.x) * dragScale;
      target.current.rx += (ev.clientY - last.current.y) * dragScale;
      target.current.rx = Math.max(-0.5, Math.min(0.5, target.current.rx));
      last.current = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { group, onPointerDown };
}

/** Adapter: R3F PointerEvent -> DOM drag handlers. Spread onto any mesh/group. */
export function toR3FHandlers(
  onPointerDown: (e: { clientX: number; clientY: number }) => void,
) {
  return {
    onPointerDown: (e: import("@react-three/fiber").ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onPointerDown({ clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
    },
  };
}
