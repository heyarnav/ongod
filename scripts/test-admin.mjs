import fs from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * Does the Control Room actually save?
 *
 * Written because it did not. Editing a product sent its whole size axis as
 * `sizes`, and the PATCH handler had a second branch for `sizes` that wrote
 * only the size NAMES into products.sizes and never touched product_variants.
 * Every stock number an operator typed was discarded server-side, and the save
 * reported success. Reopening the product showed yesterday's inventory, which
 * reads exactly like the database forgetting the change.
 *
 * So this does not check that the endpoints answer 200. It checks that every
 * write is READ BACK through the admin's own GET and matches what was sent —
 * because a 200 that changed nothing is the failure mode being hunted.
 *
 * It signs in as a real operator over HTTP with a cookie jar, so requireAdmin()
 * runs exactly as it does in the browser.
 */

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3000";
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? "arnavkumar.me@gmail.com";

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? `\n          ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
}
const eq = (label, actual, expected) =>
  check(label, actual === expected, `expected ${JSON.stringify(expected)} / got ${JSON.stringify(actual)}`);
const deepEqSorted = (label, actual, expected) => {
  const a = Array.isArray(actual) ? [...actual].sort() : actual;
  const e = Array.isArray(expected) ? [...expected].sort() : expected;
  check(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)} / got ${JSON.stringify(a)}`);
};

const service = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const created = { products: [], collections: [] };

try {
  console.log(`\nadmin persistence  (${BASE}, operator ${OPERATOR_EMAIL})\n`);

  // ── Sign in as an operator ────────────────────────────────────────────────
  const jar = {};
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar[name] = value;
      },
    },
  });
  const call = (method, path, body) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  console.log("0. the operator gate");
  const anonymous = await fetch(`${BASE}/api/admin/products`);
  check("an anonymous admin read is refused", anonymous.status === 401 || anonymous.status === 403, `status ${anonymous.status}`);

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: OPERATOR_EMAIL,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.log(`  SKIP  cannot mint an operator link: ${linkErr?.message ?? "no token"}`);
    throw new Error("NO_OPERATOR");
  }
  let minted = null;
  for (const type of ["email", "magiclink"]) {
    const attempt = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type });
    if (!attempt.error) {
      minted = attempt.data;
      break;
    }
  }
  if (!minted) throw new Error(`could not sign in as ${OPERATOR_EMAIL}`);

  const authed = await call("GET", "/api/admin/products");
  eq("the operator is admitted", authed.status, 200);

  // ── Create a product to edit ──────────────────────────────────────────────
  console.log("\n1. creating a product");
  const stamp = Date.now();
  const slug = `admin-probe-${stamp}`;

  const createRes = await call("POST", "/api/admin/products", {
    slug,
    name: "ADMIN PROBE",
    archiveNumber: "910",
    price: 100000,
    status: "DRAFT",
    dropStatus: "PRE_ORDER",
    description: "fixture",
    sizes: [
      { size: "M", stock: 3 },
      { size: "L", stock: 4 },
    ],
  });
  const createdBody = await createRes.json();
  eq("the create is accepted", createRes.status, 201);
  const productId = createdBody.product?.id;
  check("a product comes back", Boolean(productId), productId ?? JSON.stringify(createdBody).slice(0, 200));
  created.products.push(productId);

  if (!productId) throw new Error("NO_PRODUCT");

  // ── The bug: edit stock through the form's own payload ───────────────────
  console.log("\n2. editing stock and the size axis, then reading it back");
  const newAxis = [
    { size: "M", stock: 11 },
    { size: "L", stock: 12 },
    { size: "XL", stock: 13 },
  ];
  const editRes = await call("PATCH", `/api/admin/products/${productId}`, {
    sizes: newAxis,
    name: "ADMIN PROBE RENAMED",
    description: "edited by the admin persistence test",
  });
  const editBody = await editRes.json();
  eq("the edit is accepted", editRes.status, 200);

  const reread = await call("GET", `/api/admin/products/${productId}`);
  const rereadBody = await reread.json();
  eq("the product reads back", reread.status, 200);

  const variants = rereadBody.product?.variants ?? [];
  const bySize = new Map(variants.map((v) => [v.size, v]));

  eq("the edited axis has three sizes", variants.filter((v) => v.active !== false).length, 3);
  eq("M stock persisted", bySize.get("M")?.stock, 11);
  eq("L stock persisted", bySize.get("L")?.stock, 12);
  eq("XL stock persisted", bySize.get("XL")?.stock, 13);
  eq("the name persisted", rereadBody.product?.name, "ADMIN PROBE RENAMED");
  eq(
    "the description persisted",
    rereadBody.product?.description,
    "edited by the admin persistence test",
  );

  // Confirmed directly in the database too, not just through the admin's GET.
  const { data: dbVariants } = await service
    .from("product_variants")
    .select("size, stock, active")
    .eq("product_id", productId)
    .order("size");
  const dbBySize = new Map((dbVariants ?? []).map((v) => [v.size, v]));
  eq("M stock is in the DATABASE", dbBySize.get("M")?.stock, 11);
  eq("L stock is in the DATABASE", dbBySize.get("L")?.stock, 12);
  eq("XL stock is in the DATABASE", dbBySize.get("XL")?.stock, 13);
  deepEqSorted(
    "the products.sizes axis is in the DATABASE",
    rereadBody.product?.sizes,
    ["M", "L", "XL"],
  );

  // ── Unticking a size ──────────────────────────────────────────────────────
  console.log("\n3. unticking a size");
  const shrinkRes = await call("PATCH", `/api/admin/products/${productId}`, {
    sizes: [
      { size: "M", stock: 11 },
      { size: "L", stock: 12 },
    ],
  });
  eq("the shrink is accepted", shrinkRes.status, 200);
  const shrunk = await call("GET", `/api/admin/products/${productId}`);
  const shrunkBody = await shrunk.json();
  const xl = (shrunkBody.product?.variants ?? []).find((v) => v.size === "XL");
  check(
    "the unticked size is no longer offered",
    !xl || xl.active === false,
    xl ? `XL active=${xl.active}` : "XL row gone",
  );

  // ── Unticking everything ──────────────────────────────────────────────────
  console.log("\n4. unticking every size");
  const emptyRes = await call("PATCH", `/api/admin/products/${productId}`, { sizes: [] });
  eq("an empty axis is accepted", emptyRes.status, 200);
  const emptied = await call("GET", `/api/admin/products/${productId}`);
  const emptiedBody = await emptied.json();
  const stillActive = (emptiedBody.product?.variants ?? []).filter((v) => v.active !== false);
  eq("nothing is still offered", stillActive.length, 0);

  // Put it back so the next assertions have an axis.
  await call("PATCH", `/api/admin/products/${productId}`, { sizes: [{ size: "M", stock: 7 }] });

  // ── The single-variant override the inventory page uses ───────────────────
  console.log("\n5. the inventory page's single-size override");
  const { data: mVariant } = await service
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("size", "M")
    .maybeSingle();

  const invRes = await call("PATCH", `/api/admin/inventory/${mVariant.id}`, { stock: 21 });
  eq("the override is accepted", invRes.status, 200);
  eq("the override returns the new number", (await invRes.json())?.variant?.stock, 21);
  const { data: afterOverride } = await service
    .from("product_variants")
    .select("stock")
    .eq("id", mVariant.id)
    .maybeSingle();
  eq("the override is in the DATABASE", afterOverride?.stock, 21);

  const negative = await call("PATCH", `/api/admin/inventory/${mVariant.id}`, { stock: -5 });
  check("a negative count is refused", negative.status === 400, `status ${negative.status}`);

  // ── Settings ──────────────────────────────────────────────────────────────
  console.log("\n6. site settings");
  const settingsBefore = await call("GET", "/api/admin/settings");
  const settingsBody = await settingsBefore.json();
  eq("settings read", settingsBefore.status, 200);
  const original = settingsBody.settings?.[0];
  check("there is a setting to edit", Boolean(original?.key), original?.key ?? "(none)");

  if (original) {
    const marker = `admin-probe-${stamp}`;
    // The restore MUST be in a finally. An earlier version of this test put it
    // after the assertions, and an unrelated crash left a probe marker sitting
    // in the live about_body copy — the test's own cleanup was the thing that
    // damaged real data.
    try {
      const putRes = await call("PUT", "/api/admin/settings", {
        settings: [{ key: original.key, value: marker }],
      });
      eq("the setting is accepted", putRes.status, 200);

      const rereadSettings = await call("GET", "/api/admin/settings");
      const rereadJson = await rereadSettings.json();
      check(
        "settings read back after the write",
        Array.isArray(rereadJson.settings),
        JSON.stringify(rereadJson).slice(0, 200),
      );
      if (Array.isArray(rereadJson.settings)) {
        eq(
          "the new value reads back",
          rereadJson.settings.find((s) => s.key === original.key)?.value,
          marker,
        );
      }
    } finally {
      await call("PUT", "/api/admin/settings", {
        settings: [{ key: original.key, value: original.value }],
      });
      const restored = await call("GET", "/api/admin/settings");
      const restoredJson = await restored.json();
      if (Array.isArray(restoredJson.settings)) {
        eq(
          "the original value is restored",
          restoredJson.settings.find((s) => s.key === original.key)?.value,
          original.value,
        );
      }
    }
  }

  // ── Collections ───────────────────────────────────────────────────────────
  console.log("\n7. collections");
  const collRes = await call("POST", "/api/admin/collections", {
    slug: `admin-probe-coll-${stamp}`,
    name: "ADMIN PROBE COLLECTION",
    number: "910",
    description: "fixture",
  });
  const collBody = await collRes.json();
  const collId = collBody.collection?.id ?? collBody.id;
  check("a collection is created", Boolean(collId), collId ?? JSON.stringify(collBody).slice(0, 200));
  if (collId) {
    created.collections.push(collId);
    const collEdit = await call("PATCH", `/api/admin/collections/${collId}`, {
      name: "ADMIN PROBE COLLECTION RENAMED",
    });
    eq("the collection edit is accepted", collEdit.status, 200);
    const { data: collDb } = await service.from("collections").select("name").eq("id", collId).maybeSingle();
    eq("the collection name is in the DATABASE", collDb?.name, "ADMIN PROBE COLLECTION RENAMED");
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
} catch (err) {
  if (err.message !== "NO_OPERATOR") throw err;
} finally {
  for (const id of created.products) {
    await service.from("product_variants").delete().eq("product_id", id);
    await service.from("product_images").delete().eq("product_id", id);
    await service.from("products").delete().eq("id", id);
  }
  for (const id of created.collections) await service.from("collections").delete().eq("id", id);
  console.log(
    `cleanup\n  removed ${created.products.length} product(s), ${created.collections.length} collection(s)\n`,
  );
}

process.exit(failed === 0 ? 0 : 1);
