import Link from "next/link";
import { redirect } from "next/navigation";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import { publicGameStaticParams } from "@/lib/static-game-params";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import {
  asRiftboundPayload,
  riftboundChampionName,
  stringList,
} from "@/lib/games/riftbound-catalog";
import "../riftbound-pages.css";

export const revalidate = 3600;

export function generateStaticParams() {
  return publicGameStaticParams();
}

type ChampionSearchParams = { q?: string };

type CardRow = {
  id: string;
  card_number: string | null;
  name: string;
  rarity: string | null;
  variant_label: string | null;
  game_payload: Record<string, unknown> | null;
  sets: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
};

type PriceRow = { card_id: string; tcg_market: number | string | null; market_avg: number | string | null };

type ChampionGroup = {
  name: string;
  sets: Set<string>;
  cards: Array<CardRow & { price: number | null }>;
  signatures: number;
  totalValue: number;
  pricedCards: number;
};

function joinedSet(row: CardRow) {
  return Array.isArray(row.sets) ? row.sets[0] ?? null : row.sets;
}

function finitePrice(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function cleanQuery(value: string | undefined) {
  return (value ?? "").trim().slice(0, 60);
}

async function loadRows(gameId: string) {
  const supabase = createCachedServiceClient();
  const cards: CardRow[] = [];
  const prices: PriceRow[] = [];

  for (let from = 0; ; from += 1000) {
    const result = await supabase
      .from("cards")
      .select("id, card_number, name, rarity, variant_label, game_payload, sets!cards_set_game_fk(code, name)")
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
      .select("card_id, tcg_market, market_avg")
      .eq("game_id", gameId)
      .range(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as PriceRow[];
    prices.push(...page);
    if (page.length < 1000) break;
  }

  return { cards, prices };
}

function groupChampions(cards: CardRow[], prices: PriceRow[]) {
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

  const priceByCard = new Map(prices.map((row) => [row.card_id, finitePrice(row.tcg_market) ?? finitePrice(row.market_avg)]));
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
      cards: [],
      signatures: 0,
      totalValue: 0,
      pricedCards: 0,
    };
    const set = joinedSet(card);
    if (set?.code || set?.name) group.sets.add(set.code ?? set.name ?? "");
    const price = priceByCard.get(card.id) ?? null;
    group.cards.push({ ...card, price });
    if (supertype === "Signature") group.signatures += 1;
    if (price != null) {
      group.totalValue += price;
      group.pricedCards += 1;
    }
    groups.set(champion, group);
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default async function RiftboundChampionsPage(props: {
  params: Promise<{ game: string }>;
  searchParams: Promise<ChampionSearchParams>;
}) {
  const [{ game: gameRouteSlug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: false,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return <main className="rb-page"><div className="rb-empty"><h2>Champions unavailable</h2><p>{gameResult.error.message}</p></div></main>;
  }
  if (gameResult.game.slug !== "riftbound") redirect(gamePath(gameRouteSlug, "/characters"));

  let cards: CardRow[] = [];
  let prices: PriceRow[] = [];
  let loadError: string | null = null;
  try {
    ({ cards, prices } = await loadRows(gameResult.game.id));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The champion index could not be loaded.";
  }

  const allChampions = groupChampions(cards, prices);
  const query = cleanQuery(searchParams.q);
  const champions = allChampions.filter((champion) =>
    (!query || champion.name.toLowerCase().includes(query.toLowerCase()))
  );
  const uniqueCards = new Set(allChampions.flatMap((champion) => champion.cards.map((card) => card.id))).size;
  const pricedCards = new Set(allChampions.flatMap((champion) => champion.cards.filter((card) => card.price != null).map((card) => card.id))).size;
  const signatureCards = allChampions.reduce((sum, champion) => sum + champion.signatures, 0);

  return (
    <main className="rb-page">
      <div className="rb-breadcrumb"><Link href={gamePath(gameRouteSlug, "/markets")}>Riftbound</Link> / Champions</div>
      <header className="rb-hero">
        <div className="rb-kicker">Collector index</div>
        <h1 className="rb-title">Every champion, one market view.</h1>
        <p className="rb-subtitle">Browse champion-linked cards, signatures, sets, and domains. Market totals will fill in automatically as Riftbound price coverage comes online.</p>
      </header>

      <section className="rb-stat-grid" aria-label="Champion summary">
        <div className="rb-stat"><span className="rb-stat-label">Champions</span><strong className="rb-stat-value">{allChampions.length.toLocaleString()}</strong><span className="rb-stat-note">indexed from card tags</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Linked cards</span><strong className="rb-stat-value">{uniqueCards.toLocaleString()}</strong><span className="rb-stat-note">across all treatments</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Signatures</span><strong className="rb-stat-value">{signatureCards.toLocaleString()}</strong><span className="rb-stat-note">premium champion printings</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Market coverage</span><strong className="rb-stat-value">{pricedCards ? pricedCards.toLocaleString() : "Pending"}</strong><span className="rb-stat-note">cards with live pricing</span></div>
      </section>

      {loadError ? <div className="rb-empty"><h2>Champion data is temporarily unavailable</h2><p>{loadError}</p></div> : (
        <>
          <form className="rb-toolbar" action={gamePath(gameRouteSlug, "/champions")}>
            <input className="rb-search" type="search" name="q" defaultValue={query} placeholder="Search a champion…" aria-label="Search champions" />
            <button className="rb-button" type="submit">Search</button>
          </form>

          <div className="rb-section-head">
            <div><h2 className="rb-section-title">Champion index</h2><p className="rb-section-copy">{champions.length} {champions.length === 1 ? "champion" : "champions"} in this view</p></div>
          </div>
          {champions.length ? <section className="rb-champion-grid">
            {champions.map((champion) => {
              const topCards = [...champion.cards].sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || a.name.localeCompare(b.name)).slice(0, 3);
              return <article className="rb-card" key={champion.name}>
                <div className="rb-card-head"><span className="rb-monogram" aria-hidden="true">{initials(champion.name)}</span><div><h3 className="rb-card-title">{champion.name}</h3><span className="rb-meta">RIFTBOUND CHAMPION</span></div></div>
                <div className="rb-metrics">
                  <div className="rb-metric"><strong>{champion.cards.length}</strong><span>Cards</span></div>
                  <div className="rb-metric"><strong>{champion.sets.size}</strong><span>Sets</span></div>
                  <div className="rb-metric"><strong>{champion.signatures}</strong><span>Signatures</span></div>
                </div>
                <div className="rb-value"><small>Total linked-card market value</small>{champion.pricedCards ? money(champion.totalValue) : "Pricing pending"}</div>
                <ul className="rb-card-links">
                  {topCards.map((card) => <li key={card.id}><Link href={gamePath(gameRouteSlug, `/catalog/${card.id}`)}><span>{card.name}</span><span>{card.price != null ? money(card.price) : card.rarity ?? "—"}</span></Link></li>)}
                </ul>
              </article>;
            })}
          </section> : <div className="rb-empty"><h2>No champions found</h2><p>Try clearing the search or choosing a different domain.</p></div>}
        </>
      )}
    </main>
  );
}
