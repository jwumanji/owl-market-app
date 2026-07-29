import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { classifyBoosterBaseline } from "@/lib/games/one-piece/booster-baseline";
import { firstRelation } from "@/lib/supabase-relations";

// Full run = ~6 pages of cards + one ~53-row upsert; measured well under a
// minute locally. 120 leaves headroom for a slow cold DB.
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// GET|POST /api/sync/set-baseline?game=one_piece
//
// Set-value v2 writer — the BOOSTER-BASELINE set-value series
// (entity_type='set_baseline', metric_version=2 in market_index_snapshots).
//
// WHY A SECOND SERIES. The official entity_type='set' series (pg_cron job 1,
// capture_market_index_snapshots) sums the FULL printed_set_code population —
// 45.5% of the One Piece index is promo/event paper, which distorts every
// cross-set Value Ratio comparison (docs/investigations/
// value-ratio-population-audit.md). This route writes the parallel series that
// sums ONLY the booster-baseline population — the shared classifier in
// @/lib/games/one-piece/booster-baseline (never re-implemented, per its
// header). Value Ratio surfaces read THIS series; standalone SET VALUE
// surfaces stay on entity_type='set'. The two figures are not comparable.
//
// SEMANTICS (mirrors the v1 capture where honest, documented where not):
//   - Population per set: cards grouped on printed_set_code, region='en',
//     deduped on card_image_id (max-priced row kept), filtered through
//     classifyBoosterBaseline(). Cards with a null card_image_id cannot be
//     classified or deduped and are skipped (0 exist today; counted in the
//     response if that changes).
//   - Price basis: price_stats.tcg_market, prices > 0 — identical to Box EV
//     and to what capture_market_index_snapshots sums.
//   - One row per `sets` row of the game (matched on sets.code =
//     printed_set_code). Sets with no baseline cards get honest zero rows —
//     mirrors the v1 capture's ST29/ST30 behavior. Population codes that do
//     not resolve in `sets` (e.g. the "N" catalog re-parse artifact) are
//     skipped and reported.
//   - card_count = baseline population size (priced or not);
//     priced_count = baseline cards with tcg_market > 0. These are
//     BASELINE-population counts, intentionally smaller than the v1 rows'
//     full-population counts.
//   - chg_7d / chg_30d: computed ONLY from prior v2 rows — the latest
//     set_baseline row at or before snapshot_date − 7/30 days (carry-forward,
//     matching how consumers read the series). Null when no prior v2 point
//     exists or the prior value is 0. NOTE: this is index-over-index change,
//     NOT the v1 columns' "aggregate of current provider card stats" —
//     documented here and in docs/investigations/set-value-v2.md.
//   - snapshot_date = current UTC date; captured_at = run time; region='en';
//     price_basis='tcg_market'; metric_version=2; set_id always resolved
//     (market_index_snapshots_entity_reference_check requires the set branch).
//   - Upsert ON CONFLICT (game_id, entity_type, entity_key, snapshot_date)
//     DO UPDATE — a same-day re-run refreshes with newer stats; idempotent on
//     the natural key like the v1 capture.
//
// Scheduled Sundays 23:50 UTC (config/game-sync-jobs.json
// one_piece.internal.set_baseline) — 10 minutes after pg_cron's v1 capture so
// the two weekly points land on the same snapshot_date.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;
const ENTITY_TYPE = "set_baseline";
const METRIC_VERSION = 2;
const REGION = "en";
const PRICE_BASIS = "tcg_market";
const CONFLICT_KEY = "game_id,entity_type,entity_key,snapshot_date";
const DAY_MS = 86_400_000;

interface SetRow {
  id: string;
  code: string | null;
  slug: string | null;
  name: string | null;
}

interface CardQueryRow {
  card_image_id: string | null;
  printed_set_code: string | null;
  name: string | null;
  rarity: string | null;
  price_stats:
    | { tcg_market: number | null }
    | Array<{ tcg_market: number | null }>
    | null;
}

interface BaselineCard {
  imageId: string;
  code: string;
  price: number | null; // tcg_market > 0, else null
}

interface PriorPoint {
  day: number;
  value: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Latest prior point at or before `day` (carry-forward); points sorted asc. */
function asOf(points: PriorPoint[] | undefined, day: number): number | null {
  if (!points) return null;
  let found: number | null = null;
  for (const p of points) {
    if (p.day > day) break;
    found = p.value;
  }
  return found;
}

function pctChange(current: number, prior: number | null): number | null {
  if (prior == null || prior === 0) return null;
  return round2(((current - prior) / prior) * 100);
}

async function syncSetBaseline(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  const isAuthorized =
    request.headers.get("authorization") === `Bearer ${cronSecret}` ||
    searchParams.get("secret") === cronSecret;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // Requires ?game=… and rejects anything that isn't one_piece — the
  // booster-baseline classifier is a One Piece population rule.
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json(
      { error: gameResult.error.message },
      { status: gameResult.error.status }
    );
  }
  const { game } = gameResult;

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  try {
    // 1. Sets of this game — one output row per set with a code (v1 parity:
    // empty sets emit zero rows).
    const sets: SetRow[] = [];
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("sets")
          .select("id, code, slug, name")
          .eq("game_id", game.id)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`sets: ${error.message}`);
        if (!data || data.length === 0) break;
        sets.push(...(data as SetRow[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
    const setByCode = new Map<string, SetRow>();
    for (const s of sets) {
      if (s.code) setByCode.set(s.code, s);
    }

    // 2. Cards + current price_stats — the live stats basis.
    const byImageId = new Map<string, BaselineCard & { name: string | null; rarity: string | null }>();
    let nullImageIds = 0;
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("cards")
          .select(
            `
            card_image_id,
            printed_set_code,
            name,
            rarity,
            price_stats!price_stats_card_game_fk ( tcg_market )
          `
          )
          .eq("game_id", game.id)
          .eq("region", REGION)
          .not("printed_set_code", "is", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`cards: ${error.message}`);
        if (!data || data.length === 0) break;

        for (const raw of data as unknown as CardQueryRow[]) {
          if (!raw.card_image_id || !raw.printed_set_code) {
            if (!raw.card_image_id) nullImageIds += 1;
            continue;
          }
          const ps = firstRelation(raw.price_stats);
          const price =
            ps?.tcg_market != null && ps.tcg_market > 0 ? ps.tcg_market : null;
          const cur = byImageId.get(raw.card_image_id);
          // Dedupe on card_image_id, max-priced row kept (audit parity).
          if (!cur || (price ?? -1) > (cur.price ?? -1)) {
            byImageId.set(raw.card_image_id, {
              imageId: raw.card_image_id,
              code: raw.printed_set_code,
              price,
              name: raw.name,
              rarity: raw.rarity,
            });
          }
        }

        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 3. Classify — ONE rule, the shared module.
    let excludedCards = 0;
    const baselineByCode = new Map<string, BaselineCard[]>();
    for (const card of byImageId.values()) {
      const verdict = classifyBoosterBaseline({
        cardImageId: card.imageId,
        name: card.name,
        rarity: card.rarity,
      });
      if (!verdict.included) {
        excludedCards += 1;
        continue;
      }
      const bucket = baselineByCode.get(card.code) ?? [];
      bucket.push(card);
      baselineByCode.set(card.code, bucket);
    }

    // 4. Prior v2 points for chg_7d / chg_30d — strictly before today.
    const priorByKey = new Map<string, PriorPoint[]>();
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("market_index_snapshots")
          .select("entity_key, snapshot_date, index_value")
          .eq("game_id", game.id)
          .eq("entity_type", ENTITY_TYPE)
          .eq("region", REGION)
          .lt("snapshot_date", snapshotDate)
          .order("snapshot_date", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`prior v2 rows: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const row of data as Array<{
          entity_key: string;
          snapshot_date: string;
          index_value: number | null;
        }>) {
          if (row.index_value == null) continue;
          const list = priorByKey.get(row.entity_key) ?? [];
          list.push({
            day: Date.parse(`${row.snapshot_date}T00:00:00Z`),
            value: row.index_value,
          });
          priorByKey.set(row.entity_key, list);
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
    const today = Date.parse(`${snapshotDate}T00:00:00Z`);

    // 5. Compose rows — one per set code; zero rows for empty sets.
    const rows: Record<string, unknown>[] = [];
    let zeroRowSets = 0;
    for (const set of sets) {
      if (!set.code) continue;
      const cards = baselineByCode.get(set.code) ?? [];
      const priced = cards.filter(
        (c): c is BaselineCard & { price: number } => c.price != null
      );
      const indexValue = round2(priced.reduce((s, c) => s + c.price, 0));
      if (cards.length === 0) zeroRowSets += 1;
      const prior = priorByKey.get(set.code);
      rows.push({
        game_id: game.id,
        entity_type: ENTITY_TYPE,
        entity_key: set.code,
        character_id: null,
        set_id: set.id,
        rarity_id: null,
        entity_slug: set.slug,
        entity_code: set.code,
        entity_name: set.name,
        snapshot_date: snapshotDate,
        index_value: indexValue,
        card_count: cards.length,
        priced_count: priced.length,
        chg_7d: pctChange(indexValue, asOf(prior, today - 7 * DAY_MS)),
        chg_30d: pctChange(indexValue, asOf(prior, today - 30 * DAY_MS)),
        price_basis: PRICE_BASIS,
        metric_version: METRIC_VERSION,
        captured_at: capturedAt,
        region: REGION,
      });
    }

    // Population codes that do not resolve in sets — skipped, reported.
    const skippedCodes = [...baselineByCode.keys()].filter((c) => !setByCode.has(c));

    // 6. Upsert on the natural key — same-day re-runs refresh.
    const { error: upsertError } = await supabase
      .from("market_index_snapshots")
      .upsert(rows, { onConflict: CONFLICT_KEY });
    if (upsertError) throw new Error(`upsert: ${upsertError.message}`);

    const { count: todayCount, error: countError } = await supabase
      .from("market_index_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id)
      .eq("entity_type", ENTITY_TYPE)
      .eq("snapshot_date", snapshotDate);
    if (countError) throw new Error(`count: ${countError.message}`);

    const baselineCardCount = [...baselineByCode.values()].reduce(
      (s, list) => s + list.length,
      0
    );
    const indexTotal = round2(
      rows.reduce((s, r) => s + (r.index_value as number), 0)
    );

    return NextResponse.json({
      game: game.slug,
      entityType: ENTITY_TYPE,
      metricVersion: METRIC_VERSION,
      snapshotDate,
      capturedAt,
      setsInCatalog: sets.length,
      rowsUpserted: rows.length,
      rowsForDateAfter: todayCount,
      zeroRowSets,
      dedupedCards: byImageId.size,
      nullImageIds,
      baselineCards: baselineCardCount,
      excludedCards,
      indexTotal,
      skippedCodes,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        game: game.slug,
        entityType: ENTITY_TYPE,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

export { syncSetBaseline as GET, syncSetBaseline as POST };
