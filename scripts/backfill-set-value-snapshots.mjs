// Moon Terminal Phase C5 (decision D3) — set-value snapshot backfill.
// ANCHORED METHOD (option 2 in docs/investigations/set-value-backfill.md §4),
// approved 2026-07-27 after the direct-sum method failed its regression gate.
//
// Why anchoring: the stored snapshots sum `price_stats.tcg_market` while any
// reconstruction can only sum `price_history.tcg_market`, and the two pipelines
// disagree 5–700x on a class of promo/prize cards (see the investigation doc
// §3). The raw deltas are therefore NOT noise and cannot pass a raw gate.
// Chain-linking scales each set's weekly reconstruction by a per-set
//   anchor_factor = stored_index_value(2026-07-23) / reconstructed(2026-07-23)
// computed at the stored capture's exact cutoff, so constant pipeline offsets
// cancel and the series is exact at the anchor.
//
// Safety model:
//   1. MANDATORY OUT-OF-SAMPLE GATE. pg_cron wrote a second stored batch on
//      2026-07-26 (Sunday 23:40 UTC) that postdates the method design. Before
//      any write, the anchored prediction for 2026-07-26 (anchor factors from
//      07-23, reconstruction at the 07-26 cutoff) is compared per-set against
//      the STORED 07-26 rows. Writes proceed only if median |Δ| <= 2% and
//      worst |Δ| <= 10% across comparable sets. Sets whose card population
//      churned between the stored dates may be excluded only with the reason
//      printed and recorded; if the gate still fails, the script exits
//      non-zero and writes nothing.
//   2. Writes are POST ... on_conflict=(natural key) with
//      Prefer: resolution=ignore-duplicates — ON CONFLICT DO NOTHING. Stored
//      rows (2026-07-23, 2026-07-26) are never modified; re-runs are no-ops.
//   3. chg_7d / chg_30d are written as NULL on every backfilled row. The live
//      columns are defined (column comments) as aggregates of *current
//      card-level provider statistics at capture time*, which do not exist for
//      past dates and cannot be reconstructed honestly.
//   4. Per-set handling mandated by the investigation doc: OP16 is skipped
//      (catalog-deleted; anchor uncomputable). Artifact code "N" is excluded.
//      ST29/ST30 are stored as zero rows — matching zero rows are written for
//      backfilled weeks (mirrors cron semantics), classified 'empty'.
//   5. The anchored values are not direct sums. Disclosure is doc-level: the
//      method, anchor factors and affected rows are recorded in
//      docs/investigations/set-value-backfill.md (schema has no field for it).
//
// Dry run (both gates + full preview, no writes):
//   node scripts/backfill-set-value-snapshots.mjs
//
// Write (gates, then upsert):
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

// Anchor snapshot: the manually-invoked 2026-07-23 capture. Its exact
// captured_at (09:45:14 UTC) is the reconstruction cutoff for anchor factors.
const ANCHOR_SNAPSHOT_DATE = "2026-07-23";

// Out-of-sample validation snapshot: written by pg_cron on Sunday 2026-07-26
// 23:40 UTC — it postdates the method design, making it a genuine
// out-of-sample target. Gate thresholds per the approved brief.
const VALIDATION_SNAPSHOT_DATE = "2026-07-26";
const OOS_MEDIAN_GATE_PCT = 2.0;
const OOS_WORST_GATE_PCT = 10.0;

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

function fmtPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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

async function fetchStoredSetRows(gameId, snapshotDate) {
  const rows = await sbFetchAll(
    `market_index_snapshots?select=entity_key,set_id,entity_slug,entity_code,entity_name,` +
      `index_value,card_count,priced_count,chg_7d,chg_30d,captured_at,region` +
      `&game_id=eq.${encodeURIComponent(gameId)}&entity_type=eq.set` +
      `&snapshot_date=eq.${snapshotDate}&order=entity_key.asc`
  );
  if (rows.length === 0) {
    throw new Error(`No stored entity_type='set' rows on ${snapshotDate} — cannot proceed.`);
  }
  const capturedAts = new Set(rows.map((row) => row.captured_at));
  if (capturedAts.size !== 1) {
    throw new Error(
      `Stored ${snapshotDate} rows carry ${capturedAts.size} distinct captured_at values — expected 1. Stopping.`
    );
  }
  return { rows, capturedAt: rows[0].captured_at };
}

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log(`# Set-value snapshot backfill (ANCHORED) — ${WRITE ? "WRITE" : "DRY RUN"} — ${runStartedAt}\n`);

  // ---- Game ----
  const [game] = await sbFetchAll(
    `games?select=id,slug&slug=eq.${encodeURIComponent(ONE_PIECE_DB_SLUG)}`
  );
  if (!game?.id) throw new Error("One Piece game row is missing.");

  // ---- Stored snapshots: anchor (07-23) and out-of-sample validation (07-26) ----
  const anchorStored = await fetchStoredSetRows(game.id, ANCHOR_SNAPSHOT_DATE);
  const valStored = await fetchStoredSetRows(game.id, VALIDATION_SNAPSHOT_DATE);
  const anchorCutoffMs = Date.parse(anchorStored.capturedAt);
  const valCutoffMs = Date.parse(valStored.capturedAt);
  console.log(`Anchor:     ${anchorStored.rows.length} stored set rows @ ${ANCHOR_SNAPSHOT_DATE}, captured_at ${anchorStored.capturedAt}`);
  console.log(`Validation: ${valStored.rows.length} stored set rows @ ${VALIDATION_SNAPSHOT_DATE}, captured_at ${valStored.capturedAt}`);
  const valByCode = new Map(valStored.rows.map((row) => [row.entity_key, row]));

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
  console.log(`Fetching price_history (game one_piece, recorded_at <= ${valStored.capturedAt})…`);
  const historyRows = await fetchPriceHistory(game.id, valStored.capturedAt);
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

  // ==== 1 · ANCHOR FACTORS — reconstruct 2026-07-23 at the stored cutoff ====
  console.log(`\n## Anchor factors — reconstruct ${ANCHOR_SNAPSHOT_DATE} @ ${anchorStored.capturedAt}\n`);
  const anchorRecon = reconstruct(anchorCutoffMs, populationByCode, seriesByCard);

  // Per-set classification:
  //   anchored — factor = stored / recon (recon has priced cards)
  //   empty    — stored zero row (ST29/ST30); mirrored as zero rows
  //   unanchorable — stored non-zero but nothing to reconstruct (OP16)
  const anchors = new Map(); // code -> { factor, storedRow, recon, rawDeltaPct }
  const emptyCodes = [];
  const unanchorable = []; // { code, reason }
  const anchorTable = [];
  for (const stored of anchorStored.rows) {
    const recon = anchorRecon.get(stored.entity_key);
    if (stored.card_count === 0 && Number(stored.index_value) === 0) {
      emptyCodes.push(stored.entity_key);
      anchorTable.push([stored.entity_key, "0.00", "0.00", "—", "—", "empty (stored zero row — mirrored)"]);
      continue;
    }
    if (!recon || recon.priced === 0 || recon.sum <= 0) {
      const reason = recon
        ? "no priced cards in reconstruction"
        : "printed_set_code absent from current catalog (catalog-deleted)";
      unanchorable.push({ code: stored.entity_key, reason: `${reason} — anchor uncomputable` });
      anchorTable.push([stored.entity_key, Number(stored.index_value).toFixed(2), "—", "—", "—", `SKIP: ${reason}`]);
      continue;
    }
    const factor = Number(stored.index_value) / recon.sum;
    const rawDeltaPct = ((recon.sum - stored.index_value) / stored.index_value) * 100;
    anchors.set(stored.entity_key, { factor, storedRow: stored, recon, rawDeltaPct });
    anchorTable.push([
      stored.entity_key,
      Number(stored.index_value).toFixed(2),
      recon.sum.toFixed(2),
      fmtPct(rawDeltaPct),
      factor.toFixed(6),
      "anchored",
    ]);
  }
  console.log(mdTable(
    ["set", "stored 07-23", "recon 07-23", "raw Δ", "anchor factor", "class"],
    anchorTable
  ));
  console.log(
    `\nAnchored: ${anchors.size} · empty (zero rows mirrored): ${emptyCodes.length} [${emptyCodes.join(", ")}] · ` +
      `unanchorable (skipped): ${unanchorable.length} [${unanchorable.map((u) => u.code).join(", ")}]`
  );

  // ==== 2 · MANDATORY OUT-OF-SAMPLE GATE — predict 2026-07-26, compare stored ====
  console.log(`\n## Out-of-sample gate — anchored prediction of ${VALIDATION_SNAPSHOT_DATE} @ ${valStored.capturedAt}\n`);
  const valRecon = reconstruct(valCutoffMs, populationByCode, seriesByCard);

  const oosEntries = []; // comparable: { code, stored, predicted, deltaPct, churn }
  const oosTable = [];
  for (const stored of valStored.rows) {
    const code = stored.entity_key;
    const storedValue = Number(stored.index_value);
    if (emptyCodes.includes(code)) {
      const matched = storedValue === 0;
      oosTable.push([code, storedValue.toFixed(2), "0.00", matched ? "matched" : "MISMATCH", "—", "empty"]);
      if (!matched) {
        unanchorable.push({ code, reason: `stored ${VALIDATION_SNAPSHOT_DATE} row is non-zero but ${ANCHOR_SNAPSHOT_DATE} was a zero row — inconsistent` });
      }
      continue;
    }
    const anchor = anchors.get(code);
    if (!anchor) {
      oosTable.push([code, storedValue.toFixed(2), "—", "—", "—", "excluded: anchor uncomputable"]);
      continue;
    }
    const recon = valRecon.get(code);
    if (!recon || recon.priced === 0) {
      oosTable.push([code, storedValue.toFixed(2), "—", "—", "—", "excluded: no reconstruction at validation cutoff"]);
      unanchorable.push({ code, reason: "anchored but unreconstructable at validation cutoff — cannot validate" });
      anchors.delete(code);
      continue;
    }
    const predicted = anchor.factor * recon.sum;
    const deltaPct = storedValue === 0 ? null : ((predicted - storedValue) / storedValue) * 100;
    // Catalog churn between the stored batches' basis and today's catalog:
    // the stored batches agree with each other; churn shows as a
    // reconstruction population that no longer matches the stored card_count.
    const churn = recon.cardCount !== stored.card_count;
    oosEntries.push({ code, stored: storedValue, predicted, deltaPct, churn });
    oosTable.push([
      code,
      storedValue.toFixed(2),
      predicted.toFixed(2),
      deltaPct == null ? "—" : fmtPct(deltaPct),
      churn ? `YES (${stored.card_count}→${recon.cardCount})` : "no",
      "comparable",
    ]);
  }
  // Stored 07-26 codes absent from 07-23 (would be new sets / artifacts).
  for (const stored of valStored.rows) {
    if (!anchorStored.rows.some((a) => a.entity_key === stored.entity_key)) {
      oosTable.push([stored.entity_key, Number(stored.index_value).toFixed(2), "—", "—", "—", "excluded: not in anchor snapshot"]);
    }
  }
  console.log(mdTable(
    ["set", "stored 07-26", "anchored prediction", "Δ", "population churn", "class"],
    oosTable
  ));

  const stats = (entries) => {
    const abs = entries.map((e) => Math.abs(e.deltaPct));
    return { median: median(abs), worst: Math.max(...abs), n: entries.length };
  };
  let gateEntries = oosEntries.filter((e) => e.deltaPct != null);
  let excludedFromGate = [];
  let s = stats(gateEntries);
  let gatePassed = s.median <= OOS_MEDIAN_GATE_PCT && s.worst <= OOS_WORST_GATE_PCT;
  console.log(
    `\nComparable sets: ${s.n} · median |Δ| ${s.median.toFixed(2)}% (gate ${OOS_MEDIAN_GATE_PCT}%) · ` +
      `worst |Δ| ${s.worst.toFixed(2)}% (gate ${OOS_WORST_GATE_PCT}%)`
  );
  if (!gatePassed) {
    // The brief permits excluding catalog-churned sets, with documented
    // reason, and only them. Exclude the minimal set: churned sets breaching
    // the worst gate. Excluded sets are also excluded from writes — their
    // anchors failed out-of-sample validation.
    const breaching = gateEntries.filter((e) => Math.abs(e.deltaPct) > OOS_WORST_GATE_PCT);
    if (breaching.length > 0 && breaching.every((e) => e.churn)) {
      excludedFromGate = breaching;
      gateEntries = gateEntries.filter((e) => !breaching.includes(e));
      s = stats(gateEntries);
      gatePassed = s.median <= OOS_MEDIAN_GATE_PCT && s.worst <= OOS_WORST_GATE_PCT;
      for (const e of excludedFromGate) {
        const reason = `catalog churn between stored basis and current catalog — out-of-sample |Δ| ${Math.abs(e.deltaPct).toFixed(2)}% > ${OOS_WORST_GATE_PCT}%; excluded from gate AND from writes`;
        console.log(`Excluding ${e.code}: ${reason}`);
        unanchorable.push({ code: e.code, reason });
        anchors.delete(e.code);
      }
      console.log(
        `After exclusions: ${s.n} sets · median |Δ| ${s.median.toFixed(2)}% · worst |Δ| ${s.worst.toFixed(2)}%`
      );
    }
  }
  if (!gatePassed) {
    console.error(
      `\nOUT-OF-SAMPLE GATE FAILED (median |Δ| ${s.median.toFixed(2)}% vs ${OOS_MEDIAN_GATE_PCT}%, ` +
        `worst |Δ| ${s.worst.toFixed(2)}% vs ${OOS_WORST_GATE_PCT}%). Refusing to write.`
    );
    process.exit(1);
  }
  console.log(`\nOUT-OF-SAMPLE GATE PASSED.`);

  // ==== 3 · BACKFILL — five Sundays at the cron cutoff, anchored values ====
  console.log(`\n## Backfill preview — cutoff ${CRON_CUTOFF_TIME.slice(1, 6)} UTC, staleness gate ${STALENESS_GATE_DAYS}d\n`);
  const rowsToWrite = [];
  const skips = [];
  const weekSummaries = [];
  const anchorCodes = [...anchors.keys()];
  const allStoredCodes = anchorStored.rows.map((row) => row.entity_key);

  for (const snapshotDate of BACKFILL_DATES) {
    const cutoffMs = Date.parse(`${snapshotDate}${CRON_CUTOFF_TIME}`);
    const recon = reconstruct(cutoffMs, populationByCode, seriesByCard);
    let written = 0;
    const p50s = [];

    for (const code of [...allStoredCodes].sort()) {
      const set = setByCode.get(code);
      const skipEntry = unanchorable.find((u) => u.code === code);
      if (skipEntry) {
        skips.push({ week: snapshotDate, code, reason: skipEntry.reason });
        continue;
      }
      if (!set) {
        skips.push({ week: snapshotDate, code, reason: "printed_set_code does not resolve in sets" });
        continue;
      }
      const baseRow = {
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
        chg_7d: null, // unreconstructable: column = current provider stats at capture time
        chg_30d: null,
        price_basis: PRICE_BASIS,
        metric_version: METRIC_VERSION,
        captured_at: runStartedAt, // honest: when this backfill actually ran
        region: REGION,
      };
      if (emptyCodes.includes(code)) {
        // Stored as zero rows on both stored dates — mirror cron semantics.
        written += 1;
        rowsToWrite.push({ ...baseRow, index_value: 0, card_count: 0, priced_count: 0 });
        continue;
      }
      const anchor = anchors.get(code);
      const r = recon.get(code);
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
        ...baseRow,
        index_value: round2(anchor.factor * r.sum), // anchored — NOT a direct sum; disclosed doc-level
        card_count: r.cardCount,
        priced_count: r.priced,
      });
    }
    // Codes with prices this week but outside the validated stored codes —
    // never written. Includes the "N" catalog artifact.
    for (const [code, r] of recon) {
      if (!allStoredCodes.includes(code) && r.priced > 0) {
        const artifact = code === "N" ? " (known catalog re-parse artifact)" : "";
        skips.push({ week: snapshotDate, code, reason: `outside the ${allStoredCodes.length} stored codes — excluded${artifact}` });
      }
    }
    weekSummaries.push({ week: snapshotDate, written, p50Range: p50s.length ? `${Math.min(...p50s).toFixed(1)}–${Math.max(...p50s).toFixed(1)}d (med ${median(p50s).toFixed(1)}d)` : "—" });
  }

  console.log(mdTable(
    ["week (snapshot_date)", "sets to write", "per-set p50 staleness range"],
    weekSummaries.map((w) => [w.week, w.written, w.p50Range])
  ));
  console.log(`\nAnchored sets written per clean week: ${anchorCodes.length} + ${emptyCodes.length} empty`);
  console.log(`Total rows to write: ${rowsToWrite.length} · skips: ${skips.length}`);
  if (skips.length) {
    console.log("\n### Skips\n");
    console.log(mdTable(["week", "set", "reason"], skips.map((s) => [s.week, s.code, s.reason])));
  }

  // ---- Row counts per snapshot_date (before) ----
  const countDates = [...BACKFILL_DATES, ANCHOR_SNAPSHOT_DATE, VALIDATION_SNAPSHOT_DATE];
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
