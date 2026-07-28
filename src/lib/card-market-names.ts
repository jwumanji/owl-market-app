export type MarketNamedCard = {
  name: string;
  market_name?: string | null;
};

export const MAX_MARKET_NAME_LENGTH = 120;
export const MAX_MARKET_ALIASES = 30;

export function cleanMarketName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_MARKET_NAME_LENGTH);
}
export function normalizeMarketAlias(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarketAliases(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];

  const aliases = new Map<string, string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const alias = cleanMarketName(entry);
    const normalized = normalizeMarketAlias(alias);
    if (normalized.length < 2 || aliases.has(normalized)) continue;
    aliases.set(normalized, alias);
    if (aliases.size >= MAX_MARKET_ALIASES) break;
  }

  return Array.from(aliases.values());
}

export function cardDisplayName(card: MarketNamedCard) {
  return cleanMarketName(card.market_name) || card.name;
}

export function cardOfficialIdentity(card: MarketNamedCard) {
  const marketName = cleanMarketName(card.market_name);
  if (!marketName || normalizeMarketAlias(marketName) === normalizeMarketAlias(card.name)) return null;
  return card.name;
}

export function validateMarketNameInput(value: unknown) {
  const marketName = cleanMarketName(value);
  if (marketName.length < 2) return { error: "Market name must contain at least 2 characters.", marketName: null };
  return { error: null, marketName };
}
