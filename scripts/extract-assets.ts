/**
 * Extract brand artwork fragments from the supplied reference boards.
 *
 * The pasted references contain the canonical "on god." visual language:
 * cracked marble figure, anatomical engraving, moon, veiled figure, washed
 * garment plates, spine engraving and the woven label macro. This script
 * crops the fragments the site uses, applies a unified archival grade
 * (near-black floor, desaturated, soft contrast) and writes them to
 * public/images.
 *
 * Run: npm run assets:extract
 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SRC = "/tmp/freebuff-desktop-pastes";
const OUT = path.join(process.cwd(), "public", "images");
mkdirSync(OUT, { recursive: true });

/** Record of every fragment: source board, crop (left top width height). */
type Cut = {
  file: string;
  crop: [number, number, number, number];
  out: string;
  /** Optional extra resize before output (width only). */
  width?: number;
};

// Crop coordinates are relative to each reference board at its native size.
const CUTS: Cut[] = [
  // ── Board: variation C (1789920278616 — full homepage, 1536×1024) ──
  { file: "1789920278616", crop: [430, 50, 640, 540], out: "hero-bust.jpg", width: 1280 },
  { file: "1789920278616", crop: [470, 90, 340, 340], out: "collection-human.jpg", width: 900 },
  { file: "1789920278616", crop: [540, 650, 250, 255], out: "product-front.jpg", width: 720 },
  { file: "1789920278616", crop: [418, 655, 150, 245], out: "garment-plain.jpg", width: 460 },
  { file: "1789920278616", crop: [770, 655, 145, 245], out: "garment-back.jpg", width: 520 },
  { file: "1789920278616", crop: [1130, 670, 265, 175], out: "label-macro-wide.jpg", width: 700 },
  { file: "1789920278616", crop: [1438, 95, 95, 125], out: "fragment-veil.jpg", width: 300 },
  { file: "1789920278616", crop: [1438, 245, 95, 110], out: "fragment-moon.jpg", width: 300 },
  { file: "1789920278616", crop: [1438, 375, 95, 95], out: "fragment-heart.jpg", width: 300 },

  // ── Board: variation A (1789920203799 — homepage, 1536×1024) ──
  { file: "1789920203799", crop: [566, 120, 640, 500], out: "hero-bust-alt.jpg", width: 1280 },
  { file: "1789920203799", crop: [520, 630, 230, 270], out: "product-front-alt.jpg", width: 640 },
  { file: "1789920203799", crop: [790, 640, 250, 270], out: "product-back-alt.jpg", width: 640 },
  { file: "1789920203799", crop: [1120, 645, 265, 140], out: "label-macro.jpg", width: 700 },

  // ── Board: page sheet (1789920212583 — 1536×1024, two rows of screens) ──
  // Top row (y 0-440): HOME 0-768 · THE ARCHIVE 768-1152 · PRODUCT 1152-1536
  // Bottom row (y 445-1024): HUMAN 0-384 · SHOP 384-768 · CART 768-1152 · ADMIN 1152-1536
  { file: "1789920212583", crop: [72, 500, 140, 310], out: "human-flayed.jpg", width: 560 },
  { file: "1789920212583", crop: [10, 675, 62, 125], out: "human-spine.jpg", width: 320 },
  { file: "1789920212583", crop: [800, 135, 105, 195], out: "collection-human-arch.jpg", width: 420 },
  { file: "1789920212583", crop: [928, 135, 105, 195], out: "collection-celestial.jpg", width: 420 },
  { file: "1789920212583", crop: [1056, 135, 92, 195], out: "collection-divine.jpg", width: 380 },
  { file: "1789920212583", crop: [1212, 60, 186, 368], out: "product-front-big.jpg", width: 640 },
  { file: "1789920212583", crop: [1478, 85, 50, 200], out: "product-skeleton.jpg", width: 150 },
  { file: "1789920212583", crop: [772, 845, 66, 100], out: "fragment-bust-mini.jpg", width: 200 },
];

async function run() {
  for (const cut of CUTS) {
    const src = path.join(SRC, `paste-${cut.file}-10551.png`);
    const [left, top, width, height] = cut.crop;
    const pipeline = sharp(src)
      .extract({ left, top, width, height })
      .resize({ width: cut.width, withoutEnlargement: true });
    try {
      await pipeline
        .modulate({ brightness: 0.96, saturation: 0.68 })
        .linear(1.06, -10)
        .jpeg({ quality: 86, mozjpeg: true })
        .toFile(path.join(OUT, cut.out));
      console.log("✓", cut.out);
    } catch (err) {
      console.error("✗", cut.out, (err as Error).message);
    }
  }
  console.log("\nFragments written to public/images");
}

run();
