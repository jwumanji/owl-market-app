// Audit and backfill sealed_products.image_url from the public TCGCSV catalog.
//
// TCGCSV mirrors TCGplayer's category/group/product catalog once per day. This
// script validates every stored TCGplayer product ID against that catalog, then
// stores the corresponding high-resolution TCGplayer image URL. It is a dry run
// unless --apply is passed.
//
// Usage:
//   node scripts/sync-sealed-product-images.mjs --report=C:\tmp\sealed-images.md
//   node scripts/sync-sealed-product-images.mjs --apply --report=C:\tmp\sealed-images-applied.md

import fs from "node:fs";
import { loadGameScope, readArg, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const TCGCSV_CATEGORY_ID = 68;
const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY_ID}`;
const USER_AGENT = "OWLMarket/1.0 (+https://owl-market-app.vercel.app)";
const APPLY = process.argv.includes("--apply");
const REPORT_PATH = readArg("--report") ?? "sealed-product-image-audit.md";

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GAME_SLUG = scriptGameSlug();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function restHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function supabaseRows(path) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: restHeaders({ Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!response.ok) {
      throw new Error(`Supabase ${path} failed: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function patchImage(row, imageUrl) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/sealed_products?id=eq.${encodeURIComponent(row.id)}&game_id=eq.${encodeURIComponent(row.game_id)}`,
    {
      method: "PATCH",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify({ image_url: imageUrl, updated_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase sealed image patch ${row.id} failed: ${response.status} ${await response.text()}`);
  }
}

async function tcgCsv(path) {
  const response = await fetch(`${TCGCSV_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`TCGCSV ${path} failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.results) ? payload.results : [];
}

function highResolutionImage(productId) {
  const normalized = String(productId ?? "").trim();
  return /^\d+$/.test(normalized)
    ? `https://product-images.tcgplayer.com/fit-in/1000x1000/${normalized}.jpg`
    : null;
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/^http:\/\//, "https://");
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_None._";
  const escaped = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escaped).join(" | ")} |`),
  ].join("\n");
}

async function loadCatalogProducts(wantedProductIds) {
  const groups = await tcgCsv("/groups");
  const productsById = new Map();

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const products = await tcgCsv(`/${group.groupId}/products`);
    for (const product of products) {
      const key = String(product.productId ?? "");
      if (wantedProductIds.has(key)) productsById.set(key, product);
    }

    if (productsById.size === wantedProductIds.size) break;
    if (index + 1 < groups.length) await new Promise((resolve) => setTimeout(resolve, 110));
  }

  return { groups, productsById };
}

async function main() {
  const game = await loadGameScope({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    gameSlug: GAME_SLUG,
  });
  const path = withGameFilter(
    "sealed_products?select=id,game_id,set_id,name,product_type,image_url,tcg_product_id,sets!sealed_products_set_game_fk(code,name)&order=name.asc",
    game.id,
  );
  const sealedProducts = await supabaseRows(path);
  const wantedProductIds = new Set(
    sealedProducts.map((row) => String(row.tcg_product_id ?? "")).filter((value) => /^\d+$/.test(value)),
  );

  console.log(`Loading TCGCSV catalog for ${wantedProductIds.size} sealed product IDs...`);
  const { groups, productsById } = await loadCatalogProducts(wantedProductIds);

  const updates = [];
  const alreadyCorrect = [];
  const missingCatalogProducts = [];
  const missingProductIds = [];

  for (const row of sealedProducts) {
    const productId = String(row.tcg_product_id ?? "").trim();
    if (!/^\d+$/.test(productId)) {
      missingProductIds.push(row);
      continue;
    }

    const catalogProduct = productsById.get(productId);
    if (!catalogProduct || !catalogProduct.imageUrl || catalogProduct.imageCount === 0) {
      missingCatalogProducts.push(row);
      continue;
    }

    const expectedImage = highResolutionImage(productId);
    if (normalizeUrl(row.image_url) === expectedImage) {
      alreadyCorrect.push({ row, catalogProduct, expectedImage });
    } else {
      updates.push({ row, catalogProduct, expectedImage });
    }
  }

  if (APPLY) {
    for (let index = 0; index < updates.length; index += 1) {
      const update = updates[index];
      await patchImage(update.row, update.expectedImage);
      if ((index + 1) % 25 === 0 || index + 1 === updates.length) {
        console.log(`Updated ${index + 1}/${updates.length} sealed images`);
      }
    }
  }

  const report = [
    "# Sealed Product Image Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Game: ${game.name} (${game.slug})`,
    `Mode: ${APPLY ? "apply" : "dry-run"}`,
    "",
    "## Summary",
    "",
    markdownTable(["Metric", "Count"], [
      ["Sealed rows scanned", sealedProducts.length],
      ["TCGCSV groups scanned", groups.length],
      ["Stored TCGplayer IDs", wantedProductIds.size],
      ["Catalog IDs matched", productsById.size],
      ["Image updates", updates.length],
      ["Already correct", alreadyCorrect.length],
      ["Missing catalog image", missingCatalogProducts.length],
      ["Missing/invalid product ID", missingProductIds.length],
    ]),
    "",
    "## Missing Catalog Images",
    "",
    markdownTable(
      ["Set", "Type", "Product", "TCGplayer ID"],
      missingCatalogProducts.map((row) => [row.sets?.code, row.product_type, row.name, row.tcg_product_id]),
    ),
    "",
    "## Missing Product IDs",
    "",
    markdownTable(
      ["Set", "Type", "Product"],
      missingProductIds.map((row) => [row.sets?.code, row.product_type, row.name]),
    ),
    "",
  ];

  fs.writeFileSync(REPORT_PATH, report.join("\n"));
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Image updates: ${updates.length}`);
  console.log(`Already correct: ${alreadyCorrect.length}`);
  console.log(`Missing catalog images: ${missingCatalogProducts.length}`);
  if (!APPLY) console.log("Dry run only. Re-run with --apply to write image_url values.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
