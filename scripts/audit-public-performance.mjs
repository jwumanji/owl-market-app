// Lightweight public route and API timing audit for OWL Market.
//
// Examples:
//   node scripts/audit-public-performance.mjs --base-url=http://localhost:3003
//   node scripts/audit-public-performance.mjs --base-url=https://owl-market.vercel.app --repeat=3 --report=C:\tmp\owl-perf.md

import fs from "node:fs";
import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = process.env.OWL_PERF_BASE_URL ?? "http://localhost:3003";
const BASE_URL = normalizeBaseUrl(readArg("--base-url") ?? DEFAULT_BASE_URL);
const GAME_ROUTE = readArg("--game-route") ?? "one-piece";
const GAME_QUERY = readArg("--game-query") ?? "one_piece";
const REPORT_PATH = readArg("--report");
const REPEAT = parsePositiveInt(readArg("--repeat"), 1);
const WARMUPS = parseNonNegativeInt(readArg("--warmups"), 0);
const FAIL_SLOW_MS = parseNonNegativeInt(readArg("--fail-slow-ms"), 0);

const PAGE_ENDPOINTS = [
  ["home", "/"],
  ["markets", `/games/${GAME_ROUTE}/markets`],
  ["catalog", `/games/${GAME_ROUTE}/catalog`],
  ["rarities", `/games/${GAME_ROUTE}/rarities`],
  ["sets", `/games/${GAME_ROUTE}/sets`],
  ["characters", `/games/${GAME_ROUTE}/characters`],
];

const API_ENDPOINTS = [
  ["api markets", `/api/markets?game=${GAME_QUERY}&limit=20`],
  ["api catalog", `/api/markets?game=${GAME_QUERY}&limit=20&sort=value`],
  ["api rarities", `/api/rarities?game=${GAME_QUERY}`],
  ["api sets", `/api/sets?game=${GAME_QUERY}`],
  ["api characters", `/api/characters?game=${GAME_QUERY}`],
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

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid --base-url '${value}'.`);
  }
}

function endpointUrl(path) {
  return new URL(path, BASE_URL).toString();
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function bytesFor(value) {
  return Buffer.byteLength(value, "utf8");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function formatMs(value) {
  return `${Math.round(value)}ms`;
}

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function mdTable(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return lines.join("\n");
}

async function fetchTimed(path, accept) {
  const url = endpointUrl(path);
  const start = performance.now();
  const response = await fetch(url, {
    headers: {
      accept,
      "user-agent": "OwlMarketPublicPerformanceAudit/1.0",
    },
  });
  const text = await response.text();
  return {
    body: text,
    bytes: bytesFor(text),
    cacheControl: response.headers.get("cache-control") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    ms: performance.now() - start,
    ok: response.ok,
    status: response.status,
    url,
  };
}

async function measureEndpoint(path, accept) {
  for (let i = 0; i < WARMUPS; i += 1) {
    await fetchTimed(path, accept).catch(() => null);
  }

  const samples = [];
  for (let i = 0; i < REPEAT; i += 1) {
    samples.push(await fetchTimed(path, accept));
  }

  const timings = samples.map((sample) => sample.ms);
  const representative = samples[samples.length - 1];
  return {
    ...representative,
    maxMs: Math.max(...timings),
    medianMs: median(timings),
    minMs: Math.min(...timings),
    samples,
  };
}

function analyzePage(result) {
  const html = result.body;
  return {
    cacheControl: result.cacheControl,
    cardImageRefs: countMatches(html, /\/storage\/v1\/object\/public\/card-images\//g),
    highPriorityImages: countMatches(html, /fetchPriority="high"|fetchpriority="high"/g),
    imagePreloads: countMatches(html, /rel="preload"[^>]+as="image"/g),
    imgTags: countMatches(html, /<img\b/g),
    nextImageRefs: countMatches(html, /\/_next\/image/g),
    status: result.status,
  };
}

function analyzeApi(result) {
  let records = "";
  try {
    const parsed = JSON.parse(result.body);
    if (Array.isArray(parsed)) {
      records = String(parsed.length);
    } else if (parsed && typeof parsed === "object") {
      records = String(Object.keys(parsed).length);
    }
  } catch {
    records = "non-json";
  }
  return {
    cacheControl: result.cacheControl,
    records,
    status: result.status,
  };
}

async function main() {
  const pageRows = [];
  const apiRows = [];
  const failures = [];

  for (const [label, path] of PAGE_ENDPOINTS) {
    const result = await measureEndpoint(path, "text/html,application/xhtml+xml");
    const analysis = analyzePage(result);
    if (!result.ok) failures.push(`${label} returned ${result.status}`);
    if (FAIL_SLOW_MS > 0 && result.medianMs > FAIL_SLOW_MS) {
      failures.push(`${label} median ${formatMs(result.medianMs)} exceeded ${FAIL_SLOW_MS}ms`);
    }
    pageRows.push([
      label,
      analysis.status,
      formatMs(result.medianMs),
      formatMs(result.minMs),
      formatMs(result.maxMs),
      formatBytes(result.bytes),
      analysis.imgTags,
      analysis.cardImageRefs,
      analysis.nextImageRefs,
      analysis.imagePreloads,
      analysis.highPriorityImages,
      analysis.cacheControl || "-",
    ]);
  }

  for (const [label, path] of API_ENDPOINTS) {
    const result = await measureEndpoint(path, "application/json");
    const analysis = analyzeApi(result);
    if (!result.ok) failures.push(`${label} returned ${result.status}`);
    if (FAIL_SLOW_MS > 0 && result.medianMs > FAIL_SLOW_MS) {
      failures.push(`${label} median ${formatMs(result.medianMs)} exceeded ${FAIL_SLOW_MS}ms`);
    }
    apiRows.push([
      label,
      analysis.status,
      formatMs(result.medianMs),
      formatMs(result.minMs),
      formatMs(result.maxMs),
      formatBytes(result.bytes),
      analysis.records,
      analysis.cacheControl || "-",
    ]);
  }

  const lines = [
    "# OWL Market Public Performance Audit",
    "",
    `Base URL: ${BASE_URL}`,
    `Game route: ${GAME_ROUTE}`,
    `Game query: ${GAME_QUERY}`,
    `Repeat: ${REPEAT}`,
    `Warmups: ${WARMUPS}`,
    "",
    "## Pages",
    "",
    mdTable(
      ["Route", "Status", "Median", "Min", "Max", "HTML", "img", "card refs", "next image", "preloads", "high priority", "cache"],
      pageRows,
    ),
    "",
    "## APIs",
    "",
    mdTable(["Route", "Status", "Median", "Min", "Max", "Body", "Records/keys", "cache"], apiRows),
    "",
  ];

  if (failures.length > 0) {
    lines.push("## Failures", "", ...failures.map((failure) => `- ${failure}`), "");
    process.exitCode = 1;
  }

  const output = lines.join("\n");
  console.log(output);

  if (REPORT_PATH) {
    fs.writeFileSync(REPORT_PATH, output);
    console.log(`Wrote ${REPORT_PATH}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
