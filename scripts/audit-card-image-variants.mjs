// Read-only audit for hosted card image variant coverage.
//
// Usage:
//   node scripts/audit-card-image-variants.mjs --game=one_piece --report=C:\tmp\card-image-variants-audit.md

import fs from "node:fs";

const REPORT_PATH = readArg("--report") ?? "card-image-variants-audit.md";
const GAME_SLUG = readArg("--game") ?? process.env.OWL_GAME_SLUG ?? "one_piece";
const DETAIL_LIMIT = parsePositiveInt(readArg("--detail-limit"), 500);

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

function mdTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")).join(" | ")} |`);
  }
  return out.join("\n");
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return String(left[0]).localeCompare(String(right[0]));
  });
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function sourceUrl(card) {
  return card.image_source_url || card.image_url || card.image_url_small || null;
}

function sourceProvider(url) {
  if (!url) return "none";
  const normalized = String(url).toLowerCase();
  if (normalized.includes("optcgapi.com")) return "optcgapi";
  if (normalized.includes("tcgplayer.com")) return "tcgplayer";
  if (normalized.includes("limitlesstcg")) return "limitless";
  if (normalized.includes("/storage/v1/object/public/card-images/")) return "owl-storage";
  return "other";
}

function errorReason(card) {
  if (card.image_mirror_status === "external" && !sourceUrl(card)) return "external_no_source_url";
  if (card.image_mirror_status === "external") return "external_unprocessed";
  const error = String(card.image_mirror_error ?? "").toLowerCase();
  if (!error) return card.image_mirror_status;
  if (error.includes("404")) return "source_404";
  if (error.includes("not an image")) return "source_not_image";
  if (error.includes("upload failed")) return "storage_upload";
  if (error.includes("timeout")) return "source_timeout";
  if (error.includes("download failed")) return "source_download_failed";
  return "other_error";
}

function cardSet(card) {
  const set = firstRelation(card.sets);
  return [set?.code, set?.name].filter(Boolean).join(" ");
}

async function resolveGame() {
  const candidates = Array.from(new Set([
    GAME_SLUG,
    GAME_SLUG.replace(/-/g, "_"),
    GAME_SLUG.replace(/_/g, "-"),
  ]));

  for (const slug of candidates) {
    const rows = await sbFetchAll(`games?select=id,slug,name,metadata&slug=eq.${encodeURIComponent(slug)}`, 1);
    if (rows[0]?.id) return rows[0];
  }

  const rows = await sbFetchAll(
    `games?select=id,slug,name,metadata&metadata->>route_slug=eq.${encodeURIComponent(GAME_SLUG)}`,
    1
  );
  if (rows[0]?.id) return rows[0];
  throw new Error(`Game '${GAME_SLUG}' was not found.`);
}

async function main() {
  const game = await resolveGame();
  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;
  const select = [
    "id",
    "card_image_id",
    "card_number",
    "name",
    "image_url",
    "image_url_small",
    "image_url_preview",
    "image_source_url",
    "image_storage_path",
    "image_mirror_status",
    "image_mirror_error",
    "image_mirrored_at",
    "sets!cards_set_game_fk(code,name)",
  ].join(",");

  const [allStatuses, missedRows] = await Promise.all([
    sbFetchAll(`cards?select=image_mirror_status&${gameFilter}`),
    sbFetchAll(
      `cards?select=${encodeURIComponent(select)}&${gameFilter}&image_mirror_status=in.(error,external,pending)&order=image_mirror_status.asc&order=name.asc`
    ),
  ]);

  const generatedAt = new Date().toISOString();
  const rows = missedRows.slice(0, DETAIL_LIMIT);
  const omitted = Math.max(0, missedRows.length - rows.length);

  const report = [];
  report.push("# Card Image Variant Audit");
  report.push("");
  report.push(`Generated: ${generatedAt}`);
  report.push(`Game: ${game.name} (${game.slug})`);
  report.push(`Missed rows: ${missedRows.length}`);
  report.push("");
  report.push("## Status Counts");
  report.push("");
  report.push(mdTable(["Status", "Count"], countBy(allStatuses, (row) => row.image_mirror_status)));
  report.push("");
  report.push("## Misses By Reason");
  report.push("");
  report.push(mdTable(["Reason", "Count"], countBy(missedRows, errorReason)));
  report.push("");
  report.push("## Misses By Source Provider");
  report.push("");
  report.push(mdTable(["Provider", "Count"], countBy(missedRows, (card) => sourceProvider(sourceUrl(card)))));
  report.push("");
  report.push("## Cleanup Guidance");
  report.push("");
  report.push("- `source_404`: source URL is broken. Prefer a corrected `image_source_url`, then rerun `sync-card-image-variants.mjs --retry-errors`.");
  report.push("- `storage_upload`: source image downloaded, but Supabase Storage upload failed. Retry those rows after a short wait.");
  report.push("- `external_no_source_url`: no source image is recorded. Add an approved source URL or mark the row intentionally image-less.");
  report.push("- `external_unprocessed`: row still has a usable source but was not mirrored yet. Rerun the sync script for this game.");
  report.push("");
  report.push("## Missed Rows");
  report.push("");
  report.push(
    rows.length
      ? mdTable(
          ["Status", "Reason", "Provider", "Card", "Image key", "Set", "Source URL", "Error"],
          rows.map((card) => [
            card.image_mirror_status,
            errorReason(card),
            sourceProvider(sourceUrl(card)),
            card.name,
            card.card_image_id || card.card_number || card.id,
            cardSet(card),
            sourceUrl(card) ?? "",
            card.image_mirror_error ?? "",
          ])
        )
      : "No missed rows."
  );
  if (omitted > 0) {
    report.push("");
    report.push(`_Omitted ${omitted} rows because --detail-limit=${DETAIL_LIMIT}._`);
  }
  report.push("");

  fs.writeFileSync(REPORT_PATH, report.join("\n"));
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Missed rows: ${missedRows.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
