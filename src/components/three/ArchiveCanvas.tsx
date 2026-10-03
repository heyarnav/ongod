"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";

/**
 * Shared examination-lab canvas: restrained warm key light, faint cool rim,
 * near-black floor. Shared across all artifact scenes. No glow, no bloom.
 */
export function ArchiveCanvas({
  children,
  className,
  camera = [0, 0.4, 6],
  fov = 32,
  shadows = true,
}: {
  children: React.ReactNode;
  className?: string;
  camera?: [number, number, number];
  fov?: number;
  shadows?: boolean;
}) {
  return (
    <Canvas
      className={className}
      camera={{ position: camera, fov }}
      dpr={[1, 1.5]}
      shadows={shadows}
      // MSAA is the single most expensive thing you can ask of an integrated
      // GPU; supersampling via dpr buys the same smoothness far cheaper.
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        scene.fog = new THREE.FogExp2("#131210", 0.06);
      }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}

/** Restrained 3-point archival lighting. */
export function ArtifactLights({ intensity = 1 }: { intensity?: number }) {
  return (
    <>
      <ambientLight intensity={0.22 * intensity} color="#3a3733" />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.15 * intensity}
        color="#e8e0cf"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 2, -4]} intensity={0.35 * intensity} color="#5a6672" />
      <spotLight
        position={[0, 7, 2]}
        angle={0.5}
        penumbra={0.9}
        intensity={0.5 * intensity}
        color="#cfc7b4"
      />
    </>
  );
}

/** Near-black floor to catch soft shadows. */
export function ArtifactFloor({ y = -1.6 }: { y?: number }) {
  return (
    <mesh receiveShadow position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[7, 48]} />
      <meshStandardMaterial color="#0d0c0b" roughness={0.95} metalness={0} />
    </mesh>
  );
}
