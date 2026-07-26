// Moon Terminal Phase C5 (decision D3) — set-value snapshot backfill.
//
// Reconstructs weekly entity_type='set' rows for market_index_snapshots from
// price_history, using as-of / carry-forward pricing grouped on
// cards.printed_set_code with region='en' (method validated in
// docs/moon-terminal-justtcg-findings.md §8 — NEVER group on set_id).
//
// Safety model:
//   1. A regression gate ALWAYS runs first: the stored 2026-07-23 snapshot is
//      reconstructed at its exact captured_at cutoff and compared per-set.
//      If any stored set is missing or the worst |delta| exceeds the gate,
//      the script refuses to write and exits non-zero.
//   2. Writes are POST ... on_conflict=(natural key) with
//      Prefer: resolution=ignore-duplicates — ON CONFLICT DO NOTHING. Existing
//      rows (especially 2026-07-23) are never modified; re-runs are no-ops.
//   3. chg_7d / chg_30d are written as NULL on every backfilled row. The live
//      columns are defined (column comments) as aggregates of *current
//      card-level provider statistics at capture time*, which do not exist for
//      past dates and cannot be reconstructed honestly.
//
// Dry run (regression gate + full preview, no writes):
//   node scripts/backfill-set-value-snapshots.mjs
//
// Write (regression gate, then upsert):
//   node scripts/backfill-set-value-snapshots.mjs --write

import fs from "node:fs";

const WRITE = process.argv.includes("--write");

const ONE_PIECE_DB_SLUG = "one_piece";
const REGION = "en";
const PRICE_BASIS = "tcg_market";
const METRIC_VERSION = 1;

// Sundays to backfill, cutoff 23:40 UTC each — the pg_cron schedule time
// (job 1, `40 23 * * 0`), so backfilled points match future cron output.
// 2026-06-14 and earlier are deliberately excluded (findings §8: p50
// staleness 67d — carry-forward plateau, not history).
const BACKFILL_DATES = [
  "2026-06-21",
  "2026-06-28",
  "2026-07-05",
  "2026-07-12",
  "2026-07-19",
];
const CRON_CUTOFF_TIME = "T23:40:00.000Z";

// Skip any (set, week) whose median carried-forward staleness exceeds this.
const STALENESS_GATE_DAYS = 10;

// Regression gate: findings §8 measured +0.04%..+4.17% with a *worse*
// (end-of-day) cutoff; with the matched cutoff we must land at or inside
// that range. Materially worse than the findings' range => stop.
const REGRESSION_MAX_ABS_DELTA_PCT = 4.5;

const REGRESSION_SNAPSHOT_DATE = "2026-07-23";
const ON_CONFLICT = "game_id,entity_type,entity_key,snapshot_date";
const DAY_MS = 86_400_000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sbGet(path, extraHeaders = {}, attempt = 0) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: restHeaders(extraHeaders),
  });
  if (!res.ok) {
    const body = await res.text();
    if (attempt < 3 && (res.status >= 500 || body.includes("57014"))) {
      // 57014 = statement timeout — back off and retry.
      await sleep(1500 * (attempt + 1));
      return sbGet(path, extraHeaders, attempt + 1);
    }
    throw new Error(`Supabase GET ${path.split("?")[0]} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function sbFetchAll(path, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const page = await sbGet(path, { Range: `${from}-${from + pageSize - 1}` });
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function sbCount(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "HEAD",
    headers: restHeaders({ Prefer: "count=exact", Range: "0-0" }),
  });
  if (!res.ok) {
    throw new Error(`Supabase HEAD ${path.split("?")[0]} failed: ${res.status}`);
  }
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  if (total == null || total === "*") {
    throw new Error(`No exact count in content-range for ${path.split("?")[0]}`);
  }
  return Number(total);
}

// Keyset pagination on id — stable and O(1) per page, unlike deep offsets.
async function fetchPriceHistory(gameId, maxCutoffIso) {
  const rows = [];
  let lastId = null;
  const pageSize = 1000;
  let pages = 0;
  while (true) {
    const idFilter = lastId ? `&id=gt.${lastId}` : "";
    const page = await sbGet(
      `price_history?select=id,card_id,tcg_market,recorded_at` +
        `&game_id=eq.${encodeURIComponent(gameId)}` +
        `&recorded_at=lte.${encodeURIComponent(maxCutoffIso)}` +
        `&tcg_market=not.is.null` +
        `&order=id.asc&limit=${pageSize}${idFilter}`
    );
    rows.push(...page);
    pages += 1;
    if (pages % 20 === 0) console.log(`  … ${rows.length} price_history rows (${pages} pages)`);
    if (page.length < pageSize) break;
    lastId = page[page.length - 1].id;
  }
  console.log(`  price_history rows fetched: ${rows.length} (${pages} pages)`);
  return rows;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Latest point at or before cutoff; series must be sorted by t asc.
function asOfIndex(times, cutoffMs) {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= cutoffMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
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

// Reconstruct per-set value at a cutoff: for each population card, the latest
// non-null tcg_market at or before the cutoff (carry-forward), summed per
// printed_set_code. Returns Map<code, {sum, cardCount, priced, p50Staleness}>.
function reconstruct(cutoffMs, populationByCode, seriesByCard) {
  const result = new Map();
  for (const [code, cardIds] of populationByCode) {
    let sum = 0;
    let priced = 0;
    const staleness = [];
    for (const cardId of cardIds) {
      const series = seriesByCard.get(cardId);
      if (!series) continue;
      const idx = asOfIndex(series.t, cutoffMs);
      if (idx < 0) continue;
      sum += series.p[idx];
      priced += 1;
      staleness.push((cutoffMs - series.t[idx]) / DAY_MS);
    }
    result.set(code, {
      sum,
      cardCount: cardIds.length,
      priced,
      p50Staleness: median(staleness),
    });
  }
  return result;
}

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log(`# Set-value snapshot backfill — ${WRITE ? "WRITE" : "DRY RUN"} — ${runStartedAt}\n`);

  // ---- Game ----
  const [game] = await sbFetchAll(
    `games?select=id,slug&slug=eq.${encodeURIComponent(ONE_PIECE_DB_SLUG)}`
  );
  if (!game?.id) throw new Error("One Piece game row is missing.");

  // ---- Stored 2026-07-23 snapshot (regression reference) ----
  const storedRows = await sbFetchAll(
    `market_index_snapshots?select=entity_key,set_id,entity_slug,entity_code,entity_name,` +
      `index_value,card_count,priced_count,chg_7d,chg_30d,captured_at,region` +
      `&game_id=eq.${encodeURIComponent(game.id)}&entity_type=eq.set` +
      `&snapshot_date=eq.${REGRESSION_SNAPSHOT_DATE}&order=entity_key.asc`
  );
  if (storedRows.length === 0) {
    throw new Error(`No stored entity_type='set' rows on ${REGRESSION_SNAPSHOT_DATE} — cannot regression-check.`);
  }
  const capturedAts = new Set(storedRows.map((row) => row.captured_at));
  if (capturedAts.size !== 1) {
    throw new Error(`Stored ${REGRESSION_SNAPSHOT_DATE} rows carry ${capturedAts.size} distinct captured_at values — expected 1. Stopping.`);
  }
  const regressionCutoffIso = storedRows[0].captured_at;
  const regressionCutoffMs = Date.parse(regressionCutoffIso);
  console.log(`Stored reference: ${storedRows.length} set rows @ ${REGRESSION_SNAPSHOT_DATE}, captured_at ${regressionCutoffIso}`);

  // ---- Sets (for set_id / slug / code / name resolution, matched by code) ----
  const sets = await sbFetchAll(
    `sets?select=id,code,slug,name&game_id=eq.${encodeURIComponent(game.id)}&order=id.asc`
  );
  const setByCode = new Map(sets.map((set) => [set.code, set]));

  // ---- Population: printed_set_code + region='en', deduped on card_image_id ----
  const cards = await sbFetchAll(
    `cards?select=id,card_image_id,printed_set_code` +
      `&game_id=eq.${encodeURIComponent(game.id)}&region=eq.${REGION}` +
      `&printed_set_code=not.is.null&order=id.asc`
  );
  const seenImageIds = new Set();
  let dupImageIds = 0;
  let nullImageIds = 0;
  const populationByCode = new Map();
  for (const card of cards) {
    if (card.card_image_id == null) {
      nullImageIds += 1; // cannot dedupe on null — keep the row
    } else if (seenImageIds.has(card.card_image_id)) {
      dupImageIds += 1;
      continue;
    } else {
      seenImageIds.add(card.card_image_id);
    }
    const bucket = populationByCode.get(card.printed_set_code) ?? [];
    bucket.push(card.id);
    populationByCode.set(card.printed_set_code, bucket);
  }
  console.log(
    `Population: ${cards.length} en cards, ${populationByCode.size} printed_set_codes ` +
      `(${dupImageIds} duplicate card_image_id dropped, ${nullImageIds} null card_image_id kept)`
  );

  // ---- price_history series (everything at or before the latest cutoff) ----
  console.log(`Fetching price_history (game one_piece, recorded_at <= ${regressionCutoffIso})…`);
  const historyRows = await fetchPriceHistory(game.id, regressionCutoffIso);
  const seriesByCard = new Map();
  for (const row of historyRows) {
    const t = Date.parse(row.recorded_at);
    if (!Number.isFinite(t)) continue;
    let series = seriesByCard.get(row.card_id);
    if (!series) {
      series = { t: [], p: [] };
      seriesByCard.set(row.card_id, series);
    }
    series.t.push(t);
    series.p.push(Number(row.tcg_market));
  }
  for (const series of seriesByCard.values()) {
    const order = series.t.map((_, i) => i).sort((a, b) => series.t[a] - series.t[b]);
    series.t = order.map((i) => series.t[i]);
    series.p = order.map((i) => series.p[i]);
  }

  // ==== 1 · REGRESSION GATE — reconstruct 2026-07-23 at the stored cutoff ====
  console.log(`\n## Regression gate — reconstruct ${REGRESSION_SNAPSHOT_DATE} @ ${regressionCutoffIso}\n`);
  const regressionRecon = reconstruct(regressionCutoffMs, populationByCode, seriesByCard);

  const regressionTable = [];
  let worst = { code: null, delta: 0 };
  const deltas = [];
  let missing = 0;
  for (const stored of storedRows) {
    const recon = regressionRecon.get(stored.entity_key);
    if (!recon || recon.priced === 0) {
      missing += 1;
      regressionTable.push([stored.entity_key, stored.index_value, "—", "MISSING", stored.card_count, recon?.cardCount ?? 0, stored.priced_count, recon?.priced ?? 0]);
      continue;
    }
    const deltaPct = ((recon.sum - stored.index_value) / stored.index_value) * 100;
    deltas.push(deltaPct);
    if (Math.abs(deltaPct) > Math.abs(worst.delta)) worst = { code: stored.entity_key, delta: deltaPct };
    regressionTable.push([
      stored.entity_key,
      stored.index_value.toFixed(2),
      recon.sum.toFixed(2),
      `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%`,
      stored.card_count,
      recon.cardCount,
      stored.priced_count,
      recon.priced,
    ]);
  }
  const reconOnlyCodes = [...regressionRecon.entries()]
    .filter(([code, r]) => r.priced > 0 && !storedRows.some((s) => s.entity_key === code))
    .map(([code]) => code);

  console.log(mdTable(
    ["set", "stored index_value", "reconstructed", "delta", "stored cards", "recon cards", "stored priced", "recon priced"],
    regressionTable
  ));
  const deltaAbs = deltas.map(Math.abs);
  console.log(`\nSets compared: ${deltas.length}/${storedRows.length} · missing: ${missing}`);
  console.log(`Delta: worst ${worst.code} ${worst.delta >= 0 ? "+" : ""}${worst.delta.toFixed(2)}% · median |Δ| ${median(deltaAbs)?.toFixed(2)}% · max |Δ| ${Math.max(...deltaAbs).toFixed(2)}%`);
  if (reconOnlyCodes.length) {
    console.log(`Codes reconstructed with prices but ABSENT from stored snapshot: ${reconOnlyCodes.join(", ")}`);
  }

  const gatePassed = missing === 0 && Math.max(...deltaAbs) <= REGRESSION_MAX_ABS_DELTA_PCT;
  if (!gatePassed) {
    console.error(
      `\nREGRESSION GATE FAILED (missing=${missing}, max |Δ|=${Math.max(...deltaAbs).toFixed(2)}% vs gate ${REGRESSION_MAX_ABS_DELTA_PCT}%). ` +
        `Refusing to write. Do not re-run with --write until this is understood.`
    );
    process.exit(1);
  }
  console.log(`\nREGRESSION GATE PASSED (max |Δ| ${Math.max(...deltaAbs).toFixed(2)}% <= ${REGRESSION_MAX_ABS_DELTA_PCT}%).`);

  // Informational: how far a ratio-of-index-values "chg" would sit from the
  // stored chg (which aggregates *current provider card-level statistics* —
  // per the live column comments). Documents why backfilled chg_* are NULL.
  for (const [label, days, storedKey] of [["chg_7d", 7, "chg_7d"], ["chg_30d", 30, "chg_30d"]]) {
    const refRecon = reconstruct(regressionCutoffMs - days * DAY_MS, populationByCode, seriesByCard);
    const diffs = [];
    for (const stored of storedRows) {
      if (stored[storedKey] == null) continue;
      const now = regressionRecon.get(stored.entity_key);
      const ref = refRecon.get(stored.entity_key);
      if (!now || !ref || !ref.sum) continue;
      const ratioChg = (now.sum / ref.sum - 1) * 100;
      diffs.push(Math.abs(ratioChg - Number(stored[storedKey])));
    }
    console.log(
      `chg semantics probe (${label}): ratio-of-index vs stored provider-aggregate — ` +
        `median |diff| ${median(diffs)?.toFixed(2)}pp, max ${Math.max(...diffs).toFixed(2)}pp over ${diffs.length} sets`
    );
  }

  // ==== 2 · BACKFILL — five Sundays at the cron cutoff ====
  console.log(`\n## Backfill preview — cutoff ${CRON_CUTOFF_TIME.slice(1, 6)} UTC, staleness gate ${STALENESS_GATE_DAYS}d\n`);
  const storedCodes = new Set(storedRows.map((row) => row.entity_key));
  const rowsToWrite = [];
  const skips = [];
  const weekSummaries = [];

  for (const snapshotDate of BACKFILL_DATES) {
    const cutoffMs = Date.parse(`${snapshotDate}${CRON_CUTOFF_TIME}`);
    const recon = reconstruct(cutoffMs, populationByCode, seriesByCard);
    let written = 0;
    const p50s = [];

    for (const code of [...storedCodes].sort()) {
      const r = recon.get(code);
      const set = setByCode.get(code);
      if (!set) {
        skips.push({ week: snapshotDate, code, reason: "printed_set_code does not resolve in sets" });
        continue;
      }
      if (!r || r.priced === 0) {
        skips.push({ week: snapshotDate, code, reason: "no priced cards at cutoff" });
        continue;
      }
      if (r.p50Staleness > STALENESS_GATE_DAYS) {
        skips.push({ week: snapshotDate, code, reason: `median staleness ${r.p50Staleness.toFixed(1)}d > ${STALENESS_GATE_DAYS}d` });
        continue;
      }
      p50s.push(r.p50Staleness);
      written += 1;
      rowsToWrite.push({
        game_id: game.id,
        entity_type: "set",
        entity_key: code,
        character_id: null,
        set_id: set.id,
        rarity_id: null,
        entity_slug: set.slug,
        entity_code: set.code,
        entity_name: set.name,
        snapshot_date: snapshotDate,
        index_value: round2(r.sum),
        card_count: r.cardCount,
        priced_count: r.priced,
        chg_7d: null, // unreconstructable: column = current provider stats at capture time
        chg_30d: null,
        price_basis: PRICE_BASIS,
        metric_version: METRIC_VERSION,
        captured_at: runStartedAt, // honest: when this backfill actually ran
        region: REGION,
      });
    }
    // Codes with prices this week but outside the validated 53 — never written.
    for (const [code, r] of recon) {
      if (!storedCodes.has(code) && r.priced > 0) {
        skips.push({ week: snapshotDate, code, reason: "outside the 53 codes validated by the regression gate — excluded" });
      }
    }
    weekSummaries.push({ week: snapshotDate, written, p50Range: p50s.length ? `${Math.min(...p50s).toFixed(1)}–${Math.max(...p50s).toFixed(1)}d (med ${median(p50s).toFixed(1)}d)` : "—" });
  }

  console.log(mdTable(
    ["week (snapshot_date)", "sets to write", "per-set p50 staleness range"],
    weekSummaries.map((w) => [w.week, w.written, w.p50Range])
  ));
  console.log(`\nTotal rows to write: ${rowsToWrite.length} · skips: ${skips.length}`);
  if (skips.length) {
    console.log("\n### Skips\n");
    console.log(mdTable(["week", "set", "reason"], skips.map((s) => [s.week, s.code, s.reason])));
  }

  // ---- Row counts per snapshot_date (before) ----
  const countDates = [...BACKFILL_DATES, REGRESSION_SNAPSHOT_DATE];
  async function snapshotCounts(label) {
    const counts = [];
    for (const date of countDates) {
      counts.push([date, await sbCount(`market_index_snapshots?entity_type=eq.set&snapshot_date=eq.${date}`)]);
    }
    const total = await sbCount(`market_index_snapshots?entity_type=eq.set`);
    console.log(`\n### entity_type='set' row counts — ${label}\n`);
    console.log(mdTable(["snapshot_date", "rows"], counts));
    console.log(`Total set rows: ${total}`);
    return { counts, total };
  }
  const before = await snapshotCounts("BEFORE");

  if (!WRITE) {
    console.log(`\nDry run only — no writes performed. Re-run with --write to apply.`);
    return;
  }

  // ---- Write: ON CONFLICT (natural key) DO NOTHING ----
  console.log(`\nWriting ${rowsToWrite.length} rows (on_conflict=${ON_CONFLICT}, ignore-duplicates)…`);
  const chunkSize = 500;
  for (let i = 0; i < rowsToWrite.length; i += chunkSize) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/market_index_snapshots?on_conflict=${encodeURIComponent(ON_CONFLICT)}`,
      {
        method: "POST",
        headers: restHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal",
        }),
        body: JSON.stringify(rowsToWrite.slice(i, i + chunkSize)),
      }
    );
    if (!res.ok) {
      throw new Error(`Write chunk failed: ${res.status} ${await res.text()}`);
    }
  }

  const after = await snapshotCounts("AFTER");
  console.log(
    `\nDone. Total set rows: ${before.total} -> ${after.total} (+${after.total - before.total}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
