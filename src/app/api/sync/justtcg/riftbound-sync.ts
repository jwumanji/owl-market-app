import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  fetchCardsBySet,
  fetchSets,
  type JustTCGCard,
  type JustTCGSet,
} from "@/lib/justtcg";
import {
  RIFTBOUND_JUSTTCG_GAME_SLUG,
  justTcgCardExternalId,
  justTcgSourceUpdatedAt,
  matchRiftboundJustTcgCards,
  matchRiftboundJustTcgSet,
  normalizeRiftboundSetName,
  type RiftboundCatalogSet,
  type RiftboundTcgplayerExternalId,
} from "@/lib/games/riftbound-justtcg";
import { JUSTTCG_NORMALIZED_API_VERSION } from "@/lib/games/provider-contract";
import {
  acquireProviderSyncState,
  releaseProviderSyncState,
  type ProviderSyncScope,
} from "@/lib/provider-sync-state";
import { createServiceClient } from "@/lib/supabase-server";

const RIFTBOUND_DB_SLUG = "riftbound";
const LOCK_TTL_MS = 55 * 60 * 1000;
const DEFAULT_MAX_SETS = 1;
const MAX_SETS_PER_RUN = 2;
const UPSERT_CHUNK_SIZE = 250;

interface CursorState {
  nextIndex?: number;
  completedCycles?: number;
  totalSets?: number;
  lastRunAt?: string;
  lastSetSlugs?: string[];
  lastFetchedCards?: number;
  lastMatchedCards?: number;
  lastUnmatchedCards?: number;
  lastError?: string | null;
}

interface ExternalIdRow {
  card_id: string;
  external_id: string;
  external_type: string;
}

interface SetExternalIdRow {
  set_id: string;
  external_id: string;
  external_type: string;
}

interface PagedQueryResult {
  data: unknown;
  error: { message?: string } | null;
}

interface PagedQuery {
  range(from: number, to: number): PromiseLike<PagedQueryResult>;
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function stableHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sourceRecord(
  gameId: string,
  recordType: "set" | "card",
  externalId: string,
  payload: unknown,
  options: { parentExternalId?: string | null; sourceUpdatedAt?: string | null; ingestRunId: string }
) {
  const now = new Date().toISOString();
  return {
    game_id: gameId,
    provider: "justtcg",
    record_type: recordType,
    external_id: externalId,
    parent_external_id: options.parentExternalId ?? null,
    source_updated_at: options.sourceUpdatedAt ?? null,
    fetched_at: now,
    payload_hash: stableHash(payload),
    payload,
    ingest_run_id: options.ingestRunId,
    payload_schema_version: 1,
    adapter_version: "justtcg_v1_riftbound_stage",
    is_tombstone: false,
    last_seen_at: now,
    updated_at: now,
  };
}

async function loadPaged<T>(buildQuery: () => PagedQuery): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw new Error(error.message ?? "Supabase paged read failed");
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function upsertChunks(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function insertChunks(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  rows: Record<string, unknown>[]
) {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

function syncScope(gameId: string): ProviderSyncScope {
  return {
    gameId,
    catalogScope: "en-global",
    provider: "justtcg",
    providerApiVersion: JUSTTCG_NORMALIZED_API_VERSION,
    jobKey: "riftbound_catalog_stage",
    scopeKey: RIFTBOUND_JUSTTCG_GAME_SLUG,
  };
}

function normalizeCursor(existing: CursorState, totalSets: number): CursorState {
  const nextIndex = Math.max(0, existing.nextIndex ?? 0) % Math.max(totalSets, 1);
  return { ...existing, nextIndex, totalSets };
}

function selectRequestedSets(allSets: JustTCGSet[], setsParam: string): JustTCGSet[] {
  const requested = new Set(
    setsParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return allSets.filter(
    (set) => requested.has(set.id) || requested.has(normalizeRiftboundSetName(set.name))
  );
}

export async function syncRiftboundJustTcg(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  const authorized =
    request.headers.get("authorization") === `Bearer ${cronSecret}` ||
    searchParams.get("secret") === cronSecret;
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.JUSTTCG_API_KEY) {
    return NextResponse.json({ error: "JUSTTCG_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id,slug,is_active,is_public,metadata")
    .eq("slug", RIFTBOUND_DB_SLUG)
    .maybeSingle();
  if (gameError || !game?.id) {
    return NextResponse.json(
      { error: gameError?.message ?? "Riftbound game row is missing" },
      { status: 500 }
    );
  }
  if (game.is_active === false) {
    return NextResponse.json({ error: "Riftbound is disabled" }, { status: 409 });
  }

  const { data: mapping, error: mappingError } = await supabase
    .from("price_provider_mappings")
    .select("id,is_active,pricing_capabilities,metadata")
    .eq("game_id", game.id)
    .eq("provider", "justtcg")
    .eq("source_game_slug", RIFTBOUND_JUSTTCG_GAME_SLUG)
    .eq("source_set_slug", "")
    .maybeSingle();
  if (mappingError || !mapping?.id || mapping.is_active === false) {
    return NextResponse.json(
      {
        error:
          mappingError?.message ??
          "Active staged Riftbound JustTCG mapping is missing; apply the ingestion migration first",
      },
      { status: 503 }
    );
  }

  const { data: provider, error: providerError } = await supabase
    .from("data_providers")
    .select("id,is_active,normalized_api_version")
    .eq("code", "justtcg")
    .maybeSingle();
  if (
    providerError ||
    !provider?.id ||
    provider.is_active === false ||
    provider.normalized_api_version !== JUSTTCG_NORMALIZED_API_VERSION
  ) {
    return NextResponse.json(
      {
        error:
          providerError?.message ??
          `Active JustTCG ${JUSTTCG_NORMALIZED_API_VERSION} provider seed is missing`,
      },
      { status: 500 }
    );
  }

  let providerSets: JustTCGSet[];
  try {
    providerSets = (await fetchSets(RIFTBOUND_JUSTTCG_GAME_SLUG)).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "JustTCG set discovery failed" },
      { status: 502 }
    );
  }

  const setsParam = searchParams.get("sets");
  const cursorMode = searchParams.get("cursor") === "1";
  if (!setsParam && !cursorMode) {
    return NextResponse.json({
      provider: "justtcg",
      game: RIFTBOUND_DB_SLUG,
      mode: "staged_raw_only",
      available: providerSets.map((set) => ({ id: set.id, name: set.name, cards: set.cards_count })),
    });
  }

  let cursor: CursorState = {};
  let lockOwner: string | null = null;
  let selectedSets: JustTCGSet[] = [];
  if (setsParam) {
    selectedSets = selectRequestedSets(providerSets, setsParam);
  } else {
    const acquired = await acquireProviderSyncState<CursorState>({
      supabase,
      scope: syncScope(game.id),
      lockTtlMs: LOCK_TTL_MS,
      reset: searchParams.get("reset") === "1",
      resetState: () => ({ nextIndex: 0, completedCycles: 0, totalSets: providerSets.length }),
      normalizeState: (state) => normalizeCursor(state, providerSets.length),
    });
    if (acquired.error) {
      return NextResponse.json(acquired.error, { status: acquired.status ?? 500 });
    }
    if (acquired.locked || !acquired.lockOwner) {
      return NextResponse.json(
        { error: "Riftbound JustTCG sync is already running", lockedAt: acquired.row?.locked_at },
        { status: 409 }
      );
    }
    cursor = acquired.state;
    lockOwner = acquired.lockOwner;
    const maxSets = clampInt(
      searchParams.get("maxSets"),
      DEFAULT_MAX_SETS,
      1,
      MAX_SETS_PER_RUN
    );
    selectedSets = providerSets.slice(cursor.nextIndex ?? 0, (cursor.nextIndex ?? 0) + maxSets);
  }

  if (selectedSets.length === 0) {
    if (lockOwner) {
      await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id),
        lockOwner,
        state: { ...cursor, nextIndex: 0, totalSets: providerSets.length },
      });
    }
    return NextResponse.json({ error: "No matching JustTCG Riftbound sets found" }, { status: 404 });
  }

  const ingestRunId = randomUUID();
  const { error: runError } = await supabase.from("source_ingest_runs").insert({
    id: ingestRunId,
    game_id: game.id,
    provider_id: provider.id,
    source_catalog_key: RIFTBOUND_JUSTTCG_GAME_SLUG,
    adapter_version: "justtcg_v1_riftbound_stage",
    provider_api_version: JUSTTCG_NORMALIZED_API_VERSION,
    job_key: "catalog_stage",
    status: "running",
    cursor: { sets: selectedSets.map((set) => set.id) },
    counts: {},
  });
  if (runError) {
    if (lockOwner) {
      await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id),
        lockOwner,
        state: {
          ...cursor,
          lastRunAt: new Date().toISOString(),
          lastError: runError.message,
        },
      });
    }
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  try {
    const catalogSets = await loadPaged<RiftboundCatalogSet>(() =>
      supabase.from("sets").select("id,code,name").eq("game_id", game.id).order("code")
    );
    const tcgplayerIds = await loadPaged<RiftboundTcgplayerExternalId>(() =>
      supabase
        .from("card_external_ids")
        .select("card_id,external_id")
        .eq("game_id", game.id)
        .eq("provider", "tcgplayer")
        .eq("external_type", "product_id")
    );
    const existingCardIds = await loadPaged<ExternalIdRow>(() =>
      supabase
        .from("card_external_ids")
        .select("card_id,external_id,external_type")
        .eq("game_id", game.id)
        .eq("provider", "justtcg")
    );
    const existingSetIds = await loadPaged<SetExternalIdRow>(() =>
      supabase
        .from("set_external_ids")
        .select("set_id,external_id,external_type")
        .eq("game_id", game.id)
        .eq("provider", "justtcg")
    );

    const cardsBySet = new Map<string, JustTCGCard[]>();
    for (const set of selectedSets) {
      cardsBySet.set(
        set.id,
        await fetchCardsBySet(set.id, RIFTBOUND_JUSTTCG_GAME_SLUG)
      );
    }

    const rawRows: Record<string, unknown>[] = [];
    const matchedCards: ReturnType<typeof matchRiftboundJustTcgCards>["matches"] = [];
    const unmatchedCards: JustTCGCard[] = [];
    const matchedSetRows: Array<{ providerSet: JustTCGSet; catalogSet: RiftboundCatalogSet }> = [];
    let variantCount = 0;

    for (const set of selectedSets) {
      rawRows.push(sourceRecord(game.id, "set", set.id, set, { ingestRunId }));
      const catalogSet = matchRiftboundJustTcgSet(set, catalogSets);
      if (catalogSet) matchedSetRows.push({ providerSet: set, catalogSet });
      const cards = cardsBySet.get(set.id) ?? [];
      const joined = matchRiftboundJustTcgCards(cards, tcgplayerIds);
      matchedCards.push(...joined.matches);
      unmatchedCards.push(...joined.unmatched);
      for (const card of cards) {
        variantCount += card.variants.length;
        const externalId = justTcgCardExternalId(card);
        if (!externalId) continue;
        rawRows.push(
          sourceRecord(game.id, "card", externalId, card, {
            ingestRunId,
            parentExternalId: set.id,
            sourceUpdatedAt: justTcgSourceUpdatedAt(card),
          })
        );
      }
    }

    const existingCardByCard = new Map(existingCardIds.map((row) => [row.card_id, row]));
    const existingCardByExternal = new Map(existingCardIds.map((row) => [row.external_id, row]));
    const cardExternalRows: Record<string, unknown>[] = [];
    const cardIdentityConflicts: string[] = [];
    for (const match of matchedCards) {
      const externalId = justTcgCardExternalId(match.justTcgCard);
      if (!externalId) continue;
      const byCard = existingCardByCard.get(match.cardId);
      const byExternal = existingCardByExternal.get(externalId);
      if (
        (byCard && byCard.external_id !== externalId) ||
        (byExternal && byExternal.card_id !== match.cardId)
      ) {
        cardIdentityConflicts.push(externalId);
        continue;
      }
      if (byCard || byExternal) continue;
      cardExternalRows.push({
        game_id: game.id,
        card_id: match.cardId,
        provider: "justtcg",
        external_id: externalId,
        external_type: match.justTcgCard.uuid ? "card_uuid" : "card_id",
        metadata: {
          source_game_slug: RIFTBOUND_JUSTTCG_GAME_SLUG,
          source_set_slug: match.justTcgCard.set,
          legacy_justtcg_id: match.justTcgCard.id,
          tcgplayer_product_id: match.justTcgCard.tcgplayerId,
          status: "staged_exact_tcgplayer_join",
        },
      });
    }

    const existingSetBySet = new Map(existingSetIds.map((row) => [row.set_id, row]));
    const existingSetByExternal = new Map(existingSetIds.map((row) => [row.external_id, row]));
    const setExternalRows: Record<string, unknown>[] = [];
    const setIdentityConflicts: string[] = [];
    for (const { providerSet, catalogSet } of matchedSetRows) {
      const bySet = existingSetBySet.get(catalogSet.id);
      const byExternal = existingSetByExternal.get(providerSet.id);
      if (
        (bySet && bySet.external_id !== providerSet.id) ||
        (byExternal && byExternal.set_id !== catalogSet.id)
      ) {
        setIdentityConflicts.push(providerSet.id);
        continue;
      }
      if (bySet || byExternal) continue;
      setExternalRows.push({
        game_id: game.id,
        set_id: catalogSet.id,
        provider: "justtcg",
        external_id: providerSet.id,
        external_type: "set_id",
        metadata: {
          source_game_slug: RIFTBOUND_JUSTTCG_GAME_SLUG,
          status: "staged_exact_name_join",
        },
      });
    }

    await upsertChunks(
      supabase,
      "tcg_source_records",
      rawRows,
      "game_id,provider,record_type,external_id"
    );
    await insertChunks(supabase, "card_external_ids", cardExternalRows);
    await insertChunks(supabase, "set_external_ids", setExternalRows);

    const nextIndexRaw = (cursor.nextIndex ?? 0) + selectedSets.length;
    const wrapped = nextIndexRaw >= providerSets.length;
    const nextState: CursorState = {
      ...cursor,
      nextIndex: wrapped ? 0 : nextIndexRaw,
      completedCycles: (cursor.completedCycles ?? 0) + (wrapped ? 1 : 0),
      totalSets: providerSets.length,
      lastRunAt: new Date().toISOString(),
      lastSetSlugs: selectedSets.map((set) => set.id),
      lastFetchedCards: matchedCards.length + unmatchedCards.length,
      lastMatchedCards: matchedCards.length,
      lastUnmatchedCards: unmatchedCards.length,
      lastError: null,
    };

    const counts = {
      sets_fetched: selectedSets.length,
      sets_matched: matchedSetRows.length,
      cards_fetched: matchedCards.length + unmatchedCards.length,
      cards_matched: matchedCards.length,
      cards_unmatched: unmatchedCards.length,
      variants_fetched: variantCount,
      raw_records_written: rawRows.length,
      card_external_ids_inserted: cardExternalRows.length,
      set_external_ids_inserted: setExternalRows.length,
      card_identity_conflicts: cardIdentityConflicts.length,
      set_identity_conflicts: setIdentityConflicts.length,
    };
    const { error: completeError } = await supabase
      .from("source_ingest_runs")
      .update({ status: "completed", counts, finished_at: new Date().toISOString() })
      .eq("id", ingestRunId)
      .eq("game_id", game.id);
    if (completeError) throw new Error(completeError.message);

    let releaseError: string | null = null;
    if (lockOwner) {
      releaseError = await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id),
        lockOwner,
        state: nextState,
      });
    }

    return NextResponse.json({
      provider: "justtcg",
      game: RIFTBOUND_DB_SLUG,
      sourceGameSlug: RIFTBOUND_JUSTTCG_GAME_SLUG,
      mode: "staged_raw_only",
      pricesPublished: false,
      ingestRunId,
      sets: selectedSets.map((set) => set.id),
      counts,
      unmatchedSample: unmatchedCards.slice(0, 10).map((card) => ({
        id: justTcgCardExternalId(card),
        name: card.name,
        number: card.number,
        set: card.set,
        tcgplayerId: card.tcgplayerId,
      })),
      conflicts: {
        cards: cardIdentityConflicts.slice(0, 10),
        sets: setIdentityConflicts.slice(0, 10),
      },
      nextCursor: lockOwner ? nextState : null,
      releaseError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("source_ingest_runs")
      .update({
        status: "failed",
        error_summary: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", ingestRunId)
      .eq("game_id", game.id);
    if (lockOwner) {
      await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id),
        lockOwner,
        state: { ...cursor, lastRunAt: new Date().toISOString(), lastError: message },
      });
    }
    return NextResponse.json({ error: message, ingestRunId }, { status: 500 });
  }
}
