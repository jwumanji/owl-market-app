// Set-value v2 (entity_type='set_baseline', metric_version=2) — history
// backfill for the 7 stored snapshot dates, ANCHORED to the writer's fresh
// point. Companion to scripts/backfill-set-value-snapshots.mjs (v1), whose
// machinery this reuses; the population differs: ONLY booster-baseline cards,
// classified by src/lib/games/one-piece/booster-baseline.ts — imported below
// via Node type-stripping (same mechanism as scripts/audit-booster-baseline.mjs),
// NEVER re-implemented.
//
// Method:
//   1. The writer (/api/sync/set-baseline) must have produced today's v2 rows
//      first — they are the anchor AND the gate-2 stats-basis reference.
//   2. MANDATORY GATE 2 — basis agreement. Reconstruct today's baseline sums
//      from price_history (as-of carry-forward at the writer's captured_at)
//      and compare per-set to the writer's price_stats values. The
//      value-ratio-population-audit predicts the history-vs-stats divergent
//      cards are almost exactly the excluded promos, so the baseline recon
//      should track stats tightly: gate at median |Δ| <= 1%, worst |Δ| <= 3%.
//      FAIL -> exit 1, zero writes (the writer and the chip revival proceed on
//      go-forward data only; the failure is documented).
//   3. Anchor factor per set = writer_today / recon_today (expect ~1.00 given
//      gate 2 — applied anyway; that is the discipline that kept the v1
//      backfill honest).
//   4. Backfill the 7 stored dates at each date's OWN cutoff convention
//      (set-value-backfill.md): Sundays 06-21..07-19 at 23:40 UTC (pg_cron
//      time), 07-23 at the stored batch's exact captured_at (09:45:14Z),
//      07-26 at its stored captured_at (23:40:00Z). Cutoffs for 07-23/07-26
//      are READ from the stored v1 rows, not hardcoded.
//   5. Per-set handling:
//        · staleness gate: skip any (set, week) whose median carried-forward
//          staleness exceeds 10 days (expect EB04 on the early Sundays);
//        · baseline-empty sets that still EXIST in the catalog (ST29/ST30
//          genuinely empty; P = 100% promo, baseline honestly $0) are written
//          as zero rows — mirrors the writer's go-forward semantics;
//        · catalog-deleted sets (OP16: v1 stored rows prove it had cards, the
//          current catalog has none, so the baseline population cannot be
//          reconstructed for ANY date) are skipped;
//        · population codes outside `sets` (the "N" artifact) never write.
//   6. chg_7d / chg_30d NULL on every backfilled row (unreconstructable —
//      same policy as the v1 backfill). captured_at = actual run time.
//      Upsert = ON CONFLICT (natural key) DO NOTHING: today's writer rows and
//      any re-run are untouched/no-ops.
//
// Dry run (gates + full preview, no writes):
//   node scripts/backfill-set-baseline.mjs
// Write:
//   node scripts/backfill-set-baseline.mjs --write

import fs from "node:fs";

const { classifyBoosterBaseline } = await import(
  new URL("../src/lib/games/one-piece/booster-baseline.ts", import.meta.url).href
);

const WRITE = process.argv.includes("--write");

const ONE_PIECE_DB_SLUG = "one_piece";
const REGION = "en";
const PRICE_BASIS = "tcg_market";
const ENTITY_TYPE = "set_baseline";
const METRIC_VERSION = 2;

// Sundays at the pg_cron capture time; 07-23 / 07-26 cutoffs come from the
// stored v1 batches at runtime.
const SUNDAY_DATES = ["2026-06-21", "2026-06-28", "2026-07-05", "2026-07-12", "2026-07-19"];
const CRON_CUTOFF_TIME = "T23:40:00.000Z";
const STORED_CUTOFF_DATES = ["2026-07-23", "2026-07-26"];

const STALENESS_GATE_DAYS = 10;
const GATE2_MEDIAN_PCT = 1.0;
const GATE2_WORST_PCT = 3.0;

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
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...extra };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sbGet(path, extraHeaders = {}, attempt = 0) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders(extraHeaders) });
  if (!res.ok) {
    const body = await res.text();
    if (attempt < 3 && (res.status >= 500 || body.includes("57014"))) {
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
  if (!res.ok) throw new Error(`Supabase HEAD ${path.split("?")[0]} failed: ${res.status}`);
  const total = (res.headers.get("content-range") ?? "").split("/")[1];
  if (total == null || total === "*") throw new Error(`No exact count for ${path.split("?")[0]}`);
  return Number(total);
}

// Keyset pagination on id (v1 machinery).
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

function fmtPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

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

// Reconstruct per-set BASELINE value at a cutoff (v1 machinery, baseline
// population): latest non-null tcg_market at or before the cutoff per card,
// summed per printed_set_code.
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
    result.set(code, { sum, cardCount: cardIds.length, priced, p50Staleness: median(staleness) });
  }
  return result;
}

async function fetchStoredV1Rows(gameId, snapshotDate) {
  const rows = await sbFetchAll(
    `market_index_snapshots?select=entity_key,card_count,index_value,captured_at` +
      `&game_id=eq.${encodeURIComponent(gameId)}&entity_type=eq.set` +
      `&snapshot_date=eq.${snapshotDate}&order=entity_key.asc`
  );
  if (rows.length === 0) throw new Error(`No stored v1 rows on ${snapshotDate}`);
  const capturedAts = new Set(rows.map((row) => row.captured_at));
  if (capturedAts.size !== 1) {
    throw new Error(`Stored v1 ${snapshotDate} rows carry ${capturedAts.size} captured_at values — expected 1.`);
  }
  return { rows, capturedAt: rows[0].captured_at };
}

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log(`# Set-baseline (v2) backfill — ${WRITE ? "WRITE" : "DRY RUN"} — ${runStartedAt}\n`);

  // ---- Game + sets ----
  const [game] = await sbFetchAll(`games?select=id,slug&slug=eq.${ONE_PIECE_DB_SLUG}`);
  if (!game?.id) throw new Error("One Piece game row is missing.");
  const sets = await sbFetchAll(
    `sets?select=id,code,slug,name&game_id=eq.${encodeURIComponent(game.id)}&order=id.asc`
  );
  const setByCode = new Map(sets.filter((s) => s.code).map((s) => [s.code, s]));

  // ---- Writer's fresh v2 rows: the anchor + gate-2 reference ----
  const v2Dates = await sbFetchAll(
    `market_index_snapshots?select=snapshot_date&game_id=eq.${encodeURIComponent(game.id)}` +
      `&entity_type=eq.${ENTITY_TYPE}&order=snapshot_date.desc&limit=1`
  );
  if (v2Dates.length === 0) {
    throw new Error("No set_baseline rows exist — run /api/sync/set-baseline first (it is the anchor).");
  }
  const anchorDate = v2Dates[0].snapshot_date;
  const writerRows = await sbFetchAll(
    `market_index_snapshots?select=entity_key,set_id,index_value,card_count,priced_count,captured_at` +
      `&game_id=eq.${encodeURIComponent(game.id)}&entity_type=eq.${ENTITY_TYPE}` +
      `&snapshot_date=eq.${anchorDate}&order=entity_key.asc`
  );
  const writerCapturedAts = new Set(writerRows.map((r) => r.captured_at));
  if (writerCapturedAts.size !== 1) {
    throw new Error(`Writer rows @ ${anchorDate} carry ${writerCapturedAts.size} captured_at values — expected 1.`);
  }
  const writerCapturedAt = writerRows[0].captured_at;
  const writerCutoffMs = Date.parse(writerCapturedAt);
  const writerByCode = new Map(writerRows.map((r) => [r.entity_key, r]));
  console.log(`Anchor: ${writerRows.length} writer v2 rows @ ${anchorDate}, captured_at ${writerCapturedAt}`);

  const backfillDates = [...SUNDAY_DATES, ...STORED_CUTOFF_DATES];
  if (backfillDates.some((d) => d >= anchorDate)) {
    throw new Error(`Backfill dates must all predate the writer's snapshot_date ${anchorDate}.`);
  }

  // ---- Stored v1 batches: exact cutoffs for 07-23 / 07-26 + the empty-vs-
  // catalog-deleted discriminator (ST29/ST30 stored card_count=0 vs OP16>0) ----
  const v1For = {};
  for (const date of STORED_CUTOFF_DATES) {
    v1For[date] = await fetchStoredV1Rows(game.id, date);
    console.log(`Stored v1 @ ${date}: ${v1For[date].rows.length} rows, captured_at ${v1For[date].capturedAt}`);
  }
  const v1Latest = new Map(v1For[STORED_CUTOFF_DATES[1]].rows.map((r) => [r.entity_key, r]));

  const cutoffByDate = new Map();
  for (const date of SUNDAY_DATES) cutoffByDate.set(date, Date.parse(`${date}${CRON_CUTOFF_TIME}`));
  for (const date of STORED_CUTOFF_DATES) cutoffByDate.set(date, Date.parse(v1For[date].capturedAt));

  // ---- Population: baseline classifier over printed_set_code + region='en',
  // deduped on card_image_id ----
  const cards = await sbFetchAll(
    `cards?select=id,card_image_id,printed_set_code,name,rarity` +
      `&game_id=eq.${encodeURIComponent(game.id)}&region=eq.${REGION}` +
      `&printed_set_code=not.is.null&order=id.asc`
  );
  const seenImageIds = new Set();
  let dupImageIds = 0;
  let nullImageIds = 0;
  let excluded = 0;
  const populationByCode = new Map(); // code -> baseline card ids
  const totalCardsByCode = new Map(); // code -> ALL current cards (any class)
  for (const card of cards) {
    totalCardsByCode.set(card.printed_set_code, (totalCardsByCode.get(card.printed_set_code) ?? 0) + 1);
    if (card.card_image_id == null) {
      nullImageIds += 1; // cannot classify or dedupe — not baseline
      continue;
    }
    if (seenImageIds.has(card.card_image_id)) {
      dupImageIds += 1;
      continue;
    }
    seenImageIds.add(card.card_image_id);
    const verdict = classifyBoosterBaseline({
      cardImageId: card.card_image_id,
      name: card.name,
      rarity: card.rarity,
    });
    if (!verdict.included) {
      excluded += 1;
      continue;
    }
    const bucket = populationByCode.get(card.printed_set_code) ?? [];
    bucket.push(card.id);
    populationByCode.set(card.printed_set_code, bucket);
  }
  const baselineTotal = [...populationByCode.values()].reduce((s, l) => s + l.length, 0);
  console.log(
    `Population: ${cards.length} en cards -> ${baselineTotal} baseline across ${populationByCode.size} codes ` +
      `(${excluded} excluded, ${dupImageIds} dup image ids dropped, ${nullImageIds} null image ids skipped)`
  );

  // ---- price_history series (everything at or before the writer cutoff) ----
  console.log(`Fetching price_history (recorded_at <= ${writerCapturedAt})…`);
  const historyRows = await fetchPriceHistory(game.id, writerCapturedAt);
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

  // ==== GATE 2 — history-basis recon of TODAY vs the writer's stats basis ====
  console.log(`\n## Gate 2 — baseline recon @ writer cutoff vs writer price_stats values\n`);
  const todayRecon = reconstruct(writerCutoffMs, populationByCode, seriesByCard);

  const anchors = new Map(); // code -> { factor }
  const emptyCodes = []; // baseline-empty, set EXISTS in catalog -> zero rows
  const skippedCodes = []; // { code, reason } — never written on any date
  const gateEntries = [];
  const gateTable = [];
  for (const writer of writerRows) {
    const code = writer.entity_key;
    const writerValue = Number(writer.index_value);
    const recon = todayRecon.get(code);
    const currentCardsAnyClass = totalCardsByCode.get(code) ?? 0;
    const v1Row = v1Latest.get(code);

    if (!populationByCode.has(code)) {
      // Baseline population is empty for this code.
      if (currentCardsAnyClass === 0 && (v1Row?.card_count ?? 0) > 0) {
        // Catalog-deleted (OP16): the set demonstrably had cards, the current
        // catalog has none — the baseline population cannot be reconstructed
        // for any date. The writer's zero row for TODAY stands (go-forward
        // honest); history gets no fabricated zeros.
        skippedCodes.push({ code, reason: "catalog-deleted — baseline population unreconstructable" });
        gateTable.push([code, writerValue.toFixed(2), "—", "—", "SKIP: catalog-deleted"]);
        continue;
      }
      // Genuinely empty (ST29/ST30) or 100%-promo (P): baseline is honestly
      // zero on every date — mirror the writer's zero-row semantics.
      const matched = writerValue === 0;
      emptyCodes.push(code);
      gateTable.push([code, writerValue.toFixed(2), "0.00", matched ? "matched" : "MISMATCH", "empty baseline — zero rows mirrored"]);
      if (!matched) throw new Error(`${code}: writer row is non-zero but baseline population is empty — inconsistent.`);
      continue;
    }

    if (!recon || recon.priced === 0 || recon.sum <= 0) {
      skippedCodes.push({ code, reason: "no priced baseline cards in history at the writer cutoff — anchor uncomputable" });
      gateTable.push([code, writerValue.toFixed(2), "—", "—", "SKIP: no history recon"]);
      continue;
    }
    if (writerValue <= 0) {
      skippedCodes.push({ code, reason: "writer value is 0 but history recon is non-zero — inconsistent, not writable" });
      gateTable.push([code, writerValue.toFixed(2), recon.sum.toFixed(2), "—", "SKIP: writer zero vs recon non-zero"]);
      continue;
    }
    const deltaPct = ((recon.sum - writerValue) / writerValue) * 100;
    gateEntries.push({ code, deltaPct });
    anchors.set(code, { factor: writerValue / recon.sum });
    gateTable.push([code, writerValue.toFixed(2), recon.sum.toFixed(2), fmtPct(deltaPct), "comparable"]);
  }
  console.log(mdTable(["set", "writer (price_stats)", "recon (price_history)", "Δ", "class"], gateTable));

  const abs = gateEntries.map((e) => Math.abs(e.deltaPct));
  const med = median(abs);
  const worst = Math.max(...abs);
  const worstCode = gateEntries.find((e) => Math.abs(e.deltaPct) === worst)?.code;
  console.log(
    `\nComparable sets: ${gateEntries.length} · median |Δ| ${med.toFixed(2)}% (gate ${GATE2_MEDIAN_PCT}%) · ` +
      `worst |Δ| ${worst.toFixed(2)}% (${worstCode}, gate ${GATE2_WORST_PCT}%)`
  );
  if (med > GATE2_MEDIAN_PCT || worst > GATE2_WORST_PCT) {
    console.error(
      `\nGATE 2 FAILED — history-basis baseline recon does not track the stats basis within ` +
        `${GATE2_MEDIAN_PCT}%/${GATE2_WORST_PCT}%. Refusing to backfill. The writer and the chip ` +
        `revival proceed on go-forward data only; document the failure in docs/investigations/set-value-v2.md.`
    );
    process.exit(1);
  }
  console.log(`\nGATE 2 PASSED.`);

  // ==== Backfill preview — anchored values at each date's own cutoff ====
  console.log(`\n## Backfill preview — staleness gate ${STALENESS_GATE_DAYS}d, chg_* NULL, ON CONFLICT DO NOTHING\n`);
  const rowsToWrite = [];
  const skips = [];
  const weekSummaries = [];
  const writerCodes = writerRows.map((r) => r.entity_key);

  for (const snapshotDate of backfillDates) {
    const cutoffMs = cutoffByDate.get(snapshotDate);
    const recon = reconstruct(cutoffMs, populationByCode, seriesByCard);
    let written = 0;
    const p50s = [];

    for (const code of [...writerCodes].sort()) {
      const set = setByCode.get(code);
      if (!set) {
        skips.push({ week: snapshotDate, code, reason: "code does not resolve in sets" });
        continue;
      }
      const skipEntry = skippedCodes.find((s) => s.code === code);
      if (skipEntry) {
        skips.push({ week: snapshotDate, code, reason: skipEntry.reason });
        continue;
      }
      const baseRow = {
        game_id: game.id,
        entity_type: ENTITY_TYPE,
        entity_key: code,
        character_id: null,
        set_id: set.id,
        rarity_id: null,
        entity_slug: set.slug,
        entity_code: set.code,
        entity_name: set.name,
        snapshot_date: snapshotDate,
        chg_7d: null, // unreconstructable for past dates — v1 backfill policy
        chg_30d: null,
        price_basis: PRICE_BASIS,
        metric_version: METRIC_VERSION,
        captured_at: runStartedAt, // honest provenance: when the backfill ran
        region: REGION,
      };
      if (emptyCodes.includes(code)) {
        written += 1;
        rowsToWrite.push({ ...baseRow, index_value: 0, card_count: 0, priced_count: 0 });
        continue;
      }
      const anchor = anchors.get(code);
      const r = recon.get(code);
      if (!anchor) {
        skips.push({ week: snapshotDate, code, reason: "no anchor factor" });
        continue;
      }
      if (!r || r.priced === 0) {
        skips.push({ week: snapshotDate, code, reason: "no priced baseline cards at cutoff" });
        continue;
      }
      if (r.p50Staleness > STALENESS_GATE_DAYS) {
        skips.push({ week: snapshotDate, code, reason: `median staleness ${r.p50Staleness.toFixed(1)}d > ${STALENESS_GATE_DAYS}d` });
        continue;
      }
      p50s.push(r.p50Staleness);
      written += 1;
      rowsToWrite.push({
        ...baseRow,
        index_value: round2(anchor.factor * r.sum), // anchored — disclosed doc-level
        card_count: r.cardCount,
        priced_count: r.priced,
      });
    }
    weekSummaries.push({
      week: snapshotDate,
      cutoff: new Date(cutoffMs).toISOString(),
      written,
      p50Range: p50s.length
        ? `${Math.min(...p50s).toFixed(1)}–${Math.max(...p50s).toFixed(1)}d (med ${median(p50s).toFixed(1)}d)`
        : "—",
    });
  }

  console.log(mdTable(
    ["snapshot_date", "cutoff", "sets to write", "per-set p50 staleness range"],
    weekSummaries.map((w) => [w.week, w.cutoff, w.written, w.p50Range])
  ));
  console.log(`\nAnchored sets: ${anchors.size} · empty (zeros): ${emptyCodes.length} [${emptyCodes.join(", ")}] · never written: ${skippedCodes.map((s) => s.code).join(", ") || "none"}`);
  console.log(`Total rows to write: ${rowsToWrite.length} · skips: ${skips.length}`);
  if (skips.length) {
    console.log("\n### Skips\n");
    console.log(mdTable(["week", "set", "reason"], skips.map((s) => [s.week, s.code, s.reason])));
  }

  // ---- Row counts per snapshot_date (before) ----
  const countDates = [...backfillDates, anchorDate];
  async function snapshotCounts(label) {
    const counts = [];
    for (const date of countDates) {
      counts.push([date, await sbCount(`market_index_snapshots?entity_type=eq.${ENTITY_TYPE}&snapshot_date=eq.${date}`)]);
    }
    const total = await sbCount(`market_index_snapshots?entity_type=eq.${ENTITY_TYPE}`);
    console.log(`\n### entity_type='${ENTITY_TYPE}' row counts — ${label}\n`);
    console.log(mdTable(["snapshot_date", "rows"], counts));
    console.log(`Total ${ENTITY_TYPE} rows: ${total}`);
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
    if (!res.ok) throw new Error(`Write chunk failed: ${res.status} ${await res.text()}`);
  }

  const after = await snapshotCounts("AFTER");
  console.log(`\nDone. Total ${ENTITY_TYPE} rows: ${before.total} -> ${after.total} (+${after.total - before.total}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
