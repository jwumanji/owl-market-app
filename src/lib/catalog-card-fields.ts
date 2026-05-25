export type CatalogCardFieldRow = {
  card_type?: string | null;
  color?: string[] | string | null;
  cost?: number | string | null;
  game_payload?: Record<string, unknown> | null;
  types?: string[] | string | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asText).filter((item): item is string => Boolean(item));
  }
  const text = asText(value);
  return text ? [text] : [];
}

function asColorList(value: unknown): string[] {
  const colorNames = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];

  return asTextList(value).flatMap((item) => {
    const matches = colorNames.filter((color) => new RegExp(`\\b${color}\\b`, "i").test(item));
    return matches.length > 1 ? matches : [item];
  });
}

export function catalogCardPayload(row: CatalogCardFieldRow): JsonRecord {
  return asRecord(asRecord(row.game_payload).card);
}

export function catalogSourcePayload(row: CatalogCardFieldRow): JsonRecord {
  return asRecord(asRecord(row.game_payload).source);
}

export function catalogCardType(row: CatalogCardFieldRow) {
  const payload = catalogCardPayload(row);
  return (
    asText(payload.type) ??
    asText(payload.supertype) ??
    asText(payload.card_type) ??
    asText(row.card_type) ??
    "Catalog card"
  );
}

export function catalogCardDomains(row: CatalogCardFieldRow) {
  const payload = catalogCardPayload(row);
  const explicitDomains = asTextList(payload.domains);
  const colors = asColorList(row.color);
  const tags = [
    ...asTextList(payload.types),
    ...asTextList(payload.tags),
    ...asTextList(row.types),
  ];
  const domains = explicitDomains.length > 0
    ? [...explicitDomains, ...colors, ...tags]
    : [...colors, ...(colors.length > 0 ? [] : tags)];

  return domains.length > 0 ? Array.from(new Set(domains)).join(", ") : null;
}

export function catalogCardCost(row: CatalogCardFieldRow) {
  const payload = catalogCardPayload(row);
  return asText(payload.cost) ?? asText(payload.energy) ?? asText(row.cost) ?? "—";
}
