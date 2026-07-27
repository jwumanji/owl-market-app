/**
 * Riot owns canonical Riftbound identity, rules text, and official assets.
 *
 * Riot exposes the concrete catalog contract after an application is approved,
 * so this module intentionally defines Moon Market's boundary without guessing
 * an endpoint or payload shape. The eventual provider adapter should normalize
 * approved responses into these records before reconciliation.
 */

export const RIFTBOUND_CATALOG_AUTHORITIES = {
  cardIdentity: "riot_riftbound",
  cardText: "riot_riftbound",
  cardAssets: "riot_riftbound",
  commercialIdentity: "tcgplayer",
  marketPrice: "justtcg",
  reconciliation: "riftcodex",
} as const;

export interface RiotRiftboundAdapterConfig {
  apiKey: string;
  catalogUrl: string;
}

export interface CanonicalRiftboundSetRecord {
  riotSetId: string;
  name: string;
  code: string | null;
  releaseDate: string | null;
  status: "preview" | "released" | "retired";
  sourceUpdatedAt: string | null;
  payload: Record<string, unknown>;
}

export interface CanonicalRiftboundCardRecord {
  riotCardId: string;
  riotSetId: string;
  name: string;
  collectorNumber: string;
  rulesText: string | null;
  rarity: string | null;
  treatment: string | null;
  language: string;
  status: "preview" | "released" | "retired";
  officialImageUrl: string | null;
  sourceUpdatedAt: string | null;
  payload: Record<string, unknown>;
}

export function getRiotRiftboundAdapterConfig(
  env: NodeJS.ProcessEnv = process.env
): RiotRiftboundAdapterConfig | null {
  const apiKey = env.RIOT_RIFTBOUND_API_KEY?.trim();
  const catalogUrl = env.RIOT_RIFTBOUND_CATALOG_URL?.trim();
  if (!apiKey || !catalogUrl) return null;
  return { apiKey, catalogUrl };
}

export function riotRiftboundAdapterStatus(env: NodeJS.ProcessEnv = process.env) {
  return getRiotRiftboundAdapterConfig(env) ? "configured" : "awaiting_api_key";
}
