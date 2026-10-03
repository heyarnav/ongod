"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * Shared parts of the procedural column artifact — geometry, marble
 * texture, and the crimson annotation set. Used as the fallback surface
 * when no GLB specimen is present (see SpecimenArtifact.tsx).
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

const H = 3.4;
const R = 0.62;
const FLUTES = 24;

export function buildColumn(seed = 5): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const geo = new THREE.CylinderGeometry(R, R, H, 224, 80, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v3 = new THREE.Vector3();

  const chips: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    chips.push([rand() * Math.PI * 2, (rand() - 0.5) * H * 0.85, 0.03 + rand() * 0.05]);
  }

  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const yN = v3.y / (H / 2);
    const theta = Math.atan2(v3.z, v3.x);
    const isCap = Math.abs(Math.abs(v3.y) - H / 2) < 1e-4 && Math.hypot(v3.x, v3.z) < 1e-4;

    if (!isCap) {
      let r = Math.hypot(v3.x, v3.z);
      r *= 1 + 0.055 * Math.exp(-((yN + 0.35) ** 2) / 0.34);
      r *= 1 - 0.07 * smoothstep(0.45, 1.0, yN);
      r *= 1 + 0.05 * smoothstep(-0.8, -1.0, yN);

      const flute = 0.5 + 0.5 * Math.cos(FLUTES * theta);
      r *= 1 - 0.03 * flute;

      for (const [ca, cy, cs] of chips) {
        const dA = Math.atan2(Math.sin(theta - ca), Math.cos(theta - ca));
        r *= 1 - cs * Math.exp(-((dA * R) ** 2) / 0.006 - ((v3.y - cy) ** 2) / 0.09);
      }

      if (yN > 0.55) {
        const jag =
          0.5 * Math.sin(3 * theta + 1.2) + 0.3 * Math.sin(7 * theta + 0.4) + 0.2 * Math.sin(12 * theta);
        const rim = 0.62 + 0.34 * (0.5 + 0.5 * jag);
        if (yN > rim) {
          v3.y = rim * (H / 2);
        }
      }

      const s = r / (Math.hypot(v3.x, v3.z) || 1);
      v3.x *= s;
      v3.z *= s;
    }

    const grain = 1 + (rand() - 0.5) * 0.004;
    v3.x *= grain;
    v3.z *= grain;

    pos.setXYZ(i, v3.x, v3.y, v3.z);
  }

  geo.computeVertexNormals();
  return geo;
}

export function makeMarbleTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const rand = mulberry32(21);

  const grad = g.createLinearGradient(0, 0, S, S * 0.35);
  grad.addColorStop(0, "#cdc5b4");
  grad.addColorStop(0.5, "#bcb2a0");
  grad.addColorStop(1, "#aca08a");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 260; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 14 + rand() * 90;
    g.fillStyle =
      rand() > 0.55
        ? `rgba(218, 210, 194, ${0.05 + rand() * 0.07})`
        : `rgba(122, 112, 94, ${0.04 + rand() * 0.06})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  for (let i = 0; i < 30; i++) {
    const x = rand() * S;
    g.strokeStyle = `rgba(96, 88, 74, ${0.05 + rand() * 0.08})`;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 20, S * 0.3, x - 20, S * 0.6, x + rand() * 30 - 15, S);
    g.stroke();
  }

  g.lineCap = "round";
  for (let i = 0; i < 18; i++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    g.strokeStyle = `rgba(32, 28, 24, ${0.14 + rand() * 0.2})`;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    const segs = 6 + Math.floor(rand() * 10);
    for (let s = 0; s < segs; s++) {
      a += (rand() - 0.5) * 1.5;
      x += Math.cos(a) * (12 + rand() * 42);
      y += Math.sin(a) * (12 + rand() * 42);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function Centerline() {
  return (
    <group>
      <mesh position={[0, 0, 1.05]}>
        <cylinderGeometry args={[0.0035, 0.0035, 3.9, 6]} />
        <meshBasicMaterial color="#9c2024" toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.85, 1.02]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.03, 0.03]} />
        <meshBasicMaterial color="#9c2024" toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.75, 1.02]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.026, 0.026]} />
        <meshBasicMaterial color="#9c2024" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function OrbitRing() {
  return (
    <mesh rotation={[1.42, 0.1, 0.06]}>
      <torusGeometry args={[1.42, 0.004, 8, 128]} />
      <meshBasicMaterial color="#7F1518" toneMapped={false} transparent opacity={0.7} />
    </mesh>
  );
}

export function HeightTicks() {
  const ticks = useMemo(() => [0.9, 0.3, -0.3, -0.9], []);
  return (
    <group>
      {ticks.map((y, i) => (
        <group key={i} position={[0, y, 0.64]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <planeGeometry args={[0.085, 0.004]} />
            <meshBasicMaterial color="#9c2024" toneMapped={false} transparent opacity={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Plinth() {
  const dark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b1916", roughness: 0.85, metalness: 0.05 }),
    [],
  );
  const top = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#24211d", roughness: 0.7, metalness: 0.06 }),
    [],
  );
  return (
    <group position={[0, -2.18, 0]}>
      <mesh material={top} position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.12, 1.9]} />
      </mesh>
      <mesh material={dark} position={[0, -0.26, 0]} receiveShadow>
        <boxGeometry args={[1.45, 0.34, 1.45]} />
      </mesh>
    </group>
  );
}
