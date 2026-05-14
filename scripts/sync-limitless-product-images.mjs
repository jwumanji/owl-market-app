// Sync confirmed promo/product catalog images from Limitless product pages.
//
// Default mode is a dry run and writes catalog-limitless-product-image-audit.md.
// Use --apply to update cards.image_url and cards.image_url_small for rows with
// exactly one deterministic Limitless product-page image candidate.

import fs from "node:fs";

const LIMITLESS_BASE = "https://onepiece.limitlesstcg.com";
const LIMITLESS_PROMO_INDEX = `${LIMITLESS_BASE}/cards/promos`;
const REPORT_PATH = "catalog-limitless-product-image-audit.md";
const APPLY = process.argv.includes("--apply");

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function sbFetchAll(path, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: restHeaders({ Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!res.ok) {
      throw new Error(`Supabase ${path} failed: ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function patchCardImage(cardId, imageUrl) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
    method: "PATCH",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({ image_url: imageUrl, image_url_small: imageUrl }),
  });
  if (!res.ok) {
    throw new Error(`Supabase patch ${cardId} failed: ${res.status} ${await res.text()}`);
  }
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;|&#8211;/g, "-")
    .replace(/&mdash;|&#8212;/g, "-")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/one piece/g, "")
    .replace(/version/g, "")
    .replace(/vol\.?\s*/g, "vol")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\?.*$/, "").replace(/^http:\/\//, "https://");
}

function currentSource(url) {
  if (!url) return "missing";
  if (url.includes("optcgapi.com")) return "optcgapi base";
  if (url.includes("tcgplayer.com")) return "tcgplayer product";
  if (url.includes("limitlesstcg")) return "limitless";
  return "other";
}

function setCode(card) {
  const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
  return set?.code ?? "";
}

function groupsFromName(name) {
  const groups = [];
  const re = /[([]([^\])]+)[\])]/g;
  let match;
  while ((match = re.exec(name ?? ""))) {
    groups.push(decodeHtml(match[1]));
  }

  const fullName = decodeHtml(name);
  const markers = [
    "English Version 1st Anniversary Set",
    "English Version 2nd Anniversary Set",
    "English Version 3rd Anniversary Set",
    "Japanese 1st Anniversary Set",
    "Japanese 2nd Anniversary Set",
    "Japanese 3rd Anniversary Set",
    "One Piece Japanese Version 2nd Anniversary Set",
  ];
  for (const marker of markers) {
    if (fullName.toLowerCase().includes(marker.toLowerCase())) {
      groups.push(marker);
    }
  }

  return Array.from(new Set(groups.map(normalizeTitle).filter(Boolean)));
}

function parseProductLinks(html) {
  const links = new Map();
  const linkRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = linkRe.exec(html))) {
    const href = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    if (!href.startsWith("/cards/")) continue;
    if (href === "/cards" || href === "/cards/promos" || href === "/cards/advanced") continue;
    if (!title || title.length < 3) continue;
    if (/^\$|€|^\d|^[A-Z][a-z]{2}\s+\d{2}$|cards?$/i.test(title)) continue;
    if (!links.has(href)) {
      links.set(href, {
        title,
        href,
        url: new URL(href, LIMITLESS_BASE).href,
        normalizedTitle: normalizeTitle(title),
      });
    }
  }
  return Array.from(links.values());
}

function parseImageMap(html) {
  const images = new Map();
  const regex =
    /https:\/\/limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com\/one-piece\/[^"'<>\s]+?\/([A-Z0-9]+-\d+)[^"'<>\s]*?\.webp/g;
  let match;
  while ((match = regex.exec(html))) {
    const cardNumber = match[1];
    const url = match[0];
    if (!images.has(cardNumber)) images.set(cardNumber, new Set());
    images.get(cardNumber).add(url);
  }
  return new Map(Array.from(images, ([cardNumber, urls]) => [cardNumber, Array.from(urls)]));
}

async function loadLimitlessProducts() {
  const indexRes = await fetch(LIMITLESS_PROMO_INDEX);
  if (!indexRes.ok) {
    throw new Error(`Limitless promo index failed: ${indexRes.status} ${await indexRes.text()}`);
  }

  const products = parseProductLinks(await indexRes.text());
  for (const product of products) {
    const res = await fetch(product.url);
    if (!res.ok) {
      product.error = `HTTP ${res.status}`;
      product.images = new Map();
      continue;
    }
    product.images = parseImageMap(await res.text());
  }
  return products;
}

function findProductCandidates(products, groupKeys) {
  const candidates = [];
  for (const groupKey of groupKeys) {
    for (const product of products) {
      const productKey = product.normalizedTitle;
      if (
        groupKey === productKey ||
        (groupKey.length > 8 && productKey.includes(groupKey)) ||
        (productKey.length > 8 && groupKey.includes(productKey))
      ) {
        candidates.push(product);
      }
    }
  }
  return Array.from(new Map(candidates.map((product) => [product.href, product])).values());
}

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_None._\n";
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map(mdEscape).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function main() {
  console.log("Loading Limitless product image maps...");
  const products = await loadLimitlessProducts();
  const productsWithImages = products.filter((product) => product.images.size > 0);

  console.log("Loading Supabase cards...");
  const select = encodeURIComponent(
    "id,name,card_number,rarity,image_url,image_url_small,variant_label,promo_segment,sets(code,name)"
  );
  const cards = await sbFetchAll(`cards?select=${select}&order=card_number.asc`);

  const updates = [];
  const noOps = [];
  const conflicts = [];
  const ambiguousProductImages = [];
  const missingCardOnProduct = [];
  let productMatchedRows = 0;

  for (const card of cards) {
    if (!card.card_number) continue;
    const groupKeys = groupsFromName(card.name);
    if (groupKeys.length === 0) continue;

    const productCandidates = findProductCandidates(productsWithImages, groupKeys);
    if (productCandidates.length === 0) continue;

    const imageCandidates = [];
    for (const product of productCandidates) {
      const urls = product.images.get(card.card_number);
      if (!urls) {
        missingCardOnProduct.push({ card, product });
        continue;
      }
      if (urls.length !== 1) {
        ambiguousProductImages.push({ card, product, urls });
        continue;
      }
      imageCandidates.push({ card, product, expectedImage: urls[0] });
    }

    if (imageCandidates.length === 0) continue;
    productMatchedRows++;

    const uniqueImages = Array.from(new Set(imageCandidates.map((candidate) => candidate.expectedImage)));
    if (uniqueImages.length !== 1) {
      conflicts.push({ card, candidates: imageCandidates });
      continue;
    }

    const expectedImage = uniqueImages[0];
    const productTitles = Array.from(new Set(imageCandidates.map((candidate) => candidate.product.title)));
    const productUrls = Array.from(new Set(imageCandidates.map((candidate) => candidate.product.url)));

    if (
      normalizeUrl(card.image_url) === normalizeUrl(expectedImage) &&
      normalizeUrl(card.image_url_small) === normalizeUrl(expectedImage)
    ) {
      noOps.push({ card, expectedImage, productTitles, productUrls });
      continue;
    }

    updates.push({ card, expectedImage, productTitles, productUrls });
  }

  const report = [];
  report.push("# Limitless Product Image Sync Report");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(markdownTable(
    ["Metric", "Count"],
    [
      ["Product index", LIMITLESS_PROMO_INDEX],
      ["Product pages discovered", products.length],
      ["Product pages with image maps", productsWithImages.length],
      ["Cards scanned", cards.length],
      ["Catalog rows matched to product image maps", productMatchedRows],
      ["Safe image updates", updates.length],
      ["Already correct", noOps.length],
      ["Skipped conflicting product candidates", conflicts.length],
      ["Skipped ambiguous product card images", ambiguousProductImages.length],
      ["Product matches missing card number", missingCardOnProduct.length],
    ]
  ));
  report.push("");
  report.push("## Updates By Current Source");
  report.push("");
  report.push(markdownTable(
    ["Current Source", "Rows"],
    countBy(updates, (row) => currentSource(row.card.image_url)).map(([source, count]) => [source, count])
  ));
  report.push("");
  report.push("## Updates By Product");
  report.push("");
  report.push(markdownTable(
    ["Product", "Rows"],
    countBy(updates, (row) => row.productTitles.join(" / ")).map(([product, count]) => [product, count])
  ));
  report.push("");
  report.push("## Safe Updates");
  report.push("");
  report.push(markdownTable(
    ["Set", "Card #", "Name", "Product", "Current Source", "Current Image", "Expected Image", "Product URL"],
    updates.map((row) => [
      setCode(row.card),
      row.card.card_number,
      row.card.name,
      row.productTitles.join(" / "),
      currentSource(row.card.image_url),
      row.card.image_url,
      row.expectedImage,
      row.productUrls.join(" / "),
    ])
  ));
  report.push("");
  report.push("## Skipped Conflicts");
  report.push("");
  report.push(markdownTable(
    ["Set", "Card #", "Name", "Candidates"],
    conflicts.map((row) => [
      setCode(row.card),
      row.card.card_number,
      row.card.name,
      row.candidates.map((candidate) => `${candidate.product.title}: ${candidate.expectedImage}`).join("; "),
    ])
  ));
  report.push("");
  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Safe image updates: ${updates.length}`);
  console.log(`Already correct: ${noOps.length}`);
  console.log(`Skipped conflicts: ${conflicts.length}`);
  console.log(`Skipped ambiguous product images: ${ambiguousProductImages.length}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update catalog images.");
    return;
  }

  for (let index = 0; index < updates.length; index += 1) {
    const update = updates[index];
    await patchCardImage(update.card.id, update.expectedImage);
    if ((index + 1) % 25 === 0 || index + 1 === updates.length) {
      console.log(`Patched ${index + 1}/${updates.length}`);
    }
  }
  console.log("Apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
