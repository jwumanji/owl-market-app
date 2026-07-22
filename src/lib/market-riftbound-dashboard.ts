import type { CharacterRankItem, DashboardCard } from "@/lib/types";

function championName(cardName: string) {
  const [name] = cardName.split(" - ", 1);
  return name?.trim() || cardName.trim();
}

function championSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function riftboundChampionSpotlights(
  cards: DashboardCard[],
  limit = 5,
): CharacterRankItem[] {
  const grouped = new Map<string, { name: string; cards: DashboardCard[] }>();

  for (const card of cards) {
    const name = championName(card.name);
    const key = name.toLocaleLowerCase("en-US");
    const group = grouped.get(key) ?? { name, cards: [] };
    group.cards.push(card);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map((group) => {
      const rankedCards = [...group.cards].sort(
        (a, b) => (b.market_avg ?? 0) - (a.market_avg ?? 0) || a.name.localeCompare(b.name),
      );
      const representative = rankedCards[0];
      const marketValue = group.cards.reduce((sum, card) => sum + (card.market_avg ?? 0), 0);

      return {
        name: group.name,
        slug: championSlug(group.name),
        index_value: +marketValue.toFixed(2),
        image_url: representative?.image_url ?? null,
        image_url_small: representative?.image_url_small ?? null,
        image_url_preview: representative?.image_url_preview ?? null,
        changes: {
          "7D": representative?.changes["7D"] ?? null,
        },
      } satisfies CharacterRankItem;
    })
    .filter((champion) => champion.index_value > 0)
    .sort((a, b) => b.index_value - a.index_value || a.name.localeCompare(b.name))
    .slice(0, limit);
}
