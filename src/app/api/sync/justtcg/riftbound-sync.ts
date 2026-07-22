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
  classifyRiftboundUnmatchedCard,
  justTcgCardExternalId,
  justTcgSourceUpdatedAt,
  knownRiftboundSet,
  matchRiftboundJustTcgCards,
  matchRiftboundJustTcgSet,
  normalizeRiftboundSetName,
  selectRiftboundMarketVariant,
  type RiftboundCatalogSet,
  type RiftboundReconciliationStatus,
  type RiftboundTcgplayerExternalId,
} from "@/lib/games/riftbound-justtcg";
import { JUSTTCG_NORMALIZED_API_VERSION } from "@/lib/games/provider-contract";
import {
  justTcgObservedAt,
  writeJustTcgShadowPrices,
  type JustTcgShadowPriceMatch,
} from "@/lib/multitcg/justtcg-shadow-write";
import {
  acquireProviderSyncState,
  releaseProviderSyncState,
  type ProviderSyncScope,
} from "@/lib/provider-sync-state";
import { refreshPublicGameSummaries } from "@/lib/public-page-summaries";
import { createServiceClient } from "@/lib/supabase-server";

const RIFTBOUND_DB_SLUG = "riftbound";
const LOCK_TTL_MS = 55 * 60 * 1000;
const DEFAULT_MAX_SETS = 1;
const MAX_SETS_PER_RUN = 50;
const UPSERT_CHUNK_SIZE = 250;
const INCREMENTAL_OVERLAP_SECONDS = 5 * 60;
const FIRST_INCREMENTAL_LOOKBACK_SECONDS = 6 * 60 * 60;

type SyncMode = "full" | "incremental";

interface CursorState {
  nextIndex?: number;
  completedCycles?: number;
  totalSets?: number;
  lastRunAt?: string;
  lastSetSlugs?: string[];
  lastFetchedCards?: number;
  lastMatchedCards?: number;
  lastUnmatchedCards?: number;
  lastSuccessfulWatermark?: string;
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

interface CatalogCardRow {
  id: string;
  set_id: string | null;
  card_number: string | null;
  name: string | null;
}

interface ReconciliationCandidateRow {
  external_id: string;
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
  recordType: "set" | "card" | "price_variant",
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
    adapter_version: "justtcg_v1_riftbound_reconciliation",
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

function syncScope(gameId: string, mode: SyncMode): ProviderSyncScope {
  return {
    gameId,
    catalogScope: "en-global",
    provider: "justtcg",
    providerApiVersion: JUSTTCG_NORMALIZED_API_VERSION,
    jobKey: mode === "incremental" ? "riftbound_prices_incremental" : "riftbound_catalog_full",
    scopeKey: RIFTBOUND_JUSTTCG_GAME_SLUG,
  };
}

function normalizeCollectorNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function catalogCardKey(setId: string | null, number: string | null | undefined) {
  const normalized = normalizeCollectorNumber(number);
  return setId && normalized ? setId + ":" + normalized : "";
}

function priceRow(cardId: string, card: JustTCGCard) {
  const variant = selectRiftboundMarketVariant(card);
  if (!variant || variant.price == null) return null;
  const observedAt = justTcgObservedAt(variant.lastUpdated);
  return {
    card_id: cardId,
    tcg_market: variant.price,
    tcg_low: variant.minPrice30d ?? variant.minPrice7d ?? null,
    tcg_mid: variant.avgPrice30d ?? variant.avgPrice ?? null,
    tcg_high: variant.maxPrice30d ?? variant.maxPrice7d ?? null,
    market_avg: variant.avgPrice30d ?? variant.avgPrice ?? variant.price,
    chg_1d: variant.priceChange24hr ?? null,
    chg_7d: variant.priceChange7d ?? null,
    chg_30d: variant.priceChange30d ?? null,
    ath: variant.maxPriceAllTime ?? null,
    ath_date: null,
    atl: variant.minPriceAllTime ?? null,
    atl_date: null,
    observed_at: observedAt,
    provider_variant_id: variant.uuid?.trim() || variant.id,
  };
}

function shadowPriceMatch(
  cardId: string,
  card: JustTCGCard
): JustTcgShadowPriceMatch | null {
  const variant = selectRiftboundMarketVariant(card);
  if (!variant || variant.price == null) return null;
  const cardUuid = card.uuid?.trim();
  return {
    legacyCardId: cardId,
    providerProductExternalId: cardUuid || card.tcgplayerId || card.id,
    providerProductNamespace: cardUuid ? "card_uuid" : "product_id",
    providerSkuExternalId: variant.uuid?.trim() || variant.id,
    providerSkuNamespace: variant.uuid?.trim() ? "variant_uuid" : "variant_id",
    tcgplayerSkuId: variant.tcgplayerSkuId ?? null,
    condition: variant.condition,
    printing: variant.printing,
    amount: variant.price,
    observedAt: justTcgObservedAt(variant.lastUpdated),
    sourceSetSlug: card.set,
    rawProduct: card as unknown as Record<string, unknown>,
    rawVariant: variant as unknown as Record<string, unknown>,
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
  const publishPrices =
    (mapping.pricing_capabilities as Record<string, unknown> | null)?.publish_prices === true;

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

  const syncMode: SyncMode =
    searchParams.get("mode") === "incremental" ? "incremental" : "full";
  const setsParam = searchParams.get("sets");
  const cursorMode = searchParams.get("cursor") === "1" || syncMode === "incremental";
  if (!setsParam && !cursorMode) {
    return NextResponse.json({
      provider: "justtcg",
      game: RIFTBOUND_DB_SLUG,
      mode: "discovery",
      available: providerSets.map((set) => ({ id: set.id, name: set.name, cards: set.cards_count })),
    });
  }

  const runStartedAt = new Date();
  let cursor: CursorState = {};
  let lockOwner: string | null = null;
  let selectedSets: JustTCGSet[] = [];
  if (setsParam) {
    selectedSets = selectRequestedSets(providerSets, setsParam);
  } else {
    const acquired = await acquireProviderSyncState<CursorState>({
      supabase,
      scope: syncScope(game.id, syncMode),
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
      syncMode === "incremental" ? providerSets.length : DEFAULT_MAX_SETS,
      1,
      MAX_SETS_PER_RUN
    );
    selectedSets =
      syncMode === "incremental"
        ? providerSets.slice(0, maxSets)
        : providerSets.slice(cursor.nextIndex ?? 0, (cursor.nextIndex ?? 0) + maxSets);
  }

  const priorWatermark = cursor.lastSuccessfulWatermark
    ? Math.floor(new Date(cursor.lastSuccessfulWatermark).getTime() / 1000)
    : Math.floor(runStartedAt.getTime() / 1000) - FIRST_INCREMENTAL_LOOKBACK_SECONDS;
  const updatedAfter =
    syncMode === "incremental"
      ? Math.max(0, priorWatermark - INCREMENTAL_OVERLAP_SECONDS)
      : null;

  if (selectedSets.length === 0) {
    if (lockOwner) {
      await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id, syncMode),
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
    adapter_version: "justtcg_v1_riftbound_reconciliation",
    provider_api_version: JUSTTCG_NORMALIZED_API_VERSION,
    job_key: syncMode === "incremental" ? "current_prices" : "catalog_reconciliation",
    status: "running",
    cursor: {
      mode: syncMode,
      sets: selectedSets.map((set) => set.id),
      updated_after: updatedAfter,
    },
    counts: {},
  });
  if (runError) {
    if (lockOwner) {
      await releaseProviderSyncState({
        supabase,
        scope: syncScope(game.id, syncMode),
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
    const catalogCards = await loadPaged<CatalogCardRow>(() =>
      supabase
        .from("cards")
        .select("id,set_id,card_number,name")
        .eq("game_id", game.id)
    );
    const existingCandidates = await loadPaged<ReconciliationCandidateRow>(() =>
      supabase
        .from("catalog_reconciliation_candidates")
        .select("external_id")
        .eq("game_id", game.id)
        .eq("provider", "justtcg")
        .eq("entity_type", "card")
    );

    const cardsBySet = new Map<string, JustTCGCard[]>();
    for (const set of selectedSets) {
      cardsBySet.set(
        set.id,
        await fetchCardsBySet(set.id, RIFTBOUND_JUSTTCG_GAME_SLUG, {
          updatedAfter,
        })
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
        if (syncMode === "incremental") {
          for (const variant of card.variants) {
            const variantId = variant.uuid?.trim() || variant.id;
            if (!variantId) continue;
            rawRows.push(
              sourceRecord(
                game.id,
                "price_variant",
                externalId + ":" + variantId,
                {
                  card_uuid: card.uuid ?? null,
                  card_id: card.id,
                  tcgplayer_product_id: card.tcgplayerId,
                  set: card.set,
                  variant,
                },
                {
                  ingestRunId,
                  parentExternalId: externalId,
                  sourceUpdatedAt: justTcgSourceUpdatedAt(card),
                }
              )
            );
          }
        } else {
          rawRows.push(
            sourceRecord(game.id, "card", externalId, card, {
              ingestRunId,
              parentExternalId: set.id,
              sourceUpdatedAt: justTcgSourceUpdatedAt(card),
            })
          );
        }
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

    const catalogSetByProviderSet = new Map(
      matchedSetRows.map(({ providerSet, catalogSet }) => [providerSet.id, catalogSet])
    );
    const catalogCardByKey = new Map<string, CatalogCardRow | null>();
    for (const card of catalogCards) {
      const key = catalogCardKey(card.set_id, card.card_number);
      if (!key) continue;
      catalogCardByKey.set(key, catalogCardByKey.has(key) ? null : card);
    }

    const priorCandidateIds = new Set(existingCandidates.map((row) => row.external_id));
    const candidateRows: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    const candidateStatusCounts = new Map<RiftboundReconciliationStatus, number>();
    const addCandidate = (
      status: RiftboundReconciliationStatus,
      row: Record<string, unknown>
    ) => {
      candidateRows.push({
        game_id: game.id,
        provider: "justtcg",
        status,
        last_seen_at: now,
        updated_at: now,
        ...row,
      });
      candidateStatusCounts.set(status, (candidateStatusCounts.get(status) ?? 0) + 1);
    };

    for (const match of matchedCards) {
      const externalId = justTcgCardExternalId(match.justTcgCard);
      if (!externalId || !priorCandidateIds.has(externalId)) continue;
      addCandidate("resolved", {
        entity_type: "card",
        external_id: externalId,
        reason: "exact_tcgplayer_product_id_match",
        canonical_card_id: match.cardId,
        source_set_external_id: match.justTcgCard.set,
        tcgplayer_product_id: match.justTcgCard.tcgplayerId,
        source_updated_at: justTcgSourceUpdatedAt(match.justTcgCard),
        resolved_at: now,
        payload: match.justTcgCard,
        metadata: { resolution: "automatic_exact_id" },
      });
    }

    for (const card of unmatchedCards) {
      const externalId = justTcgCardExternalId(card);
      if (!externalId) continue;
      const catalogSet = catalogSetByProviderSet.get(card.set) ?? null;
      const possibleCard = catalogSet
        ? catalogCardByKey.get(catalogCardKey(catalogSet.id, card.number)) ?? null
        : null;
      const classification = classifyRiftboundUnmatchedCard(card, {
        hasCatalogSet: Boolean(catalogSet),
        possibleCardId: possibleCard?.id ?? null,
      });
      const knownSet = knownRiftboundSet(card.set_name);
      addCandidate(classification.status, {
        entity_type:
          classification.status === "sealed_product" ? "sealed_product" : "card",
        external_id: externalId,
        reason: classification.reason,
        canonical_card_id: possibleCard?.id ?? null,
        canonical_set_id: catalogSet?.id ?? null,
        source_set_external_id: card.set,
        tcgplayer_product_id: card.tcgplayerId,
        source_updated_at: justTcgSourceUpdatedAt(card),
        resolved_at: null,
        payload: card,
        metadata: {
          possible_card_name: possibleCard?.name ?? null,
          known_official_set: knownSet?.name ?? null,
          official_release_date: knownSet?.releaseDate ?? null,
          release_status: knownSet?.status ?? null,
          publication_gate: knownSet ? "riot_card_confirmation" : null,
        },
      });
    }

    for (const set of selectedSets) {
      const catalogSet = catalogSetByProviderSet.get(set.id);
      const knownSet = knownRiftboundSet(set.name);
      addCandidate(catalogSet ? "resolved" : "provider_ahead", {
        entity_type: "set",
        external_id: set.id,
        reason: catalogSet
          ? "exact_normalized_set_name_match"
          : knownSet
            ? "known_official_set_waiting_for_riot_catalog"
            : "commercial_provider_set_missing_from_canonical_catalog",
        canonical_set_id: catalogSet?.id ?? null,
        source_set_external_id: set.id,
        source_updated_at: null,
        resolved_at: catalogSet ? now : null,
        payload: set,
        metadata: {
          known_official_set: knownSet?.name ?? null,
          official_release_date: knownSet?.releaseDate ?? null,
          release_status: knownSet?.status ?? null,
          publication_gate: knownSet ? "riot_catalog_confirmation" : null,
        },
      });
    }

    const completeFullCatalog =
      syncMode === "full" && selectedSets.length === providerSets.length;
    if (completeFullCatalog) {
      const matchedCardIds = new Set(matchedCards.map((match) => match.cardId));
      for (const row of tcgplayerIds) {
        if (matchedCardIds.has(row.card_id)) continue;
        addCandidate("catalog_only", {
          entity_type: "card",
          external_id: "moon:" + row.card_id,
          reason: "canonical_card_missing_current_justtcg_match",
          canonical_card_id: row.card_id,
          tcgplayer_product_id: row.external_id,
          resolved_at: null,
          payload: { tcgplayer_product_id: row.external_id },
          metadata: { publication: "catalog_live_pricing_pending" },
        });
      }
    }

    const dedupedRawRows = Array.from(
      new Map(
        rawRows.map((row) => [
          [row.game_id, row.provider, row.record_type, row.external_id].join(":"),
          row,
        ])
      ).values()
    );
    const dedupedCardExternalRows = Array.from(
      new Map(cardExternalRows.map((row) => [String(row.external_id), row])).values()
    );
    const dedupedSetExternalRows = Array.from(
      new Map(setExternalRows.map((row) => [String(row.external_id), row])).values()
    );
    const dedupedCandidateRows = Array.from(
      new Map(
        candidateRows.map((row) => [
          [row.entity_type, row.external_id].join(":"),
          row,
        ])
      ).values()
    );

    await upsertChunks(
      supabase,
      "tcg_source_records",
      dedupedRawRows,
      "game_id,provider,record_type,external_id"
    );
    await insertChunks(supabase, "card_external_ids", dedupedCardExternalRows);
    await insertChunks(supabase, "set_external_ids", dedupedSetExternalRows);
    await upsertChunks(
      supabase,
      "catalog_reconciliation_candidates",
      dedupedCandidateRows,
      "game_id,provider,entity_type,external_id"
    );

    const legacyPriceRows = Array.from(
      new Map(
        matchedCards
          .map((match) => priceRow(match.cardId, match.justTcgCard))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => [row.card_id, row])
      ).values()
    );
    const shadowMatches = matchedCards
      .map((match) => shadowPriceMatch(match.cardId, match.justTcgCard))
      .filter((row): row is JustTcgShadowPriceMatch => Boolean(row));
    let legacyPricing = { prices_written: 0, history_written: 0 };
    let normalizedPricing = {
      attempted: 0,
      observationsWritten: 0,
      preferredPricesWritten: 0,
    };
    if (publishPrices && legacyPriceRows.length > 0) {
      const { data: published, error: publishError } = await supabase.rpc(
        "publish_riftbound_justtcg_prices",
        { p_game_id: game.id, p_rows: legacyPriceRows }
      );
      if (publishError) throw new Error("publish Riftbound prices: " + publishError.message);
      legacyPricing = {
        prices_written: Number(published?.prices_written ?? 0),
        history_written: Number(published?.history_written ?? 0),
      };
      normalizedPricing = await writeJustTcgShadowPrices({
        supabase,
        gameId: game.id,
        sourceCatalogKey: RIFTBOUND_JUSTTCG_GAME_SLUG,
        matches: shadowMatches,
      });
      await refreshPublicGameSummaries(supabase, game.id);
    }

    const nextIndexRaw =
      syncMode === "incremental"
        ? 0
        : (cursor.nextIndex ?? 0) + selectedSets.length;
    const wrapped = nextIndexRaw >= providerSets.length;
    const nextState: CursorState = {
      ...cursor,
      nextIndex: wrapped ? 0 : nextIndexRaw,
      completedCycles: (cursor.completedCycles ?? 0) + (wrapped ? 1 : 0),
      totalSets: providerSets.length,
      lastRunAt: new Date().toISOString(),
      lastSuccessfulWatermark: runStartedAt.toISOString(),
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
      raw_records_written: dedupedRawRows.length,
      card_external_ids_inserted: dedupedCardExternalRows.length,
      set_external_ids_inserted: dedupedSetExternalRows.length,
      card_identity_conflicts: cardIdentityConflicts.length,
      set_identity_conflicts: setIdentityConflicts.length,
      reconciliation_candidates_written: dedupedCandidateRows.length,
      reconciliation_statuses: Object.fromEntries(candidateStatusCounts),
      legacy_prices_written: legacyPricing.prices_written,
      legacy_history_written: legacyPricing.history_written,
      normalized_observations_written: normalizedPricing.observationsWritten,
      normalized_preferred_prices_written: normalizedPricing.preferredPricesWritten,
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
        scope: syncScope(game.id, syncMode),
        lockOwner,
        state: nextState,
      });
    }

    return NextResponse.json({
      provider: "justtcg",
      game: RIFTBOUND_DB_SLUG,
      sourceGameSlug: RIFTBOUND_JUSTTCG_GAME_SLUG,
      mode: syncMode,
      updatedAfter,
      pricesPublished: publishPrices,
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
        scope: syncScope(game.id, syncMode),
        lockOwner,
        state: { ...cursor, lastRunAt: new Date().toISOString(), lastError: message },
      });
    }
    return NextResponse.json({ error: message, ingestRunId }, { status: 500 });
  }
}
