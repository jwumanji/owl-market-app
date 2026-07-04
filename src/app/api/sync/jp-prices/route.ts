import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchViaScrapfly } from "@/lib/scrapfly";
import {
  yuyuteiSetUrl,
  parseYuyuteiListing,
  parseYuyuteiSetList,
  isValidCardNumber,
  jpRarityBase,
  type YuyuteiRow,
} from "@/lib/yuyutei";
import { buildJpCardMatcher, type MatchCardRow } from "@/lib/jp-card-match";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Any set page carries the full vers[] set list, so we bootstrap discovery from
// one stable page and derive the whole set list from it (no hardcoded array).
const DISCOVERY_URL = yuyuteiSetUrl("op01");

const DEFAULT_SET_LIMIT = 2;
const MAX_SET_LIMIT = 6;
const CALL_DELAY_MS = 500;
const CURSOR_KEY = "jp_prices_sync_current";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((Math.floor(index) % total) + total) % total;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function prefixFromCardNumber(num: string): string | null {
  const s = String(num).toUpperCase();
  const m = s.match(/^([A-Z]+\d+)-/);
  if (m) return m[1];
  const p = s.match(/^([A-Z]+)-/);
  return p ? p[1] : null;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

interface CursorState {
  nextOffset?: number;
  totalSets?: number;
  completedCycles?: number;
  lastRunAt?: string;
  lastProcessed?: number;
  lastError?: string | null;
}

interface JpCardInsert {
  game_id: string;
  card_image_id: string;
  card_number: string;
  name: string;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  region: string;
  set_id: string | null;
  image_url: string | null;
  image_url_small: string | null;
  game_payload: unknown;
  image_mirror_status: string;
}

interface JpPriceUpsert {
  game_id: string;
  card_id: string | null;
  card_image_id: string | null;
  source: string;
  source_card_id: string;
  source_url: string;
  set_code: string;
  card_number: string;
  card_name: string;
  rarity: string;
  variant: string;
  price_jpy: number | null;
  in_stock: boolean;
  image_url: string | null;
  match_method: string;
  snapshot_date: string;
  raw: unknown;
}

function isRegionColumnMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error?.code === "PGRST204" || error?.message?.toLowerCase().includes("region"));
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error?.code === "42P01" || error?.message?.includes("jp_prices"));
}

async function readCursor(supabase: ServiceClient): Promise<{ state: CursorState; error?: string }> {
  const { data, error } = await supabase.from("sync_state").select("state").eq("key", CURSOR_KEY).maybeSingle();
  if (error) {
    const message = error.message ?? "sync_state read failed";
    if (error.code === "42P01" || message.includes("sync_state")) {
      return { state: {}, error: "Missing sync_state table. Run schema-migration-v15/v16 in Supabase." };
    }
    return { state: {}, error: message };
  }
  return { state: (data?.state ?? {}) as CursorState };
}

async function writeCursor(supabase: ServiceClient, state: CursorState): Promise<string | null> {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: CURSOR_KEY, state, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message ?? "sync_state write failed" : null;
}

async function loadAllCards(supabase: ServiceClient, gameId: string): Promise<MatchCardRow[]> {
  const all: MatchCardRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, card_image_id, card_number, name, variant_label, rarity")
      .eq("game_id", gameId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`loadAllCards: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as MatchCardRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function buildJpCard(row: YuyuteiRow, gameId: string, cardImageId: string, setId: string | null): JpCardInsert {
  const nameBase = row.name.replace(/\s*[（(][^）)]*[)）]\s*/g, " ").replace(/\s+/g, " ").trim();
  return {
    game_id: gameId,
    card_image_id: cardImageId,
    card_number: row.cardNumber,
    name: row.name,
    name_base: nameBase || null,
    variant_label: row.variantLabel || null,
    rarity: jpRarityBase(row.rarity) || null,
    region: "jp",
    set_id: setId,
    image_url: row.imageUrl,
    image_url_small: null,
    game_payload: { card: {} },
    image_mirror_status: "external",
  };
}

interface SetStat {
  code: string;
  parsed: number;
  matchedEn: number;
  jpCreated: number;
  jpPendingV45: number;
  unmatched: number;
  upserted: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// GET|POST /api/sync/jp-prices
//   ?limit=N    sets to process this run (default 2, max 6)
//   ?cursor=1   continue from the persisted cursor; advance & wrap at the end
//   ?reset=1    (cursor mode) restart at set index 0
//   ?offset=N   stateless one-shot at an explicit set index (ignored in cursor mode)
//   ?secret=…   or Authorization: Bearer <CRON_SECRET>
//
// Set list is auto-discovered from Yuyu-tei each run — new sets appear on their
// own. Yuyu-tei rows are matched to EN cards by (card_number, variantKey);
// valid-but-unmatched rows (incl. super-parallels / signed) become region='jp'
// cards. DON!! / numberless rows stay unmatched and are never auto-created.
// ---------------------------------------------------------------------------

async function syncJpPrices(request: Request) {
  const { searchParams } = new URL(request.url);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  const isAuthorized =
    request.headers.get("authorization") === `Bearer ${cronSecret}` ||
    searchParams.get("secret") === cronSecret;
  if (!isAuthorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.SCRAPFLY_API_KEY) {
    return NextResponse.json({ error: "SCRAPFLY_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // --- Auto-discovery: derive the full set list from Yuyu-tei this run. ---
  let discoveryHtml: string;
  try {
    discoveryHtml = await fetchViaScrapfly(DISCOVERY_URL, { asp: true, country: "jp" });
  } catch (err) {
    return NextResponse.json({ error: `discovery fetch: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  const discovered = parseYuyuteiSetList(discoveryHtml);
  const totalSets = discovered.length;
  if (totalSets === 0) {
    return NextResponse.json({ error: "Set discovery returned no codes (Yuyu-tei markup may have changed)." }, { status: 502 });
  }

  const limit = clampInt(searchParams.get("limit"), DEFAULT_SET_LIMIT, 1, MAX_SET_LIMIT);
  const cursorMode = searchParams.get("cursor") === "1";
  const reset = searchParams.get("reset") === "1";

  let startOffset: number;
  let cursorState: CursorState = {};
  if (cursorMode) {
    const cursor = await readCursor(supabase);
    if (cursor.error) return NextResponse.json({ error: cursor.error }, { status: 500 });
    cursorState = cursor.state;
    startOffset = reset ? 0 : normalizeIndex(cursorState.nextOffset ?? 0, totalSets);
  } else {
    startOffset = normalizeIndex(clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER), totalSets);
  }

  const setsToProcess = discovered.slice(startOffset, startOffset + limit);

  // Matcher (EN-only) + set-prefix → set_id map, built once.
  const matcher = buildJpCardMatcher(await loadAllCards(supabase, game.id));
  const { data: setsData } = await supabase.from("sets").select("id, code").eq("game_id", game.id);
  const prefixToSetId: Record<string, string> = {};
  for (const s of (setsData ?? []) as { id: string; code: string | null }[]) {
    if (s.code) prefixToSetId[s.code.toUpperCase()] = s.id;
  }

  const snapshotDate = todayUtc();
  const htmlCache: Record<string, string> = { [DISCOVERY_URL]: discoveryHtml };
  const errors: string[] = [];
  const perSet: SetStat[] = [];
  let regionMissing = false;
  let missingTable = false;

  for (let i = 0; i < setsToProcess.length; i++) {
    const code = setsToProcess[i];
    const stat: SetStat = { code, parsed: 0, matchedEn: 0, jpCreated: 0, jpPendingV45: 0, unmatched: 0, upserted: 0 };
    if (i > 0) await delay(CALL_DELAY_MS);

    try {
      const url = yuyuteiSetUrl(code);
      const html = htmlCache[url] ?? (await fetchViaScrapfly(url, { asp: true, country: "jp" }));
      const rows = parseYuyuteiListing(html);
      stat.parsed = rows.length;

      // Plan each row: EN match, JP-create, or unmatched.
      const plans: Array<{ row: YuyuteiRow; cardId: string | null; cardImageId: string | null; method: string; jpPending?: boolean }> = [];
      const jpInserts = new Map<string, JpCardInsert>();

      for (const row of rows) {
        if (!isValidCardNumber(row.cardNumber)) {
          plans.push({ row, cardId: null, cardImageId: null, method: "unmatched" });
          continue;
        }
        if (!row.jpExclusive) {
          const m = matcher.match(row.cardNumber, row.variant);
          if (m) {
            plans.push({ row, cardId: m.card.id, cardImageId: m.card.card_image_id, method: m.method });
            continue;
          }
        }
        // JP-exclusive: forced variant, or valid number with no EN match.
        const cid = row.sourceCardId.split("/")[1] ?? row.sourceCardId;
        const cardImageId = `${row.cardNumber}_jp_${cid}`;
        const prefix = prefixFromCardNumber(row.cardNumber);
        const setId = (prefix && prefixToSetId[prefix]) || null;
        jpInserts.set(cardImageId, buildJpCard(row, game.id, cardImageId, setId));
        plans.push({ row, cardId: null, cardImageId, method: "jp-created", jpPending: true });
      }

      // Create/refresh JP-exclusive cards, then resolve their ids onto the plans.
      if (jpInserts.size > 0 && !regionMissing) {
        const { data, error } = await supabase
          .from("cards")
          .upsert(Array.from(jpInserts.values()), { onConflict: "game_id,card_image_id" })
          .select("id, card_image_id");
        if (error) {
          if (isRegionColumnMissing(error)) {
            regionMissing = true;
            stat.error = "region column missing — apply schema-migration-v45";
          } else {
            stat.error = `jp card upsert: ${error.message}`;
            errors.push(`${code}: ${stat.error}`);
          }
        } else {
          const idByImg = new Map((data ?? []).map((c: { id: string; card_image_id: string }) => [c.card_image_id, c.id]));
          for (const p of plans) if (p.jpPending) p.cardId = idByImg.get(p.cardImageId!) ?? null;
        }
      }

      // Tally + build jp_prices rows (dedupe by source_card_id).
      const byId = new Map<string, JpPriceUpsert>();
      for (const p of plans) {
        if (p.method === "unmatched") stat.unmatched++;
        else if (p.method === "jp-created") {
          if (p.cardId) stat.jpCreated++;
          else stat.jpPendingV45++;
        } else stat.matchedEn++;

        const row = p.row;
        byId.set(row.sourceCardId, {
          game_id: game.id,
          card_id: p.cardId,
          card_image_id: p.cardImageId,
          source: "yuyutei",
          source_card_id: row.sourceCardId,
          source_url: row.sourceUrl,
          set_code: prefixFromCardNumber(row.cardNumber) ?? code.toUpperCase(),
          card_number: row.cardNumber,
          card_name: row.name,
          rarity: row.rarity,
          variant: row.variant,
          price_jpy: row.priceJpy,
          in_stock: row.inStock,
          image_url: row.imageUrl,
          match_method: p.method,
          snapshot_date: snapshotDate,
          raw: row,
        });
      }

      const priceRows = Array.from(byId.values());
      if (priceRows.length > 0 && !missingTable) {
        const { error: upErr } = await supabase
          .from("jp_prices")
          .upsert(priceRows, { onConflict: "source,source_card_id,snapshot_date" });
        if (upErr) {
          if (isMissingTableError(upErr)) {
            missingTable = true;
            stat.error = "jp_prices table missing — run schema-migration-v44";
          } else {
            stat.error = (stat.error ? stat.error + "; " : "") + upErr.message;
            errors.push(`${code}: ${upErr.message}`);
          }
        } else {
          stat.upserted = priceRows.length;
        }
      }
    } catch (err) {
      stat.error = err instanceof Error ? err.message : String(err);
      errors.push(`${code}: ${stat.error}`);
    }
    perSet.push(stat);
  }

  // Advance & persist the cursor (cursor mode only); wrap to 0 at the end.
  let nextOffset: number | null;
  let wrapped = false;
  let completedCycles = cursorState.completedCycles ?? 0;
  const processed = setsToProcess.length;
  if (cursorMode) {
    const advanced = startOffset + processed;
    wrapped = processed === 0 || advanced >= totalSets;
    nextOffset = wrapped ? 0 : advanced;
    if (wrapped) completedCycles += 1;
    const writeErr = await writeCursor(supabase, {
      nextOffset,
      totalSets,
      completedCycles,
      lastRunAt: new Date().toISOString(),
      lastProcessed: processed,
      lastError: errors[0] ?? null,
    });
    if (writeErr) errors.push(`cursor write: ${writeErr}`);
  } else {
    nextOffset = startOffset + processed < totalSets ? startOffset + processed : null;
  }

  const totals = perSet.reduce(
    (a, s) => ({
      parsed: a.parsed + s.parsed,
      matchedEn: a.matchedEn + s.matchedEn,
      jpCreated: a.jpCreated + s.jpCreated,
      jpPendingV45: a.jpPendingV45 + s.jpPendingV45,
      unmatched: a.unmatched + s.unmatched,
      upserted: a.upserted + s.upserted,
    }),
    { parsed: 0, matchedEn: 0, jpCreated: 0, jpPendingV45: 0, unmatched: 0, upserted: 0 }
  );

  return NextResponse.json({
    provider: "scrapfly-yuyutei",
    game: game.slug,
    mode: cursorMode ? "cursor" : "manual",
    snapshotDate,
    discoveredSets: totalSets,
    catalogCards: matcher.size,
    startOffset,
    limit,
    setsProcessed: setsToProcess,
    ...totals,
    nextOffset,
    wrapped,
    completedCycles,
    regionColumnMissing: regionMissing,
    missingTable,
    migrationHint: regionMissing
      ? "Apply schema-migration-v45-region-aware-cards.sql, then re-run to link JP-exclusive cards."
      : missingTable
        ? "Apply schema-migration-v44-jp-prices.sql."
        : undefined,
    errors: errors.length,
    errorSample: errors.slice(0, 8),
    perSet,
  });
}

export { syncJpPrices as GET, syncJpPrices as POST };
