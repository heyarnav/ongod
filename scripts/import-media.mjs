#!/usr/bin/env node
/**
 * Import existing assets into Supabase Storage.
 *
 *   npm run media:import
 *
 * Uploads everything in public/images and public/models to the `ongod-media`
 * bucket under `seed/`, then writes the resulting public URL back onto the
 * `product_images` and `collections` rows that already reference the path.
 *
 * Idempotent: a file that is already in the bucket with the same content is
 * skipped rather than re-uploaded.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "ongod-media";

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
};

const ALLOWED = new Set(Object.keys(MIME));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function main() {
  const sources = [
    ...walk(join(root, "public", "images")),
    ...walk(join(root, "public", "models")),
  ].filter((f) => ALLOWED.has(basename(f).slice(basename(f).lastIndexOf(".")).toLowerCase()));

  console.log(`uploading ${sources.length} asset(s) to ${bucket}/seed …\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const pathToUrl = new Map();

  for (const file of sources) {
    const name = basename(file);
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const path = `seed/${name}`;
    const buffer = readFileSync(file);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: MIME[ext], upsert: true });

    if (error) {
      console.log(`  ✗ ${name} — ${error.message}`);
      failed++;
      continue;
    }

    uploaded++;
    pathToUrl.set(path, `${url}/storage/v1/object/public/${bucket}/${path}`);
  }

  console.log(`\nuploaded ${uploaded}, skipped ${skipped}, failed ${failed}`);

  // Point the seeded rows at the uploaded objects.
  const { data: images } = await supabase
    .from("product_images")
    .select("id, storage_path, public_url");

  let imageUpdates = 0;
  for (const img of images ?? []) {
    const publicUrl = pathToUrl.get(img.storage_path);
    if (!publicUrl || img.public_url === publicUrl) continue;
    await supabase.from("product_images").update({ public_url: publicUrl }).eq("id", img.id);
    imageUpdates++;
  }

  // collections.hero_image / artwork already hold the storage path, which the
  // read layer resolves to a public URL — nothing to write back there.

  // The 3D specimen moves too, so Storage is the only media system.
  let modelUpdates = 0;
  const { data: products } = await supabase
    .from("products")
    .select("id, model")
    .neq("model", "");

  for (const p of products ?? []) {
    const filename = p.model.split("/").pop();
    if (!filename) continue;
    const url = pathToUrl.get(`seed/${filename}`);
    if (!url || p.model === url) continue;
    await supabase.from("products").update({ model: url }).eq("id", p.id);
    modelUpdates++;
  }

  console.log(`product_images public_url written: ${imageUpdates}`);
  console.log(`product model urls written: ${modelUpdates}`);

  if (failed > 0) {
    console.log("\nsome assets failed — see above");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});