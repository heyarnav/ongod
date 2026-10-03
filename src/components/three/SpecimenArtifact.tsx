"use client";

import { Suspense, Component, useMemo, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ArchiveCanvas, ArtifactFloor } from "./ArchiveCanvas";
import { useExamination, toR3FHandlers } from "./useExamination";
import { Centerline, OrbitRing, HeightTicks, Plinth } from "./columnParts";

/**
 * SPECIMEN HERO MODEL — self-hosted GLB in the examination rig.
 * Loads `public/models/specimen.glb`, auto-centered, grounded and lit by
 * the museum rig (crimson annotations stay live). The scan's own
 * photogrammetry textures are kept when present; untextured models are
 * re-materialized in the archive's bone marble.
 * Drop any classical .glb at that path to replace the artifact instantly.
 *
 * While the geometry streams, the stage holds only the survey marks and
 * plinth — never a stand-in object, so nothing wrong is ever shown.
 */

const SPECIMEN_GLB = "/models/specimen.glb";

/** Normalizes any GLB into the rig: centered, ~3.2 units tall, grounded. */
function GltfSpecimen({ onReady }: { onReady?: () => void }) {
  const { scene } = useGLTF(SPECIMEN_GLB);
  const prepared = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);

    // Cull baked photography backdrops: some scans ship the studio sweep
    // as extra geometry. Flat sheets (paper-thin relative to their span)
    // or meshes vastly larger than the rest are stage, not artifact.
    type Entry = { mesh: THREE.Mesh; maxDim: number; minDim: number };
    const entries: Entry[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        if (!bb) return;
        const s = bb.getSize(new THREE.Vector3());
        s.multiply(m.getWorldScale(new THREE.Vector3()));
        entries.push({
          mesh: m,
          maxDim: Math.max(s.x, s.y, s.z),
          minDim: Math.min(s.x, s.y, s.z),
        });
      }
    });
    const dims = entries.map((e) => e.maxDim).sort((a, b) => a - b);
    const median = dims[Math.floor(dims.length / 2)] ?? 1;
    entries.forEach((e) => {
      const flatSheet = e.minDim < 0.02 * e.maxDim;
      const stageSized = entries.length > 1 && e.maxDim > median * 3;
      if (flatSheet || stageSized) e.mesh.removeFromParent();
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 3.2 / Math.max(size.x, size.y, size.z, 0.001);
    root.scale.setScalar(scale);
    root.userData.base = scale;
    root.position.x -= center.x * scale;
    root.position.z -= center.z * scale;
    // Center vertically in the rig (camera looks at ~y=0); lift a touch so
    // the fragment floats above the plinth and floor shadow.
    root.position.y -= center.y * scale;
    root.position.y += 0.15;

    // Keep the scan's own textures (photogrammetry marble reads real);
    // only untextured models get the archive's bone marble material.
    let meshes = 0;
    let textured = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes += 1;
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const hasMap = Array.isArray(mat) ? mat.some((x) => !!x?.map) : !!mat?.map;
        if (hasMap) textured += 1;
      }
    });
    if (meshes > 0 && textured === 0) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#c4bba8"),
        roughness: 0.55,
        metalness: 0.02,
      });
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = mat;
        }
      });
    }
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
    return root;
  }, [scene]);

  // the specimen settles into the rig rather than popping into it
  const arrival = useRef(0);
  useEffect(() => {
    arrival.current = 0;
    onReady?.();
  }, [onReady]);
  useFrame((_, delta) => {
    if (arrival.current >= 1) return;
    arrival.current = Math.min(1, arrival.current + delta * 0.9);
    const t = 1 - Math.pow(1 - arrival.current, 3);
    const base = (prepared.userData.base as number) ?? 1;
    prepared.scale.setScalar(base * (0.94 + 0.06 * t));
  });

  return <primitive object={prepared} />;
}

class GltfBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RigBody({ children }: { children: React.ReactNode }) {
  const { group, onPointerDown } = useExamination({ parallax: 0.1, dragScale: 0.005, sway: 0.006 });
  const turntable = useRef<THREE.Group>(null);
  const spin = useRef(0.5);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((state, delta) => {
    if (reduced.current || !turntable.current) return;
    spin.current += delta * 0.12;
    turntable.current.rotation.y = spin.current;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const t = max > 0 ? window.scrollY / max : 0;
    turntable.current.rotation.z = Math.sin(t * Math.PI) * 0.05;
    turntable.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.03;
  });

  return (
    <group ref={turntable}>
      <group ref={group} {...toR3FHandlers(onPointerDown)}>
        {children}
      </group>
    </group>
  );
}

function SceneContent({ onReady }: { onReady?: () => void }) {
  return (
    <GltfBoundary>
      <RigBody>
        {/* the specimen itself — nothing stands in while it streams */}
        <Suspense fallback={null}>
          <GltfSpecimen onReady={onReady} />
        </Suspense>
        {/* survey marks stay lit throughout, so the stage reads as an
            examination rig rather than an empty plate */}
        <Centerline />
        <OrbitRing />
        <HeightTicks />
      </RigBody>
    </GltfBoundary>
  );
}

/** Scroll subtly drives the camera; narrow screens pull back. */
function ScrollCamera() {
  const { camera, size } = useThree();
  const scroll = useRef(0);
  const target = useRef(0);

  useFrame((_, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const baseZ = aspect < 0.8 ? 9.2 : 7.6;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    target.current = max > 0 ? window.scrollY / max : 0;
    scroll.current += (target.current - scroll.current) * Math.min(1, delta * 3);
    const t = scroll.current;
    camera.position.y = -0.1 + t * 0.5;
    camera.position.z = baseZ - t * 0.8;
    camera.lookAt(0, -0.15, 0);
  });
  return null;
}

export function SpecimenArtifact({ onReady }: { onReady?: () => void }) {
  return (
    <ArchiveCanvas className="!absolute inset-0" camera={[0, -0.1, 7.6]} fov={30}>
      <ScrollCamera />
      <ambientLight intensity={0.2} color="#3a3733" />
      <directionalLight
        position={[4.5, 5, 3.5]}
        intensity={1.6}
        color="#e8e0cf"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 1, -4]} intensity={0.3} color="#5a6672" />
      <spotLight position={[0, 0.5, -6]} angle={0.6} penumbra={1} intensity={2.2} color="#7F1518" />

      <SceneContent onReady={onReady} />
      <Plinth />

      <ArtifactFloor y={-2.5} />
    </ArchiveCanvas>
  );
}

// prefetch nothing eagerly; useGLTF caches per-URL
useGLTF.preload(SPECIMEN_GLB);
