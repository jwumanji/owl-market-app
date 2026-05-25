import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  ONE_PIECE_JUSTTCG_GAME_SLUG,
  buildJustTcgCodeToSlugs,
  extractVariantLabel,
  onePieceGame,
} from "@/lib/games/one-piece";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";

export const maxDuration = 60;

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const GAME = ONE_PIECE_JUSTTCG_GAME_SLUG;
const LOCK_TTL_MS = 55 * 60 * 1000;
const DEFAULT_MAX_SETS = 1;
const VALID_DURATIONS = new Set(["7d", "30d", "90d", "180d", "1y"]);

const CODE_TO_SLUGS = buildJustTcgCodeToSlugs(onePieceGame.justTcgSetSlugMap);

type Duration = "7d" | "30d" | "90d" | "180d" | "1y";

interface DbSet {
  id: string;
  game_id: string;
  code: string | null;
  name: string | null;
}

interface DbCard {
  id: string;
  game_id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string | null;
  name_base: string | null;
  variant_label: string | null;
  set_id: string;
  tcg_product_id: string | null;
}

interface JTCard {
  id: string;
  name: string;
  number: string | null;
  variants: JTVariant[];
}

interface JTVariant {
  id: string;
  condition: string | null;
  printing: string | null;
  price: number | null;
  priceHistory?: PriceHistoryPoint[] | null;
  priceHistory30d?: PriceHistoryPoint[] | null;
}

interface PriceHistoryPoint {
  t: number;
  p: number;
}

interface HistoryInsert {
  game_id: string;
  card_id: string;
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

interface CursorState {
  nextIndex?: number;
  completedCycles?: number;
  totalSets?: number;
  lastRunAt?: string;
  lastSetCodes?: string[];
  lastInserted?: number;
  lastError?: string | null;
}

interface SetResult {
  code: string;
  slugs: number;
  fetched: number;
  matched: number;
  historyRowsFound: number;
  existingRowsSkipped: number;
  inserted: number;
  skipped: Record<string, number>;
  errors: string[];
}

async function syncHistory(request: Request) {
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
  if (!process.env.JUSTTCG_API_KEY) {
    return NextResponse.json({ error: "JUSTTCG_API_KEY is not set" }, { status: 500 });
  }

  const historyDuration = (searchParams.get("historyDuration") ?? "1y") as Duration;
  if (!VALID_DURATIONS.has(historyDuration)) {
    return NextResponse.json({ error: `Unsupported historyDuration=${historyDuration}` }, { status: 400 });
  }

  const maxSets = clampInt(searchParams.get("maxSets"), DEFAULT_MAX_SETS, 1, 5);
  const reset = searchParams.get("reset") === "1";
  const manualCodes = searchParams.get("sets")
    ?.split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;
  const { data: dbSets, error: setsError } = await supabase
    .from("sets")
    .select("id, game_id, code, name")
    .eq("game_id", game.id)
    .order("code");

  if (setsError) {
    return NextResponse.json({ error: setsError.message }, { status: 500 });
  }

  const syncableSets = ((dbSets ?? []) as DbSet[])
    .filter((set) => set.code && CODE_TO_SLUGS[set.code])
    .sort((a, b) => setSortKey(a.code ?? "").localeCompare(setSortKey(b.code ?? "")));

  if (syncableSets.length === 0) {
    return NextResponse.json({ error: "No JustTCG-mapped sets found." }, { status: 500 });
  }

  let cursor: Awaited<ReturnType<typeof acquireCursor>> | null = null;
  let setsToProcess: DbSet[];
  let startIndex = 0;

  if (manualCodes?.length) {
    setsToProcess = syncableSets.filter((set) => set.code && manualCodes.includes(set.code));
    if (setsToProcess.length === 0) {
      return NextResponse.json({ error: `No mapped sets matched: ${manualCodes.join(",")}` }, { status: 400 });
    }
  } else {
    cursor = await acquireCursor(supabase, stateKey(historyDuration), syncableSets.length, reset);
    if (cursor.error) {
      return NextResponse.json(cursor.error, { status: cursor.status ?? 500 });
    }
    if (cursor.locked) {
      return NextResponse.json({
        message: "History backfill is already running.",
        lockedAt: cursor.row?.locked_at,
      });
    }

    startIndex = normalizeIndex(cursor.state.nextIndex ?? 0, syncableSets.length);
    setsToProcess = pickSets(syncableSets, startIndex, maxSets);
  }

  const results: SetResult[] = [];
  let processedForCursor = 0;
  let dailyLimitExceeded = false;
  let fatalError: string | null = null;

  try {
    for (const dbSet of setsToProcess) {
      try {
        const result = await syncOneSetHistory(supabase, game.id, dbSet, historyDuration);
        results.push(result);
        processedForCursor++;
      } catch (error) {
        if (isDailyLimitError(error)) {
          dailyLimitExceeded = true;
          fatalError = error instanceof Error ? error.message : String(error);
          break;
        }
        throw error;
      }
    }
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
  }

  if (cursor && cursor.lockOwner) {
    await releaseCursor(
      supabase,
      stateKey(historyDuration),
      cursor.lockOwner,
      advanceState(cursor.state, syncableSets.length, startIndex, processedForCursor, results, fatalError)
    );
  }

  const inserted = results.reduce((sum, result) => sum + result.inserted, 0);
  const response = {
    mode: manualCodes?.length ? "manual" : "cursor",
    game: game.slug,
    provider: "justtcg",
    historyDuration,
    maxSets,
    startIndex: manualCodes?.length ? null : startIndex,
    processedSets: processedForCursor,
    inserted,
    dailyLimitExceeded,
    error: fatalError,
    nextIndex: manualCodes?.length
      ? null
      : normalizeIndex(startIndex + processedForCursor, syncableSets.length),
    nextSet: manualCodes?.length
      ? null
      : syncableSets[normalizeIndex(startIndex + processedForCursor, syncableSets.length)]?.code ?? null,
    results,
  };

  return NextResponse.json(response, { status: fatalError && !dailyLimitExceeded ? 500 : 200 });
}

async function syncOneSetHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  gameId: string,
  dbSet: DbSet,
  historyDuration: Duration
): Promise<SetResult> {
  const setCode = dbSet.code ?? "";
  const slugs = CODE_TO_SLUGS[setCode] ?? [];
  const result: SetResult = {
    code: setCode,
    slugs: slugs.length,
    fetched: 0,
    matched: 0,
    historyRowsFound: 0,
    existingRowsSkipped: 0,
    inserted: 0,
    skipped: {
      no_number: 0,
      prefix_mismatch: 0,
      no_existing_card: 0,
      ambiguous: 0,
      low_confidence: 0,
      no_price: 0,
      no_history: 0,
    },
    errors: [],
  };

  const { data: dbCards, error: cardsError } = await supabase
    .from("cards")
    .select("id,game_id,card_image_id,card_number,name,name_base,variant_label,set_id,tcg_product_id")
    .eq("game_id", gameId)
    .eq("set_id", dbSet.id);

  if (cardsError) {
    result.errors.push(cardsError.message);
    return result;
  }

  const cards = (dbCards ?? []) as DbCard[];
  const indexes = buildIndexes(cards);
  const historyRows: HistoryInsert[] = [];

  for (const slug of slugs) {
    try {
      const jtCards = await fetchJustTcgCardsForSlug(slug, historyDuration);
      result.fetched += jtCards.length;

      for (const jtCard of jtCards) {
        const match = findExistingMatch(jtCard, setCode, indexes);
        if (!match.card) {
          result.skipped[match.reason] = (result.skipped[match.reason] ?? 0) + 1;
          continue;
        }

        const jtVariantKey = variantKey(expectedVariantLabel(jtCard.name));
        const dbVariantKey = variantKey(match.card.variant_label);
        const variant = chooseVariant(jtCard, Boolean(jtVariantKey || dbVariantKey));
        if (!variant || numeric(variant.price) === null || numeric(variant.price) === 0) {
          result.skipped.no_price++;
          continue;
        }

        const rows = historyRowsForVariant(gameId, match.card.id, variant);
        if (rows.length === 0) {
          result.skipped.no_history++;
          continue;
        }

        result.matched++;
        result.historyRowsFound += rows.length;
        historyRows.push(...rows);
      }
    } catch (error) {
      if (isDailyLimitError(error)) throw error;
      result.errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const dedupedRows = dedupeHistoryRows(historyRows);
  const existingKeys = await fetchExistingHistoryDayKeys(
    supabase,
    gameId,
    dedupedRows.map((row) => row.card_id),
    earliestIsoForDuration(historyDuration)
  );

  const rowsToInsert = dedupedRows.filter((row) => {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
    return key && !existingKeys.has(key);
  });
  result.existingRowsSkipped = dedupedRows.length - rowsToInsert.length;

  await insertHistoryRows(supabase, rowsToInsert);
  result.inserted = rowsToInsert.length;

  return result;
}

async function fetchJustTcgCardsForSlug(slug: string, historyDuration: Duration): Promise<JTCard[]> {
  const rows: JTCard[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const body = await justTcgJson(
      `/cards?game=${encodeURIComponent(GAME)}&set=${encodeURIComponent(slug)}&include_price_history=true&priceHistoryDuration=${encodeURIComponent(historyDuration)}&include_null_prices=false&limit=${limit}&offset=${offset}`
    );
    const page = justTcgRows(body) as JTCard[];
    rows.push(...page);
    if (!justTcgHasMore(body) || page.length === 0 || page.length < limit) break;
    offset += limit;
  }

  return rows;
}

async function justTcgJson(path: string, attempt = 0): Promise<unknown> {
  const res = await fetch(`${JUSTTCG_BASE}${path}`, {
    headers: {
      "x-api-key": process.env.JUSTTCG_API_KEY ?? "",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const body = parseJson(text);
  const code = typeof body?.code === "string" ? body.code : null;

  if (res.status === 429 && code !== "DAILY_LIMIT_EXCEEDED" && attempt < 5) {
    await sleep(2500 * (attempt + 1));
    return justTcgJson(path, attempt + 1);
  }

  if (!res.ok) {
    const error = new Error(`JustTCG ${path} failed: ${res.status} ${text}`) as Error & {
      status?: number;
      code?: string | null;
    };
    error.status = res.status;
    error.code = code;
    throw error;
  }

  return body;
}

function justTcgRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: unknown[] }).data;
  }
  return [];
}

function justTcgHasMore(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const pagination = (body as { pagination?: { hasMore?: boolean }; meta?: { hasMore?: boolean } });
  return Boolean(pagination.pagination?.hasMore ?? pagination.meta?.hasMore);
}

function buildIndexes(cards: DbCard[]) {
  const bySetNumber = new Map<string, DbCard[]>();
  const byTcgProductId = new Map<string, DbCard[]>();

  for (const card of cards) {
    const number = nullIfEmpty(card.card_number);
    if (number) {
      const bucket = bySetNumber.get(number) ?? [];
      bucket.push(card);
      bySetNumber.set(number, bucket);
    }
    if (card.tcg_product_id) {
      const bucket = byTcgProductId.get(String(card.tcg_product_id)) ?? [];
      bucket.push(card);
      byTcgProductId.set(String(card.tcg_product_id), bucket);
    }
  }

  return { bySetNumber, byTcgProductId };
}

function findExistingMatch(
  jtCard: JTCard,
  setCode: string,
  indexes: ReturnType<typeof buildIndexes>
): { card: DbCard | null; reason: string; score?: number } {
  const jtNumber = nullIfEmpty(jtCard.number);
  if (!jtNumber) return { card: null, reason: "no_number" };
  if (!allowsCardNumberInSet(setCode, jtNumber)) return { card: null, reason: "prefix_mismatch" };

  const direct = jtCard.id
    ? (indexes.byTcgProductId.get(String(jtCard.id)) ?? []).filter((card) => nullIfEmpty(card.card_number) === jtNumber)
    : [];
  if (direct.length === 1) return { card: direct[0], reason: "tcg_product_id", score: -100 };

  const candidates = indexes.bySetNumber.get(jtNumber) ?? [];
  if (candidates.length === 0) return { card: null, reason: "no_existing_card" };

  const jtVariantKey = variantKey(expectedVariantLabel(jtCard.name));
  const scored = candidates
    .map((card) => ({
      card,
      score: scoreCandidate(card, jtCard, jtNumber, jtVariantKey),
    }))
    .sort((a, b) => a.score - b.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return { card: null, reason: "no_existing_card" };
  if (second && second.score === best.score) return { card: null, reason: "ambiguous" };
  if (best.score >= 60) return { card: null, reason: "low_confidence" };

  return { card: best.card, reason: "set_number_variant", score: best.score };
}

function scoreCandidate(card: DbCard, jtCard: JTCard, jtNumber: string, jtVariantKey: string): number {
  const dbVariantKey = variantKey(card.variant_label);
  const dbNameVariantKey = variantKey(expectedVariantLabel(card.name));
  const dbAnyVariantKey = dbVariantKey || dbNameVariantKey;
  const exactBaseImage = card.card_image_id === jtNumber;
  const cardImage = String(card.card_image_id ?? "");
  const looksLikeImageVariant = /(?:_p\d+|_r\d+|-alt|-manga|-parallel)/i.test(cardImage);
  const jtBase = baseName(jtCard.name);
  const dbBase = baseName(card.name_base ?? card.name);
  let score = 0;

  if (jtBase && dbBase && jtBase !== dbBase) score += 12;

  if (!jtVariantKey) {
    if (exactBaseImage && !dbAnyVariantKey) score -= 50;
    if (dbAnyVariantKey) score += 80;
    if (!exactBaseImage && looksLikeImageVariant) score += 30;
  } else {
    if (dbAnyVariantKey && variantsEquivalent(dbAnyVariantKey, jtVariantKey)) {
      score -= 55;
    } else {
      score += 80;
    }

    // Variant-tagged JustTCG rows must not fall through to the base card just
    // because the image id is the plain card number.
    if (exactBaseImage && !dbAnyVariantKey) score += 120;
    if (!exactBaseImage && looksLikeImageVariant) score -= 10;
  }

  if (card.tcg_product_id && jtCard.id && String(card.tcg_product_id) === String(jtCard.id)) score -= 100;
  if (card.tcg_product_id && jtCard.id && String(card.tcg_product_id) !== String(jtCard.id)) score += 10;

  return score;
}

function chooseVariant(jtCard: JTCard, isVariantCard: boolean): JTVariant | null {
  const variants = Array.isArray(jtCard.variants) ? jtCard.variants : [];
  const nearMint = variants.filter((variant) => {
    const condition = String(variant.condition ?? "").toLowerCase();
    const price = numeric(variant.price);
    return condition === "near mint" && price !== null && price > 0;
  });
  const normal = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() === "normal");
  const foil = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() !== "normal");
  return isVariantCard ? foil ?? normal ?? nearMint[0] ?? null : normal ?? foil ?? nearMint[0] ?? null;
}

function historyRowsForVariant(gameId: string, cardId: string, variant: JTVariant): HistoryInsert[] {
  const points = Array.isArray(variant.priceHistory)
    ? variant.priceHistory
    : Array.isArray(variant.priceHistory30d)
      ? variant.priceHistory30d
      : [];

  const rows: HistoryInsert[] = [];
  for (const point of points) {
    const price = numeric(point?.p);
    const timestamp = numeric(point?.t);
    if (price === null || price <= 0 || timestamp === null) continue;
    const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
    rows.push({
      game_id: gameId,
      card_id: cardId,
      tcg_market: price,
      market_avg: price,
      recorded_at: new Date(ms).toISOString(),
    });
  }
  return rows;
}

function dedupeHistoryRows(rows: HistoryInsert[]): HistoryInsert[] {
  const byCardDay = new Map<string, HistoryInsert>();
  for (const row of rows) {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
    if (!key) continue;
    const existing = byCardDay.get(key);
    if (!existing || new Date(row.recorded_at).getTime() >= new Date(existing.recorded_at).getTime()) {
      byCardDay.set(key, row);
    }
  }
  return Array.from(byCardDay.values());
}

async function fetchExistingHistoryDayKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  gameId: string,
  cardIds: string[],
  minRecordedAt: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  const uniqueIds = Array.from(new Set(cardIds.filter(Boolean)));
  const chunkSize = 100;
  const pageSize = 1000;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("price_history")
        .select("game_id, card_id, recorded_at")
        .eq("game_id", gameId)
        .in("card_id", chunk)
        .gte("recorded_at", minRecordedAt)
        .order("recorded_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`price_history lookup failed: ${error.message}`);
      for (const row of data ?? []) {
        const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
        if (key) keys.add(key);
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  return keys;
}

async function insertHistoryRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: HistoryInsert[]
) {
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from("price_history").insert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`price_history insert failed: ${error.message}`);
  }
}

async function acquireCursor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
  totalSets: number,
  reset: boolean
): Promise<{
  state: CursorState;
  lockOwner: string | null;
  locked: boolean;
  row?: { locked_at?: string | null };
  error?: Record<string, unknown>;
  status?: number;
}> {
  const { data, error } = await supabase
    .from("sync_state")
    .select("key,state,locked_at,lock_owner")
    .eq("key", key)
    .maybeSingle();

  if (error) return syncStateError(error);

  const now = new Date().toISOString();
  const existingState = (data?.state ?? {}) as CursorState;
  const lockedAt = data?.locked_at ? new Date(data.locked_at).getTime() : 0;
  if (!reset && lockedAt && Date.now() - lockedAt < LOCK_TTL_MS) {
    return { state: existingState, lockOwner: null, locked: true, row: data };
  }

  const state: CursorState = reset
    ? { nextIndex: 0, completedCycles: 0, totalSets }
    : { ...existingState, nextIndex: normalizeIndex(existingState.nextIndex ?? 0, totalSets), totalSets };
  const lockOwner = randomId();

  const { error: upsertError } = await supabase
    .from("sync_state")
    .upsert(
      {
        key,
        state,
        locked_at: now,
        lock_owner: lockOwner,
        updated_at: now,
      },
      { onConflict: "key" }
    );

  if (upsertError) return syncStateError(upsertError);
  return { state, lockOwner, locked: false };
}

async function releaseCursor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
  lockOwner: string,
  state: CursorState
) {
  await supabase
    .from("sync_state")
    .update({
      state,
      locked_at: null,
      lock_owner: null,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key)
    .eq("lock_owner", lockOwner);
}

function syncStateError(error: { code?: string; message?: string }) {
  const message = error.message ?? "sync_state error";
  if (error.code === "42P01" || message.includes("sync_state")) {
    return {
      state: {},
      lockOwner: null,
      locked: false,
      status: 500,
      error: {
        error: "Missing sync_state table.",
        migration: "Run schema-migration-v15-price-history-backfill.sql in Supabase.",
        details: message,
      },
    };
  }
  return {
    state: {},
    lockOwner: null,
    locked: false,
    status: 500,
    error: { error: message },
  };
}

function advanceState(
  state: CursorState,
  totalSets: number,
  startIndex: number,
  processed: number,
  results: SetResult[],
  error: string | null
): CursorState {
  const nextRaw = startIndex + processed;
  const completedCycles = (state.completedCycles ?? 0) + Math.floor(nextRaw / totalSets);
  return {
    ...state,
    nextIndex: normalizeIndex(nextRaw, totalSets),
    completedCycles,
    totalSets,
    lastRunAt: new Date().toISOString(),
    lastSetCodes: results.map((result) => result.code),
    lastInserted: results.reduce((sum, result) => sum + result.inserted, 0),
    lastError: error,
  };
}

function expectedVariantLabel(name: string | null | undefined): string | null {
  const text = nullIfEmpty(name) ?? "";
  const extracted = extractVariantLabel(text);
  if (extracted) return extracted;

  const tags: string[] = [];
  const re = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const tag = match[1].trim();
    if (!/^\d+$/.test(tag)) tags.push(tag);
  }

  const joined = tags.join(" ").toLowerCase();
  if (!joined) return null;
  if (joined.includes("manga")) return "Manga";
  if (joined.includes("red super alternate art")) return "Red Super Alternate Art";
  if (joined.includes("super alternate art")) return "Super Alternate Art";
  if (joined.includes("sp") && joined.includes("gold")) return "SP Gold";
  if (joined.includes("sp") && joined.includes("silver")) return "SP Silver";
  if (/\bspr\b/.test(joined)) return "SP";
  if (/\bsp\b/.test(joined)) return "SP";
  if (/\btr\b/.test(joined)) return "TR";
  if (joined.includes("wanted poster")) return "Wanted Poster";
  if (joined.includes("gold-stamped signature")) return "Gold-Stamped Signature";
  if (joined.includes("alternate art")) return "Alternate Art";
  if (joined.includes("parallel")) return "Parallel";
  if (joined.includes("jolly roger foil")) return "Jolly Roger Foil";
  if (joined.includes("reprint")) return "Reprint";
  return null;
}

function variantKey(label: string | null | undefined): string {
  const normalized = (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "";
  if (normalized === "alternateart" || normalized === "parallel" || normalized === "altart") return "altart";
  if (normalized === "spr") return "sp";
  return normalized;
}

function variantsEquivalent(a: string, b: string): boolean {
  return Boolean(a && b && a === b);
}

function baseName(name: string | null | undefined): string {
  return (nullIfEmpty(name) ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function prefixFromCardNumber(cardNumber: string | null | undefined): string | null {
  const text = nullIfEmpty(cardNumber);
  if (!text) return null;
  const withDigits = text.match(/^([A-Z]+\d+)-/i);
  if (withDigits) return withDigits[1].toUpperCase();
  const promo = text.match(/^([A-Z]+)-/i);
  return promo ? promo[1].toUpperCase() : null;
}

function allowsCardNumberInSet(setCode: string, cardNumber: string | null | undefined): boolean {
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix) return false;
  if (setCode === "P" || setCode.startsWith("EB") || setCode.startsWith("PRB")) return true;
  return prefix === setCode;
}

function historyDayKey(gameId: string, cardId: string, recordedAt: string): string | null {
  const day = utcDay(recordedAt);
  return day ? `${gameId}|${cardId}|${day}` : null;
}

function utcDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function earliestIsoForDuration(duration: Duration): string {
  const daysByDuration: Record<Duration, number> = {
    "7d": 10,
    "30d": 35,
    "90d": 100,
    "180d": 190,
    "1y": 370,
  };
  return new Date(Date.now() - daysByDuration[duration] * 24 * 60 * 60 * 1000).toISOString();
}

function nullIfEmpty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^n\/?a$/i.test(text) || /^null$/i.test(text)) return null;
  return text;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isDailyLimitError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "DAILY_LIMIT_EXCEEDED"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}

function pickSets(sets: DbSet[], startIndex: number, count: number): DbSet[] {
  const picked: DbSet[] = [];
  const total = sets.length;
  for (let i = 0; i < Math.min(count, total); i++) {
    picked.push(sets[normalizeIndex(startIndex + i, total)]);
  }
  return picked;
}

function stateKey(duration: Duration) {
  return `justtcg_price_history_backfill_${duration}`;
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function setSortKey(code: string) {
  const familyOrder: Record<string, number> = { OP: 1, EB: 2, PRB: 3, ST: 4, P: 5 };
  const match = code.match(/^([A-Z]+)(\d+)?$/);
  if (!match) return `99-${code}`;
  const family = match[1];
  const number = match[2] ? Number(match[2]) : 0;
  return `${String(familyOrder[family] ?? 50).padStart(2, "0")}-${family}-${String(number).padStart(4, "0")}`;
}

export { syncHistory as GET, syncHistory as POST };
