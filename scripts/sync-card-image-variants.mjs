// Mirror external card images into Supabase Storage as small, preview, and
// display-sized WebP variants. Default mode is a dry run.
//
// Usage:
//   node scripts/sync-card-image-variants.mjs --game=one_piece --limit=50
//   node scripts/sync-card-image-variants.mjs --game=one_piece --limit=50 --apply
//   node scripts/sync-card-image-variants.mjs --game=one_piece --retry-errors --retry-reason=storage_upload --apply
//
// Games with unapproved asset status are blocked unless explicitly overridden
// with --allow-unapproved-assets.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "card-images";
const REPORT_PATH = readArg("--report") ?? "card-image-variants-report.md";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const RETRY_ERRORS = process.argv.includes("--retry-errors");
const RETRY_REASON = readArg("--retry-reason");
const ALLOW_UNAPPROVED = process.argv.includes("--allow-unapproved-assets");
const GAME_SLUG = readArg("--game") ?? process.env.OWL_GAME_SLUG ?? "one_piece";
const LIMIT = parsePositiveInt(readArg("--limit"), 50);
const DELAY_MS = parsePositiveInt(readArg("--delay-ms"), 100);
const DOWNLOAD_TIMEOUT_MS = parsePositiveInt(readArg("--download-timeout-ms"), 15000);
const CONCURRENCY = parsePositiveInt(readArg("--concurrency"), 1);
const CACHE_CONTROL = "31536000";

const APPROVED_ASSET_STATUSES = new Set([
  "approved",
  "cleared",
  "licensed",
  "ok",
  "owned",
  "permitted",
  "public_domain",
]);

const IMAGE_VARIANTS = [
  { key: "thumb", width: 96, quality: 72 },
  { key: "preview", width: 420, quality: 78 },
  { key: "large", width: 720, quality: 82 },
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePathSegment(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  if (!normalized) throw new Error("Storage path segment cannot be empty.");
  return normalized;
}

function routeSlugForGame(game) {
  const routeSlug = typeof game.metadata?.route_slug === "string" ? game.metadata.route_slug.trim() : "";
  return routeSlug || game.slug.replace(/_/g, "-");
}

function cardKey(card) {
  return card.card_image_id || card.card_number || card.id;
}

function baseStoragePath(game, card) {
  return [
    "cards",
    normalizePathSegment(routeSlugForGame(game)),
    "mirrored",
    normalizePathSegment(cardKey(card)),
  ].join("/");
}

function variantPath(game, card, variant) {
  return `${baseStoragePath(game, card)}/${variant}.webp`;
}

function storagePublicUrlPrefix(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/`;
}

function isOwnStorageUrl(supabaseUrl, url) {
  return typeof url === "string" && url.startsWith(storagePublicUrlPrefix(supabaseUrl));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function pickSourceUrl(supabaseUrl, card) {
  const candidates = [
    card.image_source_url,
    card.image_url && !isOwnStorageUrl(supabaseUrl, card.image_url) ? card.image_url : null,
    card.image_url_small && !isOwnStorageUrl(supabaseUrl, card.image_url_small) ? card.image_url_small : null,
    card.image_url,
    card.image_url_small,
  ];
  return candidates.find((value) => typeof value === "string" && isHttpUrl(value)) ?? null;
}

function assetStatus(game) {
  const status = game.metadata?.asset_status;
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function canMirrorAssets(game) {
  if (ALLOW_UNAPPROVED) return true;
  if (game.slug === "one_piece") return true;
  return APPROVED_ASSET_STATUSES.has(assetStatus(game));
}

function shortError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function retryErrorPattern(reason) {
  const normalized = String(reason ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "storage_upload") return "%upload failed%";
  if (normalized === "source_404") return "%404%";
  if (normalized === "source_timeout") return "%timed out%";
  if (normalized === "source_download_failed") return "%download failed%";
  throw new Error(`Unknown retry reason '${reason}'. Expected storage_upload, source_404, source_timeout, or source_download_failed.`);
}

function mdTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return out.join("\n");
}

function writeReport({ game, blockedReason, rows, counts }) {
  const lines = [
    "# Card Image Variant Sync",
    "",
    `Mode: ${APPLY ? "apply" : "dry-run"}`,
    `Game: ${game ? `${game.name} (${game.slug})` : GAME_SLUG}`,
    `Asset status: ${game ? assetStatus(game) || (game.slug === "one_piece" ? "implicit_one_piece_allow" : "missing") : "unknown"}`,
    `Bucket: ${BUCKET}`,
    `Limit: ${LIMIT}`,
    `Concurrency: ${CONCURRENCY}`,
    `Force: ${FORCE ? "yes" : "no"}`,
    `Retry errors: ${RETRY_ERRORS ? "yes" : "no"}`,
    `Retry reason: ${RETRY_REASON ?? "any"}`,
    "",
  ];

  if (blockedReason) {
    lines.push(`Blocked: ${blockedReason}`, "");
  }

  lines.push("## Counts", "");
  lines.push(mdTable(["Metric", "Count"], Object.entries(counts ?? {}).map(([key, value]) => [key, value])));
  lines.push("");
  lines.push("## Rows", "");
  lines.push(
    rows.length
      ? mdTable(
          ["Status", "Card", "Image key", "Source", "Storage path", "Note"],
          rows.map((row) => [row.status, row.name, row.key, row.source, row.path, row.note])
        )
      : "No rows."
  );
  lines.push("");
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveGame() {
  const candidates = Array.from(new Set([
    GAME_SLUG,
    GAME_SLUG.replace(/-/g, "_"),
    GAME_SLUG.replace(/_/g, "-"),
  ]));

  for (const slug of candidates) {
    const { data, error } = await supabase
      .from("games")
      .select("id, slug, name, metadata")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(`Game lookup failed: ${error.message}`);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("games")
    .select("id, slug, name, metadata")
    .filter("metadata->>route_slug", "eq", GAME_SLUG)
    .maybeSingle();

  if (error) throw new Error(`Game route lookup failed: ${error.message}`);
  if (!data) throw new Error(`Game '${GAME_SLUG}' was not found.`);
  return data;
}

async function ensureBucket() {
  const { error: getError } = await supabase.storage.getBucket(BUCKET);
  if (!getError) return;

  const statusCode = getError.statusCode ?? getError.status;
  const notFound =
    statusCode === 404 ||
    statusCode === "404" ||
    String(getError.message ?? "").toLowerCase().includes("not found");
  if (!notFound) {
    throw new Error(`Unable to inspect storage bucket '${BUCKET}': ${getError.message}`);
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["image/webp"],
    fileSizeLimit: 10 * 1024 * 1024,
  });

  if (createError) {
    throw new Error(`Unable to create storage bucket '${BUCKET}': ${createError.message}`);
  }
}

const CARD_SELECT = `
  id,
  game_id,
  card_image_id,
  card_number,
  name,
  image_url,
  image_url_small,
  image_url_preview,
  image_source_url,
  image_storage_path,
  image_mirror_status
`;

async function runCardQuery(game, { statuses, excludeMirrored = false, errorLike = null, limit }) {
  let query = supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("game_id", game.id)
    .or("image_url.not.is.null,image_url_small.not.is.null,image_source_url.not.is.null")
    .order("id", { ascending: true })
    .limit(limit);

  if (statuses) {
    query = query.in("image_mirror_status", statuses);
  }
  if (excludeMirrored) {
    query = query.neq("image_mirror_status", "mirrored");
  }
  if (errorLike) {
    query = query.ilike("image_mirror_error", errorLike);
  }

  const { data, error } = await query;
  if (error) {
    if (String(error.message ?? "").includes("image_url_preview")) {
      throw new Error("Card image variant columns are missing. Run schema-migration-v43-card-image-variants.sql before this script.");
    }
    throw new Error(`Card query failed: ${error.message}`);
  }
  return data ?? [];
}

async function loadCards(game) {
  if (FORCE) {
    return runCardQuery(game, { limit: LIMIT });
  }

  if (RETRY_ERRORS) {
    const errorLike = retryErrorPattern(RETRY_REASON);
    if (errorLike) {
      return runCardQuery(game, { statuses: ["error"], errorLike, limit: LIMIT });
    }
    return runCardQuery(game, { excludeMirrored: true, limit: LIMIT });
  }

  const pending = await runCardQuery(game, { statuses: ["pending"], limit: LIMIT });
  if (pending.length >= LIMIT) return pending;

  const external = await runCardQuery(game, {
    statuses: ["external"],
    limit: LIMIT - pending.length,
  });

  return [...pending, ...external];
}

async function downloadImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      "User-Agent": "OwlMarketImageMirror/1.0",
    },
  }).catch((error) => {
    if (error?.name === "AbortError") {
      throw new Error(`Image download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`);
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeout);
  });
  if (!res.ok) {
    throw new Error(`Image download failed: ${res.status} ${await res.text()}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("image")) {
    throw new Error(`Download was not an image: ${contentType}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function makeVariants(buffer) {
  const image = sharp(buffer, { animated: false }).rotate();
  const variants = {};

  for (const variant of IMAGE_VARIANTS) {
    variants[variant.key] = await image
      .clone()
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: variant.quality })
      .toBuffer();
  }

  return variants;
}

async function uploadVariant(path, body) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: CACHE_CONTROL,
  });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function patchCard(game, cardId, patch) {
  const { error } = await supabase
    .from("cards")
    .update(patch)
    .eq("id", cardId)
    .eq("game_id", game.id);
  if (error) throw new Error(`Card patch failed for ${cardId}: ${error.message}`);
}

async function refreshSummaries(game) {
  const { error } = await supabase.rpc("refresh_public_game_summaries", { p_game_id: game.id });
  if (error) {
    console.warn(`Summary refresh skipped: ${error.message}`);
  }
}

async function processCard(game, card) {
  const sourceUrl = pickSourceUrl(SUPABASE_URL, card);
  const key = cardKey(card);
  const basePath = baseStoragePath(game, card);

  if (!sourceUrl) {
    if (APPLY) {
      await patchCard(game, card.id, {
        image_mirror_status: "skipped",
        image_mirror_error: "No source image URL.",
      });
    }
    return {
      status: "skipped",
      name: card.name,
      key,
      source: "",
      path: basePath,
      note: "No source image URL.",
    };
  }

  if (!APPLY) {
    return {
      status: "candidate",
      name: card.name,
      key,
      source: sourceUrl,
      path: basePath,
      note: "Dry run only.",
    };
  }

  await patchCard(game, card.id, {
    image_mirror_status: "pending",
    image_mirror_error: null,
  });

  const original = await downloadImage(sourceUrl);
  const variants = await makeVariants(original);
  const thumbUrl = await uploadVariant(variantPath(game, card, "thumb"), variants.thumb);
  const previewUrl = await uploadVariant(variantPath(game, card, "preview"), variants.preview);
  const largeUrl = await uploadVariant(variantPath(game, card, "large"), variants.large);

  await patchCard(game, card.id, {
    image_source_url: isOwnStorageUrl(SUPABASE_URL, sourceUrl) ? card.image_source_url : sourceUrl,
    image_url_small: thumbUrl,
    image_url_preview: previewUrl,
    image_url: largeUrl,
    image_storage_path: basePath,
    image_mirror_status: "mirrored",
    image_mirror_error: null,
    image_mirrored_at: new Date().toISOString(),
  });

  return {
    status: "mirrored",
    name: card.name,
    key,
    source: sourceUrl,
    path: basePath,
    note: "Uploaded thumb, preview, and large variants.",
  };
}

async function main() {
  console.log(`Starting card image variant sync (${APPLY ? "apply" : "dry-run"}) for ${GAME_SLUG}, limit ${LIMIT}.`);
  const rows = [];
  const counts = {
    candidates: 0,
    mirrored: 0,
    skipped: 0,
    errors: 0,
  };

  const game = await resolveGame();
  if (!canMirrorAssets(game)) {
    const blockedReason = `Asset status '${assetStatus(game) || "missing"}' is not approved for mirroring. Use --allow-unapproved-assets only after legal/asset approval.`;
    writeReport({ game, blockedReason, rows, counts });
    throw new Error(blockedReason);
  }

  if (APPLY) {
    await ensureBucket();
  }

  const cards = await loadCards(game);
  counts.candidates = cards.length;
  console.log(`Loaded ${cards.length} candidate cards.`);

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < cards.length) {
      const index = nextIndex;
      nextIndex += 1;
      const card = cards[index];

      try {
        if (APPLY) {
          console.log(`[${index + 1}/${cards.length}] ${card.name}`);
        }
        const result = await processCard(game, card);
        rows[index] = result;
        if (result.status === "mirrored") counts.mirrored += 1;
        if (result.status === "skipped") counts.skipped += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
      } catch (error) {
        counts.errors += 1;
        const note = shortError(error);
        rows[index] = {
          status: "error",
          name: card.name,
          key: cardKey(card),
          source: pickSourceUrl(SUPABASE_URL, card) ?? "",
          path: baseStoragePath(game, card),
          note,
        };
        if (APPLY) {
          await patchCard(game, card.id, {
            image_mirror_status: "error",
            image_mirror_error: note,
          });
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cards.length) }, () => worker())
  );

  if (APPLY && counts.mirrored > 0) {
    await refreshSummaries(game);
  }

  writeReport({ game, rows: rows.filter(Boolean), counts });
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(APPLY ? "Apply complete." : "Dry run only. Re-run with --apply to mirror image variants.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
