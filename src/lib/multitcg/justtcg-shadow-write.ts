import { JUSTTCG_NORMALIZED_API_VERSION } from "../games/provider-contract.ts";
import { buildGradeKey, toPriceObservationRow } from "./pricing.ts";

// The generated Supabase types intentionally lag these additive migrations.
// Keep this adapter structural until the migrations are deployed and types are
// regenerated from the reviewed schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface JustTcgShadowPriceMatch {
  legacyCardId: string;
  providerProductExternalId: string;
  providerProductNamespace: "product_id" | "card_uuid";
  providerSkuExternalId: string;
  providerSkuNamespace: "variant_id" | "variant_uuid";
  tcgplayerSkuId?: string | null;
  condition: string;
  printing: string;
  amount: number;
  observedAt: string;
  sourceSetSlug: string;
  rawProduct: Record<string, unknown>;
  rawVariant: Record<string, unknown>;
}

export interface JustTcgShadowWriteResult {
  attempted: number;
  observationsWritten: number;
  preferredPricesWritten: number;
  ingestRunId?: string;
}

interface PrintingRow {
  id: string;
  legacy_card_id: string;
}

interface CommercialVariantRow {
  id: string;
  card_printing_id: string;
}

interface ProviderProductRow {
  id: string;
  external_namespace: string;
  external_id: string;
  card_printing_id: string | null;
}

interface ProviderSkuRow {
  id: string;
  external_namespace: string;
  external_id: string;
  provider_product_id: string | null;
  commercial_variant_id: string | null;
}

interface ObservationRow {
  id: string;
  game_id: string;
  commercial_variant_id: string;
  provider_id: string;
  provider_sku_id: string;
  market_code: string;
  currency_code: string;
  condition_code: string;
  price_type: string;
  amount: number;
  observed_at: string;
  source_updated_at: string | null;
  external_observation_key: string;
}

function resultError(error: { message?: string } | null | undefined, operation: string): never {
  throw new Error(`${operation}: ${error?.message ?? "unknown database error"}`);
}

function externalKey(namespace: string, externalId: string): string {
  return `${namespace}:${externalId}`;
}

function dedupeMatches(rows: JustTcgShadowPriceMatch[]): JustTcgShadowPriceMatch[] {
  const bySkuObservation = new Map<string, JustTcgShadowPriceMatch>();
  for (const row of rows) {
    const key = [
      row.providerSkuNamespace,
      row.providerSkuExternalId,
      row.observedAt,
    ].join(":");
    bySkuObservation.set(key, row);
  }
  return Array.from(bySkuObservation.values());
}

export function normalizeProviderCondition(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized || "unspecified";
}

export function justTcgObservedAt(lastUpdated: number | null | undefined, fallback = new Date()): string {
  if (typeof lastUpdated === "number" && Number.isFinite(lastUpdated) && lastUpdated > 0) {
    const milliseconds = lastUpdated < 100_000_000_000 ? lastUpdated * 1000 : lastUpdated;
    const sourceDate = new Date(milliseconds);
    if (!Number.isNaN(sourceDate.getTime())) return sourceDate.toISOString();
  }
  return fallback.toISOString();
}

function shadowRpcMatch(match: JustTcgShadowPriceMatch) {
  if (!Number.isFinite(match.amount) || match.amount < 0) {
    throw new Error("Invalid JustTCG shadow price for " + match.providerSkuExternalId);
  }
  const observedAt = new Date(match.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error("Invalid JustTCG observation time for " + match.providerSkuExternalId);
  }
  if (
    !match.legacyCardId ||
    !match.providerProductExternalId ||
    !match.providerSkuExternalId
  ) {
    throw new Error("JustTCG shadow matches require card, product, and SKU identities");
  }

  return {
    legacy_card_id: match.legacyCardId,
    provider_product_external_id: match.providerProductExternalId,
    provider_product_namespace: match.providerProductNamespace,
    provider_sku_external_id: match.providerSkuExternalId,
    provider_sku_namespace: match.providerSkuNamespace,
    tcgplayer_sku_id: match.tcgplayerSkuId ?? null,
    condition_code: normalizeProviderCondition(match.condition),
    printing: match.printing,
    amount: match.amount,
    observed_at: observedAt.toISOString(),
    source_set_slug: match.sourceSetSlug,
    raw_product: match.rawProduct,
    raw_variant: match.rawVariant,
  };
}

export async function writeJustTcgShadowPrices(options: {
  supabase: SupabaseLike;
  gameId: string;
  sourceCatalogKey: string;
  matches: JustTcgShadowPriceMatch[];
}): Promise<JustTcgShadowWriteResult> {
  const matches = dedupeMatches(options.matches);
  if (matches.length === 0) {
    return { attempted: 0, observationsWritten: 0, preferredPricesWritten: 0 };
  }
  const payload = matches.map(shadowRpcMatch);

  const { data: provider, error: providerError } = await options.supabase
    .from("data_providers")
    .select("id,is_active,normalized_api_version")
    .eq("code", "justtcg")
    .maybeSingle();
  if (providerError) resultError(providerError, "read JustTCG provider");
  if (!provider?.id) throw new Error("read JustTCG provider: provider seed is missing");
  if (provider.is_active === false) throw new Error("read JustTCG provider: provider is disabled");
  if (provider.normalized_api_version !== JUSTTCG_NORMALIZED_API_VERSION) {
    throw new Error(
      "read JustTCG provider: expected " +
      JUSTTCG_NORMALIZED_API_VERSION +
      ", got " +
      (provider.normalized_api_version || "unset")
    );
  }

  const ingestRunId = globalThis.crypto.randomUUID();
  const { error: runError } = await options.supabase
    .from("source_ingest_runs")
    .insert({
      id: ingestRunId,
      game_id: options.gameId,
      provider_id: provider.id,
      source_catalog_key: options.sourceCatalogKey,
      adapter_version: "justtcg_v1_shadow_rpc",
      provider_api_version: JUSTTCG_NORMALIZED_API_VERSION,
      job_key: "current_prices",
      status: "running",
      counts: { attempted: matches.length },
      started_at: new Date().toISOString(),
    });
  if (runError) resultError(runError, "create JustTCG source ingest run");

  try {
    const { data, error } = await options.supabase.rpc(
      "write_justtcg_shadow_price_batch",
      {
        p_game_id: options.gameId,
        p_provider_id: provider.id,
        p_source_catalog_key: options.sourceCatalogKey,
        p_ingest_run_id: ingestRunId,
        p_matches: payload,
      }
    );
    if (error) resultError(error, "write transactional JustTCG shadow batch");

    const result = (Array.isArray(data) ? data[0] : data) as {
      attempted?: number;
      observations_written?: number;
      preferred_prices_written?: number;
    } | null;
    const completed: JustTcgShadowWriteResult = {
      attempted: result?.attempted ?? matches.length,
      observationsWritten: result?.observations_written ?? 0,
      preferredPricesWritten: result?.preferred_prices_written ?? 0,
      ingestRunId,
    };
    const { error: completeError } = await options.supabase
      .from("source_ingest_runs")
      .update({
        status: "completed",
        counts: {
          attempted: completed.attempted,
          observations_written: completed.observationsWritten,
          preferred_prices_written: completed.preferredPricesWritten,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", ingestRunId)
      .eq("game_id", options.gameId)
      .eq("provider_id", provider.id);
    if (completeError) resultError(completeError, "complete JustTCG source ingest run");
    return completed;
  } catch (error) {
    await options.supabase
      .from("source_ingest_runs")
      .update({
        status: "failed",
        counts: { attempted: matches.length },
        error_summary: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", ingestRunId)
      .eq("game_id", options.gameId)
      .eq("provider_id", provider.id);
    throw error;
  }
}

// Retained temporarily for rollback comparison only. Production dual-write
// callers use the transactional RPC path above.
export async function writeJustTcgShadowPricesLegacy(options: {
  supabase: SupabaseLike;
  gameId: string;
  sourceCatalogKey: string;
  matches: JustTcgShadowPriceMatch[];
}): Promise<JustTcgShadowWriteResult> {
  const matches = dedupeMatches(options.matches);
  if (matches.length === 0) {
    return { attempted: 0, observationsWritten: 0, preferredPricesWritten: 0 };
  }

  const { data: provider, error: providerError } = await options.supabase
    .from("data_providers")
    .select("id")
    .eq("code", "justtcg")
    .maybeSingle();
  if (providerError) resultError(providerError, "read JustTCG provider");
  if (!provider?.id) throw new Error("read JustTCG provider: provider seed is missing");

  const legacyCardIds = Array.from(new Set(matches.map((row) => row.legacyCardId)));
  const { data: printingData, error: printingError } = await options.supabase
    .from("card_printings")
    .select("id,legacy_card_id")
    .eq("game_id", options.gameId)
    .in("legacy_card_id", legacyCardIds);
  if (printingError) resultError(printingError, "read bootstrapped printings");
  const printings = (printingData ?? []) as PrintingRow[];
  const printingByLegacyCard = new Map(printings.map((row) => [row.legacy_card_id, row.id]));
  const missingPrintings = legacyCardIds.filter((id) => !printingByLegacyCard.has(id));
  if (missingPrintings.length > 0) {
    throw new Error(`read bootstrapped printings: ${missingPrintings.length} legacy cards are unmapped`);
  }

  const printingIds = printings.map((row) => row.id);
  const { data: variantData, error: variantError } = await options.supabase
    .from("commercial_variants")
    .select("id,card_printing_id")
    .eq("game_id", options.gameId)
    .eq("variant_key", "legacy")
    .in("card_printing_id", printingIds);
  if (variantError) resultError(variantError, "read bootstrapped commercial variants");
  const variants = (variantData ?? []) as CommercialVariantRow[];
  const variantByPrinting = new Map(variants.map((row) => [row.card_printing_id, row.id]));
  const missingVariants = printingIds.filter((id) => !variantByPrinting.has(id));
  if (missingVariants.length > 0) {
    throw new Error(`read bootstrapped commercial variants: ${missingVariants.length} printings are unmapped`);
  }

  const productCandidates = new Map<string, JustTcgShadowPriceMatch>();
  for (const match of matches) {
    const key = externalKey(match.providerProductNamespace, match.providerProductExternalId);
    const existing = productCandidates.get(key);
    if (existing && existing.legacyCardId !== match.legacyCardId) {
      throw new Error(`JustTCG product collision in batch: ${key} matched more than one legacy card`);
    }
    productCandidates.set(key, match);
  }

  const productRows = Array.from(productCandidates.values()).map((match) => ({
    game_id: options.gameId,
    provider_id: provider.id,
    card_printing_id: printingByLegacyCard.get(match.legacyCardId),
    source_catalog_key: options.sourceCatalogKey,
    external_namespace: match.providerProductNamespace,
    external_id: match.providerProductExternalId,
    raw_payload: match.rawProduct,
    metadata: {
      adapter: "justtcg_v1_shadow",
      normalized_api_version: JUSTTCG_NORMALIZED_API_VERSION,
      source_set_slug: match.sourceSetSlug,
      legacy_card_id: match.legacyCardId,
    },
    updated_at: new Date().toISOString(),
  }));

  const productExternalIds = productRows.map((row) => row.external_id);
  const { data: existingProductData, error: existingProductError } = await options.supabase
    .from("provider_products")
    .select("id,external_namespace,external_id,card_printing_id")
    .eq("provider_id", provider.id)
    .eq("source_catalog_key", options.sourceCatalogKey)
    .in("external_id", productExternalIds);
  if (existingProductError) resultError(existingProductError, "read existing JustTCG products");
  for (const existing of (existingProductData ?? []) as ProviderProductRow[]) {
    const candidate = productCandidates.get(externalKey(existing.external_namespace, existing.external_id));
    const candidatePrintingId = candidate ? printingByLegacyCard.get(candidate.legacyCardId) : null;
    if (candidate && existing.card_printing_id && existing.card_printing_id !== candidatePrintingId) {
      throw new Error(
        `JustTCG product collision: ${existing.external_namespace}:${existing.external_id} is already mapped to another printing`
      );
    }
  }

  const { data: productData, error: productError } = await options.supabase
    .from("provider_products")
    .upsert(productRows, {
      onConflict: "provider_id,source_catalog_key,external_namespace,external_id",
    })
    .select("id,external_namespace,external_id,card_printing_id");
  if (productError) resultError(productError, "upsert JustTCG products");
  const products = (productData ?? []) as ProviderProductRow[];
  const productByExternalKey = new Map(
    products.map((row) => [externalKey(row.external_namespace, row.external_id), row.id])
  );
  for (const [key] of productCandidates) {
    if (!productByExternalKey.has(key)) {
      throw new Error(`JustTCG product upsert returned no ID for ${key}`);
    }
  }

  const skuCandidates = new Map<string, JustTcgShadowPriceMatch>();
  for (const match of matches) {
    const key = externalKey(match.providerSkuNamespace, match.providerSkuExternalId);
    const existing = skuCandidates.get(key);
    if (existing && existing.legacyCardId !== match.legacyCardId) {
      throw new Error(`JustTCG SKU collision in batch: ${key} matched more than one legacy card`);
    }
    skuCandidates.set(key, match);
  }
  const skuRows = Array.from(skuCandidates.values()).map((match) => {
    const printingId = printingByLegacyCard.get(match.legacyCardId)!;
    return {
      game_id: options.gameId,
      provider_id: provider.id,
      provider_product_id: productByExternalKey.get(
        externalKey(match.providerProductNamespace, match.providerProductExternalId)
      ),
      commercial_variant_id: variantByPrinting.get(printingId),
      source_catalog_key: options.sourceCatalogKey,
      external_namespace: match.providerSkuNamespace,
      external_id: match.providerSkuExternalId,
      condition_code: normalizeProviderCondition(match.condition),
      market_code: "global",
      market_region_code: null,
      currency_code: "USD",
      raw_payload: match.rawVariant,
      metadata: {
        adapter: "justtcg_v1_shadow",
        normalized_api_version: JUSTTCG_NORMALIZED_API_VERSION,
        printing_label: match.printing,
        source_set_slug: match.sourceSetSlug,
        tcgplayer_sku_id: match.tcgplayerSkuId ?? null,
      },
      updated_at: new Date().toISOString(),
    };
  });

  const skuExternalIds = skuRows.map((row) => row.external_id);
  const { data: existingSkuData, error: existingSkuError } = await options.supabase
    .from("provider_skus")
    .select("id,external_namespace,external_id,provider_product_id,commercial_variant_id")
    .eq("provider_id", provider.id)
    .eq("source_catalog_key", options.sourceCatalogKey)
    .in("external_id", skuExternalIds);
  if (existingSkuError) resultError(existingSkuError, "read existing JustTCG SKUs");
  for (const existing of (existingSkuData ?? []) as ProviderSkuRow[]) {
    const candidate = skuCandidates.get(externalKey(existing.external_namespace, existing.external_id));
    if (!candidate) continue;
    const candidatePrintingId = printingByLegacyCard.get(candidate.legacyCardId)!;
    const candidateProductId = productByExternalKey.get(
      externalKey(candidate.providerProductNamespace, candidate.providerProductExternalId)
    );
    const candidateVariantId = variantByPrinting.get(candidatePrintingId);
    if (
      (existing.provider_product_id && existing.provider_product_id !== candidateProductId) ||
      (existing.commercial_variant_id && existing.commercial_variant_id !== candidateVariantId)
    ) {
      throw new Error(
        `JustTCG SKU collision: ${existing.external_namespace}:${existing.external_id} is already mapped to another product or variant`
      );
    }
  }

  const { data: skuData, error: skuError } = await options.supabase
    .from("provider_skus")
    .upsert(skuRows, {
      onConflict: "provider_id,source_catalog_key,external_namespace,external_id",
    })
    .select("id,external_namespace,external_id,provider_product_id,commercial_variant_id");
  if (skuError) resultError(skuError, "upsert JustTCG SKUs");
  const skus = (skuData ?? []) as ProviderSkuRow[];
  const skuByExternalKey = new Map(
    skus.map((row) => [externalKey(row.external_namespace, row.external_id), row.id])
  );

  const months = Array.from(new Set(matches.map((match) => `${match.observedAt.slice(0, 7)}-01`)));
  for (const month of months) {
    const { error: partitionError } = await options.supabase.rpc(
      "ensure_price_observation_partition",
      { p_month: month }
    );
    if (partitionError) resultError(partitionError, `ensure price partition ${month}`);
  }

  const observationRows = matches.map((match) => {
    const printingId = printingByLegacyCard.get(match.legacyCardId)!;
    const commercialVariantId = variantByPrinting.get(printingId)!;
    const providerSkuId = skuByExternalKey.get(
      externalKey(match.providerSkuNamespace, match.providerSkuExternalId)
    );
    if (!providerSkuId) {
      throw new Error(`JustTCG SKU upsert returned no ID for ${match.providerSkuExternalId}`);
    }
    return toPriceObservationRow({
      gameId: options.gameId,
      commercialVariantId,
      providerId: provider.id,
      providerSkuId,
      externalObservationKey: `${match.providerSkuNamespace}:${match.providerSkuExternalId}:${match.observedAt}`,
      marketCode: "global",
      currencyCode: "USD",
      conditionCode: normalizeProviderCondition(match.condition),
      priceType: "market",
      amount: match.amount,
      observedAt: match.observedAt,
      sourceUpdatedAt: match.observedAt,
      metadata: {
        adapter: "justtcg_v1_shadow",
        normalized_api_version: JUSTTCG_NORMALIZED_API_VERSION,
        printing_label: match.printing,
        source_set_slug: match.sourceSetSlug,
        true_market_integration: "disabled",
      },
    });
  });

  const { data: observationData, error: observationError } = await options.supabase
    .from("price_observations")
    .upsert(observationRows, {
      onConflict: "provider_id,external_observation_key,observed_at",
    })
    .select(
      "id,game_id,commercial_variant_id,provider_id,provider_sku_id,market_code,currency_code,condition_code,price_type,amount,observed_at,source_updated_at,external_observation_key"
    );
  if (observationError) resultError(observationError, "upsert JustTCG price observations");
  const observations = (observationData ?? []) as ObservationRow[];

  const latestRows = observations.map((observation) => ({
    game_id: observation.game_id,
    commercial_variant_id: observation.commercial_variant_id,
    provider_id: observation.provider_id,
    provider_sku_id: observation.provider_sku_id,
    market_code: observation.market_code,
    market_region_scope: "",
    currency_code: observation.currency_code,
    condition_code: observation.condition_code,
    grade_key: buildGradeKey({
      gradeCompany: null,
      gradeValue: null,
      gradeLabel: null,
      gradeTierCode: null,
    }),
    grade_company: null,
    grade_value: null,
    grade_label: null,
    grade_tier_code: null,
    price_type: observation.price_type,
    amount: observation.amount,
    observation_id: observation.id,
    observation_observed_at: observation.observed_at,
    source_updated_at: observation.source_updated_at,
    updated_at: new Date().toISOString(),
  }));

  const { data: latestData, error: latestError } = await options.supabase
    .from("latest_price_facts")
    .upsert(latestRows, {
      onConflict: [
        "commercial_variant_id",
        "provider_id",
        "market_code",
        "market_region_scope",
        "currency_code",
        "condition_code",
        "grade_key",
        "price_type",
      ].join(","),
    })
    .select("id,commercial_variant_id");
  if (latestError) resultError(latestError, "upsert latest JustTCG price facts");
  const latestByVariant = new Map(
    (latestData ?? []).map((row: { id: string; commercial_variant_id: string }) => [
      row.commercial_variant_id,
      row.id,
    ])
  );

  const preferredRows = matches.map((match) => {
    const cardPrintingId = printingByLegacyCard.get(match.legacyCardId)!;
    const commercialVariantId = variantByPrinting.get(cardPrintingId)!;
    const latestPriceFactId = latestByVariant.get(commercialVariantId);
    if (!latestPriceFactId) {
      throw new Error(`latest price upsert returned no ID for variant ${commercialVariantId}`);
    }
    return {
      card_printing_id: cardPrintingId,
      game_id: options.gameId,
      legacy_card_id: match.legacyCardId,
      commercial_variant_id: commercialVariantId,
      latest_price_fact_id: latestPriceFactId,
      policy_key: "legacy_justtcg_near_mint",
      policy_version: 1,
      selected_at: new Date().toISOString(),
      metadata: {
        compatibility_projection: true,
        true_market_integration: "disabled",
      },
    };
  });
  const dedupedPreferredRows = Array.from(
    new Map(preferredRows.map((row) => [row.card_printing_id, row])).values()
  );

  const { error: preferredError } = await options.supabase
    .from("preferred_card_prices")
    .upsert(dedupedPreferredRows, { onConflict: "card_printing_id" });
  if (preferredError) resultError(preferredError, "upsert preferred JustTCG prices");

  return {
    attempted: matches.length,
    observationsWritten: observations.length,
    preferredPricesWritten: dedupedPreferredRows.length,
  };
}
