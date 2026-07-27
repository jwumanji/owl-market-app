import Link from "next/link";
import { redirect } from "next/navigation";
import CharactersClient, { type CharacterData } from "@/app/characters/CharactersClient";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import { publicGameStaticParams } from "@/lib/static-game-params";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import {
  asRiftboundPayload,
  compareRiftboundChampionValue,
  riftboundChampionName,
  stringList,
} from "@/lib/games/riftbound-catalog";
import { tcgPlayerProductImageUrl } from "@/lib/market-sealed";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return publicGameStaticParams();
}

type CardRow = {
  id: string;
  card_number: string | null;
  name: string;
  rarity: string | null;
  variant_label: string | null;
  color: string[] | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  game_payload: Record<string, unknown> | null;
  sets: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
};

type PriceRow = {
  card_id: string;
  tcg_market: number | string | null;
  market_avg: number | string | null;
  chg_1d: number | string | null;
  chg_7d: number | string | null;
  chg_30d: number | string | null;
};

type ExternalIdRow = { card_id: string; external_id: string };

type ChampionCard = CardRow & {
  price: number | null;
  imageUrl: string | null;
  priceStats: PriceRow | null;
};

type ChampionGroup = {
  name: string;
  sets: Set<string>;
  domains: Set<string>;
  cards: ChampionCard[];
  signatures: number;
  totalValue: number;
  pricedCards: number;
  totalChg7d: number;
  chg7dCount: number;
  totalChg30d: number;
  chg30dCount: number;
};

const DOMAIN_COLORS: Record<string, { color: string; colorD: string; colorBd: string }> = {
  Fury: { color: "#C42A45", colorD: "rgba(196,42,69,0.14)", colorBd: "rgba(196,42,69,0.32)" },
  Calm: { color: "#137A8C", colorD: "rgba(19,122,140,0.14)", colorBd: "rgba(19,122,140,0.32)" },
  Mind: { color: "#2E6FD6", colorD: "rgba(46,111,214,0.14)", colorBd: "rgba(46,111,214,0.32)" },
  Body: { color: "#2D8A57", colorD: "rgba(45,138,87,0.16)", colorBd: "rgba(45,138,87,0.32)" },
  Chaos: { color: "#6E3AA6", colorD: "rgba(110,58,166,0.14)", colorBd: "rgba(110,58,166,0.32)" },
  Order: { color: "#E89512", colorD: "rgba(232,149,18,0.16)", colorBd: "rgba(232,149,18,0.38)" },
  Colorless: { color: "#6B6B69", colorD: "rgba(107,107,105,0.14)", colorBd: "rgba(107,107,105,0.3)" },
};

const FALLBACK_COLOR = DOMAIN_COLORS.Order;

function joinedSet(row: CardRow) {
  return Array.isArray(row.sets) ? row.sets[0] ?? null : row.sets;
}

function finiteNumber(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePrice(value: number | string | null) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trendSpark(current: number, change: number | null) {
  if (current <= 0) return [0, 0];
  const ratio = (change ?? 0) / 100;
  const start = current / Math.max(0.1, 1 + ratio);
  return Array.from({ length: 9 }, (_, index) => {
    const progress = index / 8;
    return +(start + (current - start) * progress).toFixed(2);
  });
}

async function loadRows(gameId: string) {
  const supabase = createCachedServiceClient();
  const cards: CardRow[] = [];
  const prices: PriceRow[] = [];
  const externalIds: ExternalIdRow[] = [];

  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from("cards")
      .select("id, card_number, name, rarity, variant_label, color, image_url, image_url_small, image_url_preview, game_payload, sets!cards_set_game_fk(code, name)")
      .eq("game_id", gameId)
      .eq("region", "en")
      .order("card_number")
      .range(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as CardRow[];
    cards.push(...page);
    if (page.length < 1000) break;
  }

  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from("price_stats")
      .select("card_id, tcg_market, market_avg, chg_1d, chg_7d, chg_30d")
      .eq("game_id", gameId)
      .range(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as PriceRow[];
    prices.push(...page);
    if (page.length < 1000) break;
  }

  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from("card_external_ids")
      .select("card_id, external_id")
      .eq("game_id", gameId)
      .eq("provider", "tcgplayer")
      .eq("external_type", "product_id")
      .range(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as ExternalIdRow[];
    externalIds.push(...page);
    if (page.length < 1000) break;
  }

  return { cards, prices, externalIds };
}

function groupChampions(cards: CardRow[], prices: PriceRow[], externalIds: ExternalIdRow[]) {
  const knownChampions = new Set<string>();
  for (const card of cards) {
    const payload = asRiftboundPayload(card.game_payload);
    const champion = riftboundChampionName({
      name: card.name,
      supertype: typeof payload.supertype === "string" ? payload.supertype : null,
      tags: stringList(payload.tags),
    });
    if (champion) knownChampions.add(champion);
  }

  const priceByCard = new Map(prices.map((row) => [row.card_id, row]));
  const productIdByCard = new Map(externalIds.map((row) => [row.card_id, row.external_id]));
  const groups = new Map<string, ChampionGroup>();

  for (const card of cards) {
    const payload = asRiftboundPayload(card.game_payload);
    const supertype = typeof payload.supertype === "string" ? payload.supertype : null;
    const tags = stringList(payload.tags);
    const champion = riftboundChampionName({ name: card.name, supertype, tags }, knownChampions)
      ?? tags.find((tag) => knownChampions.has(tag))
      ?? null;
    if (!champion) continue;

    const group = groups.get(champion) ?? {
      name: champion,
      sets: new Set<string>(),
      domains: new Set<string>(),
      cards: [],
      signatures: 0,
      totalValue: 0,
      pricedCards: 0,
      totalChg7d: 0,
      chg7dCount: 0,
      totalChg30d: 0,
      chg30dCount: 0,
    };

    const set = joinedSet(card);
    if (set?.code || set?.name) group.sets.add(set.code ?? set.name ?? "");
    for (const domain of stringList(card.color)) group.domains.add(domain);

    const priceStats = priceByCard.get(card.id) ?? null;
    const price = priceStats
      ? finitePrice(priceStats.tcg_market) ?? finitePrice(priceStats.market_avg)
      : null;
    const imageUrl = card.image_url_preview
      ?? card.image_url
      ?? tcgPlayerProductImageUrl(productIdByCard.get(card.id))
      ?? card.image_url_small;
    group.cards.push({ ...card, price, imageUrl, priceStats });

    if (supertype === "Signature") group.signatures += 1;
    if (price != null) {
      group.totalValue += price;
      group.pricedCards += 1;
    }

    const chg7d = priceStats ? finiteNumber(priceStats.chg_7d) : null;
    if (chg7d != null) {
      group.totalChg7d += chg7d;
      group.chg7dCount += 1;
    }
    const chg30d = priceStats ? finiteNumber(priceStats.chg_30d) : null;
    if (chg30d != null) {
      group.totalChg30d += chg30d;
      group.chg30dCount += 1;
    }
    groups.set(champion, group);
  }

  return [...groups.values()].sort(compareRiftboundChampionValue);
}

function clientChampion(group: ChampionGroup, gameRouteSlug: string): CharacterData {
  const domains = [...group.domains];
  const primaryDomain = domains[0] ?? "Order";
  const accent = DOMAIN_COLORS[primaryDomain] ?? FALLBACK_COLOR;
  const chg7d = group.chg7dCount ? +(group.totalChg7d / group.chg7dCount).toFixed(1) : null;
  const chg30d = group.chg30dCount ? +(group.totalChg30d / group.chg30dCount).toFixed(1) : null;
  const topCards = [...group.cards]
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((card) => ({
      name: card.name,
      set: joinedSet(card)?.code ?? joinedSet(card)?.name ?? "",
      rarity: card.rarity ?? card.variant_label ?? "Card",
      tcg: card.price ?? 0,
      avg: card.price ?? 0,
      chg1d: card.priceStats ? finiteNumber(card.priceStats.chg_1d) : null,
      chg7d: card.priceStats ? finiteNumber(card.priceStats.chg_7d) : null,
      chg30d: card.priceStats ? finiteNumber(card.priceStats.chg_30d) : null,
      spark: trendSpark(card.price ?? 0, card.priceStats ? finiteNumber(card.priceStats.chg_7d) : null),
      imageUrl: card.imageUrl,
      imageUrlSmall: card.image_url_small ?? card.imageUrl,
      imageUrlPreview: card.image_url_preview ?? card.imageUrl,
      cardImageId: null,
      href: gamePath(gameRouteSlug, `/catalog/${card.id}`),
    }));
  const linkedCardLabel = `${group.cards.length} linked ${group.cards.length === 1 ? "card" : "cards"}`;
  const setLabel = `${group.sets.size} ${group.sets.size === 1 ? "set" : "sets"}`;
  const signatureLabel = `${group.signatures} ${group.signatures === 1 ? "signature" : "signatures"}`;

  return {
    slug: slugify(group.name),
    name: group.name,
    subtitle: `${linkedCardLabel} · ${setLabel} · ${signatureLabel}`,
    faction: domains.length ? domains.slice(0, 3).join(" · ") : "Riftbound",
    tier: 3,
    indexValue: +group.totalValue.toFixed(2),
    cardCount: group.cards.length,
    chg7d,
    chg30d,
    up: (chg7d ?? 0) >= 0,
    topCards,
    color: accent.color,
    colorD: accent.colorD,
    colorBd: accent.colorBd,
    spark: trendSpark(group.totalValue, chg7d),
  };
}

export default async function RiftboundChampionsPage(props: {
  params: Promise<{ game: string }>;
}) {
  const { game: gameRouteSlug } = await props.params;
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: false,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return <section className="chars-page"><div className="ch-detail" style={{ padding: 28 }}><div className="ch-detail-name">Champions unavailable</div><div className="ch-detail-sub">{gameResult.error.message}</div></div></section>;
  }
  if (gameResult.game.slug !== "riftbound") redirect(gamePath(gameRouteSlug, "/characters"));

  let groups: ChampionGroup[] = [];
  let loadError: string | null = null;
  try {
    const { cards, prices, externalIds } = await loadRows(gameResult.game.id);
    groups = groupChampions(cards, prices, externalIds);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The champion index could not be loaded.";
  }

  const champions = groups.map((group) => clientChampion(group, gameRouteSlug));
  const linkedCards = new Set(groups.flatMap((group) => group.cards.map((card) => card.id))).size;
  const pricedCards = new Set(groups.flatMap((group) => group.cards.filter((card) => card.price != null).map((card) => card.id))).size;

  return (
    <section className="chars-page">
      <div className="breadcrumb">
        <Link href="/" prefetch={false}>Moon Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <Link href={gamePath(gameRouteSlug)} prefetch={false}>Riftbound</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--ink)" }}>Champions</span>
      </div>
      <div className="ph-eyebrow">Riftbound</div>
      <div className="ph-title">
        Champion <span>Index</span>
      </div>
      <div className="ph-sub">
        {champions.length} champions tracked &middot; Ranked by total set value &middot; {pricedCards.toLocaleString()} of {linkedCards.toLocaleString()} linked cards priced
      </div>

      {loadError ? (
        <div className="ch-detail" style={{ padding: 28, textAlign: "center" }}>
          <div className="ch-detail-name">Champion data is temporarily unavailable</div>
          <div className="ch-detail-sub" style={{ marginTop: 8 }}>{loadError}</div>
        </div>
      ) : (
        <CharactersClient
          characters={champions}
          gameRouteSlug={gameRouteSlug}
          mode="champions"
        />
      )}
    </section>
  );
}
