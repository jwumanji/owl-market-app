import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  LORCANA_DB_SLUG,
  LORCANA_JUSTTCG_GAME_SLUG,
  selectLorcanaPreferredMarketVariant,
} from "@/lib/games/lorcana";
import { JUSTTCG_NORMALIZED_API_VERSION } from "@/lib/games/provider-contract";
import {
  fetchCardsBySet,
  fetchSets,
  type JustTCGCard,
  type JustTCGSet,
  type JustTCGVariant,
} from "@/lib/justtcg";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import { justTcgObservedAt } from "@/lib/multitcg/justtcg-shadow-write";
import { refreshPublicGameSummaries } from "@/lib/public-page-summaries";
import { createServiceClient } from "@/lib/supabase-server";

const UPSERT_CHUNK_SIZE = 250;
const FETCH_CONCURRENCY = 5;
const ADAPTER_VERSION = "justtcg_v1_lorcana_preferred_finish";

interface CatalogCardRow {
  id: string;
  tcg_product_id: string | null;
}

interface PriceMappingRow {
  id: string;
  pricing_capabilities: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
}

interface GameRow {
  id: string;
  metadata: Record<string, unknown> | null;
}

interface PagedQueryResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

interface PagedQuery<T> {
  range(from: number, to: number): PromiseLike<PagedQueryResult<T>>;
}

function externalProductId(value: string | null | undefined) {
  return value?.trim() || null;
}

async function loadPaged<T>(buildQuery: () => PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw new Error(error.message ?? "Supabase paged read failed");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function fetchProviderCards(sets: JustTCGSet[]) {
  const cards: JustTCGCard[] = [];
  for (let index = 0; index < sets.length; index += FETCH_CONCURRENCY) {
    const batch = await Promise.all(
      sets.slice(index, index + FETCH_CONCURRENCY).map((set) =>
        fetchCardsBySet(set.id, LORCANA_JUSTTCG_GAME_SLUG)
      )
    );
    cards.push(...batch.flat());
  }
  return cards;
}

async function upsertPrices(
  supabase: ReturnType<typeof createServiceClient>,
  rows: Record<string, unknown>[]
) {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const { error } = await supabase
      .from("price_stats")
      .upsert(rows.slice(index, index + UPSERT_CHUNK_SIZE), {
        onConflict: "game_id,card_id",
      });
    if (error) throw new Error(`Lorcana price upsert failed: ${error.message}`);
  }
}

function priceRow(
  gameId: string,
  cardId: string,
  variant: JustTCGVariant
) {
  const observedAt = justTcgObservedAt(variant.lastUpdated);
  return {
    game_id: gameId,
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
    updated_at: observedAt,
  };
}

function uniqueCatalogCards(cards: CatalogCardRow[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const productId = externalProductId(card.tcg_product_id);
    if (productId) counts.set(productId, (counts.get(productId) ?? 0) + 1);
  }
  return new Map(
    cards.flatMap((card) => {
      const productId = externalProductId(card.tcg_product_id);
      return productId && counts.get(productId) === 1 ? [[productId, card] as const] : [];
    })
  );
}

function providerProductCounts(cards: JustTCGCard[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const productId = externalProductId(card.tcgplayerId);
    if (productId) counts.set(productId, (counts.get(productId) ?? 0) + 1);
  }
  return counts;
}

export async function syncLorcanaJustTcg(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const allowInitialPublication = searchParams.get("publish") === "1";
  const supabase = createServiceClient();

  const { data: gameData, error: gameError } = await supabase
    .from("games")
    .select("id,metadata")
    .eq("slug", LORCANA_DB_SLUG)
    .maybeSingle();
  if (gameError || !gameData?.id) {
    return NextResponse.json(
      { error: gameError?.message ?? "Lorcana game row is missing" },
      { status: 500 }
    );
  }
  const game = gameData as GameRow;

  const { data: mappingData, error: mappingError } = await supabase
    .from("price_provider_mappings")
    .select("id,pricing_capabilities,metadata,is_active")
    .eq("game_id", game.id)
    .eq("provider", "justtcg")
    .eq("source_game_slug", LORCANA_JUSTTCG_GAME_SLUG)
    .eq("source_set_slug", "")
    .maybeSingle();
  if (mappingError || !mappingData?.id || mappingData.is_active === false) {
    return NextResponse.json(
      { error: mappingError?.message ?? "Active Lorcana JustTCG mapping is missing" },
      { status: 503 }
    );
  }
  const mapping = mappingData as PriceMappingRow;
  const publicationEnabled =
    mapping.pricing_capabilities?.publish_prices === true || allowInitialPublication;
  if (!publicationEnabled) {
    return NextResponse.json(
      { error: "Lorcana price publication is staged; pass publish=1 for the authorized release." },
      { status: 409 }
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
      { error: providerError?.message ?? "Active JustTCG v1 provider seed is missing" },
      { status: 500 }
    );
  }

  const ingestRunId = randomUUID();
  const startedAt = new Date().toISOString();
  const { error: runError } = await supabase.from("source_ingest_runs").insert({
    id: ingestRunId,
    game_id: game.id,
    provider_id: provider.id,
    source_catalog_key: LORCANA_JUSTTCG_GAME_SLUG,
    adapter_version: ADAPTER_VERSION,
    provider_api_version: JUSTTCG_NORMALIZED_API_VERSION,
    job_key: "lorcana_current_prices",
    status: "running",
    counts: {},
    started_at: startedAt,
  });
  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  try {
    const [sets, catalogCards] = await Promise.all([
      fetchSets(LORCANA_JUSTTCG_GAME_SLUG),
      loadPaged<CatalogCardRow>(() =>
        supabase
          .from("cards")
          .select("id,tcg_product_id")
          .eq("game_id", game.id)
          .eq("region", "en")
          .order("id") as unknown as PagedQuery<CatalogCardRow>
      ),
    ]);
    const providerCards = await fetchProviderCards(sets);
    const catalogByProduct = uniqueCatalogCards(catalogCards);
    const providerCounts = providerProductCounts(providerCards);

    const rowsByCard = new Map<string, Record<string, unknown>>();
    const finishCounts = new Map<string, number>();
    let exactMatches = 0;
    let matchesWithoutPrice = 0;
    let providerConflicts = 0;
    let providerAhead = 0;

    for (const card of providerCards) {
      const productId = externalProductId(card.tcgplayerId);
      if (!productId) {
        providerAhead += 1;
        continue;
      }
      if (providerCounts.get(productId) !== 1) {
        providerConflicts += 1;
        continue;
      }
      const catalogCard = catalogByProduct.get(productId);
      if (!catalogCard) {
        providerAhead += 1;
        continue;
      }
      exactMatches += 1;
      const variant = selectLorcanaPreferredMarketVariant(card);
      if (!variant || variant.price == null) {
        matchesWithoutPrice += 1;
        continue;
      }
      finishCounts.set(variant.printing, (finishCounts.get(variant.printing) ?? 0) + 1);
      rowsByCard.set(catalogCard.id, priceRow(game.id, catalogCard.id, variant));
    }

    const priceRows = Array.from(rowsByCard.values());
    await upsertPrices(supabase, priceRows);
    await refreshPublicGameSummaries(supabase, game.id);

    const capabilities = {
      ...(mapping.pricing_capabilities ?? {}),
      catalog_raw: true,
      variant_payloads: true,
      raw_market_prices: true,
      market_price: true,
      price_history: false,
      publish_prices: true,
    };
    const mappingMetadata = {
      ...(mapping.metadata ?? {}),
      status: "live_exact_matches",
      adapter: ADAPTER_VERSION,
      publication_enabled: true,
      preferred_finish_policy: "normal_then_foil_only_v1",
    };
    const { error: mappingUpdateError } = await supabase
      .from("price_provider_mappings")
      .update({ pricing_capabilities: capabilities, metadata: mappingMetadata })
      .eq("id", mapping.id)
      .eq("game_id", game.id);
    if (mappingUpdateError) throw new Error(mappingUpdateError.message);

    const gameMetadata = {
      ...(game.metadata ?? {}),
      publication_status: "live",
      pricing_provider: "justtcg",
      pricing_status: "live_exact_matches",
      preferred_finish_policy: "normal_then_foil_only_v1",
    };
    const { error: gameUpdateError } = await supabase
      .from("games")
      .update({ metadata: gameMetadata })
      .eq("id", game.id);
    if (gameUpdateError) throw new Error(gameUpdateError.message);

    const counts = {
      sets_fetched: sets.length,
      cards_fetched: providerCards.length,
      exact_product_matches: exactMatches,
      prices_written: priceRows.length,
      matches_without_price: matchesWithoutPrice,
      provider_identity_conflicts: providerConflicts,
      provider_ahead: providerAhead,
      preferred_finishes: Object.fromEntries([...finishCounts].sort()),
    };
    const { error: completeError } = await supabase
      .from("source_ingest_runs")
      .update({ status: "completed", counts, finished_at: new Date().toISOString() })
      .eq("id", ingestRunId)
      .eq("game_id", game.id);
    if (completeError) throw new Error(completeError.message);

    return NextResponse.json({
      message: "Lorcana JustTCG prices synchronized",
      policy: "unique exact TCGplayer product ID; Normal, otherwise foil-only finish",
      ...counts,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
