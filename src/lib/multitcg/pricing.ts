export const PRICE_TYPES = [
  "true_market",
  "market",
  "low",
  "mid",
  "high",
  "sold",
  "listing",
] as const;

export type PriceType = (typeof PRICE_TYPES)[number];

export interface PriceObservationInput {
  gameId: string;
  commercialVariantId: string;
  providerId: string;
  providerSkuId?: string | null;
  ingestRunId?: string | null;
  sourceRecordId?: string | null;
  externalObservationKey: string;
  marketCode: string;
  marketRegionCode?: string | null;
  currencyCode: string;
  conditionCode: string;
  gradeCompany?: string | null;
  gradeValue?: number | null;
  gradeLabel?: string | null;
  gradeTierCode?: string | null;
  priceType: PriceType;
  amount: number;
  observedAt: string;
  sourceUpdatedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export function buildGradeKey(input: Pick<
  PriceObservationInput,
  "gradeCompany" | "gradeValue" | "gradeLabel" | "gradeTierCode"
>): string {
  const company = input.gradeCompany?.trim().toUpperCase() ?? "";
  const value = input.gradeValue == null ? "" : String(input.gradeValue);
  const tier = input.gradeTierCode?.trim().toUpperCase() ?? "";
  const label = input.gradeLabel?.trim().toUpperCase() ?? "";
  if (!company && !value && !tier && !label) return "ungraded";
  return [company || "unknown", value || "na", tier || "standard", label || "unlabeled"].join(":");
}

export function toPriceObservationRow(input: PriceObservationInput) {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Price observation amount must be a finite non-negative number.");
  }
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) {
    throw new Error(`Invalid ISO currency code: ${input.currencyCode}`);
  }
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error(`Invalid observedAt timestamp: ${input.observedAt}`);
  }

  return {
    game_id: input.gameId,
    commercial_variant_id: input.commercialVariantId,
    provider_id: input.providerId,
    provider_sku_id: input.providerSkuId ?? null,
    ingest_run_id: input.ingestRunId ?? null,
    source_record_id: input.sourceRecordId ?? null,
    external_observation_key: input.externalObservationKey,
    market_code: input.marketCode,
    market_region_code: input.marketRegionCode ?? null,
    currency_code: input.currencyCode,
    condition_code: input.conditionCode,
    grade_company: input.gradeCompany ?? null,
    grade_value: input.gradeValue ?? null,
    grade_label: input.gradeLabel ?? null,
    grade_tier_code: input.gradeTierCode ?? null,
    price_type: input.priceType,
    amount: input.amount,
    observed_at: observedAt.toISOString(),
    source_updated_at: input.sourceUpdatedAt ?? null,
    metadata: input.metadata ?? {},
  };
}
