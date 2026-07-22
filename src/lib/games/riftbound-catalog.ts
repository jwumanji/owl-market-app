export const RIFTBOUND_DOMAINS = [
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
] as const;

export const RIFTBOUND_CARD_TYPES = [
  "Unit",
  "Spell",
  "Gear",
  "Legend",
  "Battlefield",
  "Rune",
] as const;

type RiftboundCardIdentity = {
  name: string;
  supertype?: string | null;
  tags?: string[] | null;
};

export function asRiftboundPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const payload = value as Record<string, unknown>;
  const card = payload.card;
  return card && typeof card === "object" && !Array.isArray(card)
    ? (card as Record<string, unknown>)
    : payload;
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function riftboundChampionName(
  card: RiftboundCardIdentity,
  knownChampions: ReadonlySet<string> = new Set(),
) {
  if (card.supertype === "Champion") {
    return card.name.split(" - ")[0]?.replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
  }

  if (card.supertype !== "Signature") return null;
  const tags = card.tags ?? [];
  return tags.find((tag) => knownChampions.has(tag)) ?? tags[0] ?? null;
}
