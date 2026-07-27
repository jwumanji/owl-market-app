import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = await readFile(new URL("../src/app/sets/promo-collections.ts", import.meta.url), "utf8");
const entries = [...source.matchAll(/\{\s*slug:\s*"([^"]+)"[\s\S]*?officialUrl:\s*"([^"]+)"[\s\S]*?\}/g)]
  .map((match) => ({ slug: match[1], officialUrl: match[2] }));

function clean(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

function pageImages(html, pageUrl) {
  const candidates = [];
  for (const match of html.matchAll(/<img\b([^>]+)>/gi)) {
    const attrs = match[1];
    const sourceMatch = attrs.match(/data-src\s*=\s*["']([^"']+)["']/i)
      ?? attrs.match(/(?:^|\s)src\s*=\s*["']([^"']+)["']/i);
    if (!sourceMatch) continue;
    const alt = clean(attrs.match(/alt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
    const raw = clean(sourceMatch[1]);
    let url;
    try {
      url = new URL(raw, pageUrl).href;
    } catch {
      continue;
    }

    const lower = `${url} ${alt}`.toLowerCase();
    let score = 0;
    if (/product image|products? name|product photo/.test(lower)) score += 80;
    if (/img_product|product_img|img_main|main_img|mainvisual|main_visual|item_img|img_item/.test(lower)) score += 70;
    if (/\/pkj(?:_|\.)/.test(lower)) score += 130;
    if (/\/mv_01\./.test(lower)) score += 60;
    if (/onepiececg\/bccard\/.+\.(?:png|webp|jpe?g)/.test(lower)) score += 110;
    if (/\/images\/products?\//.test(lower)) score += 30;
    if (/img_0?1\.(png|webp|jpe?g)/.test(lower)) score += 25;
    if (/product|goods|collection|anniversary|championship|illustration box|treasure chest|admirable/.test(alt.toLowerCase())) score += 25;
    if (/card_?\d+|\/card\/|thumbnail|logo|bnr|banner|button|icon|ico-|footer|header|common|loading|dummy|qr|\/products\/modal\//.test(lower)) score -= 100;
    candidates.push({ url, alt, score });
  }

  const seen = new Set();
  return candidates
    .filter((candidate) => !seen.has(candidate.url) && seen.add(candidate.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

const results = [];
for (const entry of entries) {
  try {
    const response = await fetch(entry.officialUrl, { redirect: "follow" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      results.push({ ...entry, status: response.status, candidates: [] });
      continue;
    }
    const html = await response.text();
    results.push({ ...entry, status: response.status, candidates: pageImages(html, response.url) });
  } catch (error) {
    results.push({ ...entry, status: 0, error: error instanceof Error ? error.message : String(error), candidates: [] });
  }
}

const OFFICIAL_IMAGE_OVERRIDES = {
  "anniversary-china-1st": "https://source.windoent.com/OnePiecePc/Picture/1698029521852%E7%B4%A0%E6%9D%90%E7%BB%84%E5%90%88_%E7%94%BB%E6%9D%BF%201.jpg",
  "anniversary-china-4th": "https://source.windoent.com/OnePiecePc/Picture/1778046091844111.png",
  "pcc-best-selection-7": "https://en.onepiece-cardgame.com/onepiececg/bccard/en/product/2026/06/24/4zWVCq0RAYuk7r07/OPCG_PC_best07_01.webp",
};

if (process.argv.includes("--sync")) {
  const outputDir = fileURLToPath(new URL("../public/sets/", import.meta.url));
  const requestedSlug = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);
  await mkdir(outputDir, { recursive: true });

  for (const result of results) {
    if (requestedSlug && result.slug !== requestedSlug) continue;
    const imageUrl = OFFICIAL_IMAGE_OVERRIDES[result.slug] ?? result.candidates[0]?.url;
    if (!imageUrl || (result.candidates[0] && result.candidates[0].score <= 0 && !OFFICIAL_IMAGE_OVERRIDES[result.slug])) {
      throw new Error(`No reliable official product image for ${result.slug}`);
    }
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`${result.slug}: image request failed with ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const outputPath = path.join(outputDir, `promo-${result.slug}.webp`);
    await sharp(bytes)
      .rotate()
      .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toFile(outputPath);
    process.stdout.write(`SYNCED\t${result.slug}\t${imageUrl}\n`);
  }
} else {
  for (const result of results) {
    const choices = result.candidates.slice(0, 3).map((candidate) => `${candidate.score}:${candidate.url}`).join(" | ");
    process.stdout.write(`${result.slug}\t${result.status}\t${choices || result.error || "NO_CANDIDATE"}\n`);
  }
}

if (process.argv.includes("--contact-sheet")) {
  const outputDir = fileURLToPath(new URL("../public/sets/", import.meta.url));
  const columns = 5;
  const tileWidth = 240;
  const tileHeight = 190;
  const imageHeight = 158;
  const rows = Math.ceil(entries.length / columns);
  const composites = [];

  for (const [index, entry] of entries.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    const image = await sharp(path.join(outputDir, `promo-${entry.slug}.webp`))
      .resize({ width: tileWidth - 12, height: imageHeight - 8, fit: "contain", background: "#f7f1e7" })
      .flatten({ background: "#f7f1e7" })
      .toBuffer();
    const safeLabel = entry.slug.replace(/[&<>]/g, "");
    const label = Buffer.from(`<svg width="${tileWidth}" height="32"><rect width="100%" height="100%" fill="#fffaf2"/><text x="8" y="20" font-family="Arial" font-size="11" fill="#1a0f08">${safeLabel}</text></svg>`);
    composites.push({ input: image, left: left + 6, top: top + 4 });
    composites.push({ input: label, left, top: top + imageHeight });
  }

  const contactSheet = path.join(process.env.TEMP ?? "C:\\tmp", "promo-product-contact-sheet.webp");
  await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: "#eadfce" } })
    .composite(composites)
    .webp({ quality: 88 })
    .toFile(contactSheet);
  process.stdout.write(`CONTACT_SHEET\t${contactSheet}\n`);
}
