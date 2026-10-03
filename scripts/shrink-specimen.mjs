/**
 * Rewrite public/models/specimen.glb with a smaller embedded texture.
 *
 * The scan ships a 4096x4096 JPEG (3.3 MB of the 6.1 MB file, ~89 MB of
 * VRAM once mipmapped). This repacks it at 2048x2048 — visually identical
 * at hero scale, a fraction of the download and GPU memory.
 *
 * Usage: node scripts/shrink-specimen.mjs [maxEdge] [quality]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const GLB = path.resolve("public/models/specimen.glb");
const MAX_EDGE = Number(process.argv[2] ?? 2048);
const QUALITY = Number(process.argv[3] ?? 85);

const align4 = (n) => (n + 3) & ~3;

const buf = fs.readFileSync(GLB);
const jsonLen = buf.readUInt32LE(12);
if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));

const binHeader = 20 + jsonLen;
const binLen = buf.readUInt32LE(binHeader);
const binStart = binHeader + 8;
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
console.log(`glb ${mb(buf.length)} | json ${jsonLen}B | bin ${mb(binLen)}`);

// ── 1. decode + downscale every embedded image ───────────────────────────
const images = json.images ?? [];
if (!images.length) throw new Error("no embedded images — nothing to shrink");

const packed = [];
for (const [i, img] of images.entries()) {
  const bv = json.bufferViews[img.bufferView];
  const slice = buf.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength);
  const out = await sharp(slice)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(out).metadata();
  console.log(`  image ${i}: ${mb(bv.byteLength)} -> ${mb(out.length)}  (${meta.width}x${meta.height})`);
  packed.push({ img, out });
}

// ── 2. rebuild the BIN chunk: keep every surviving view, drop the old
//       texture bytes, then append the downscaled ones ─────────────────────
const dropped = new Set(packed.map(({ img }) => img.bufferView));
let binChunk = Buffer.alloc(binLen);
let cursor = 0;
for (const [i, bv] of json.bufferViews.entries()) {
  if (dropped.has(i)) continue;
  const start = binStart + (bv.byteOffset ?? 0);
  buf.copy(binChunk, cursor, start, start + bv.byteLength);
  bv.byteOffset = cursor;
  cursor = align4(cursor + bv.byteLength);
}

for (const { img, out } of packed) {
  const viewIndex = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: out.length });
  img.bufferView = viewIndex;
  img.mimeType = "image/jpeg";
  // a KHR_texture_basisu extension would now be a lie — drop it
  if (img.extensions) {
    for (const k of Object.keys(img.extensions)) delete img.extensions[k];
    if (!Object.keys(img.extensions).length) delete img.extensions;
  }
  out.copy(binChunk, cursor);
  cursor = align4(cursor + out.length);
}

// ── 3. reassemble: header + JSON chunk (space-padded) + BIN (zero-padded) ─
binChunk = binChunk.subarray(0, cursor);

const jsonPadded = Buffer.alloc(align4(Buffer.byteLength(JSON.stringify(json))), 0x20);
Buffer.from(JSON.stringify(json), "utf8").copy(jsonPadded);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binChunk.length, 8);

const jsonHdr = Buffer.alloc(8);
jsonHdr.writeUInt32LE(jsonPadded.length, 0);
jsonHdr.writeUInt32LE(0x4e4f534a, 4);

const binHdr = Buffer.alloc(8);
binHdr.writeUInt32LE(binChunk.length, 0);
binHdr.writeUInt32LE(0x004e4942, 4); // "BIN\0"

const out = Buffer.concat([header, jsonHdr, jsonPadded, binHdr, binChunk]);
fs.writeFileSync(GLB, out);
console.log(`wrote ${mb(out.length)} (was ${mb(buf.length)}) — saved ${((1 - out.length / buf.length) * 100).toFixed(0)}%`);
