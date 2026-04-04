"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice, formatPct, pctColor } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";

// Rarity display order: rarest first
const RARITY_ORDER = ["MR", "SP", "SEC", "TR", "AA", "L", "SR", "R", "UC", "C"];

const RARITY_LABELS: Record<string, string> = {
  MR: "Manga Rare",
  SP: "Special",
  SEC: "Secret Rare",
  TR: "Treasure Rare",
  AA: "Alternate Art",
  L: "Leader",
  SR: "Super Rare",
  R: "Rare",
  UC: "Uncommon",
  C: "Common",
};

interface PriceStats {
  market_avg: number | null;
  tcg_market: number | null;
  ebay_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
}

interface Card {
  id: string;
  card_image_id: string;
  card_number: string | null;
  name: string;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_type: string | null;
  color: string[];
  image_url: string | null;
  image_url_small: string | null;
  price_stats: PriceStats | null;
}

interface SetInfo {
  id: string;
  slug: string;
  code: string;
  name: string;
  series: string | null;
  year: number | null;
}

export default function SetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [set, setSet] = useState<SetInfo | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sets/${slug}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Set not found" : "Failed to load set");
          return;
        }
        const data = await res.json();
        setSet(data.set);
        setCards(data.cards);
      } catch {
        setError("Failed to load set data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // Group cards by rarity, sorted by price within each group
  const groupedByRarity = RARITY_ORDER.map((rarity) => {
    const rarityCards = cards
      .filter((c) => c.rarity === rarity)
      .sort(
        (a, b) =>
          (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
      );
    return { rarity, label: RARITY_LABELS[rarity] ?? rarity, cards: rarityCards };
  }).filter((g) => g.cards.length > 0);

  // Cards with unknown/null rarity
  const unknownRarity = cards
    .filter((c) => !c.rarity || !RARITY_ORDER.includes(c.rarity))
    .sort(
      (a, b) =>
        (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
    );

  // Summary stats
  const totalValue = cards.reduce(
    (sum, c) => sum + (c.price_stats?.market_avg ?? 0),
    0
  );
  const pricedCards = cards.filter((c) => c.price_stats?.market_avg);

  if (loading) {
    return (
      <section className="max-w-[1400px] mx-auto px-4 py-8">
        <p className="text-text-2 text-sm">Loading set data...</p>
      </section>
    );
  }

  if (error || !set) {
    return (
      <section className="max-w-[1400px] mx-auto px-4 py-8">
        <p className="text-loss text-sm">{error ?? "Set not found"}</p>
        <Link href="/sets" className="text-owl text-sm mt-4 inline-block">
          &larr; Back to Sets
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-3 mb-4 font-mono">
        <Link href="/sets" className="hover:text-owl transition-colors">
          Sets
        </Link>
        <span>/</span>
        <span className="text-text">{set.code}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          [{set.code}] {set.name}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-text-2">
          {set.series && <span>{set.series}</span>}
          {set.year && <span>{set.year}</span>}
          <span>{cards.length} cards</span>
          <span>{pricedCards.length} priced</span>
          <span className="text-owl font-mono">
            Total: {formatPrice(totalValue)}
          </span>
        </div>
      </div>

      {/* Rarity groups */}
      {groupedByRarity.map((group) => (
        <div key={group.rarity} className="mb-8">
          {/* Rarity header */}
          <div className="flex items-center gap-3 mb-3">
            <RarityBadge rarity={group.rarity} />
            <h2 className="text-lg font-semibold">{group.label}</h2>
            <span className="text-text-3 text-xs font-mono">
              {group.cards.length} card{group.cards.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Cards table */}
          <div className="overflow-x-auto rounded-lg border border-border mb-2">
            <table className="w-full" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-border bg-surface text-text-2 text-[11px] font-mono uppercase tracking-wider">
                  <th className="w-[48px] py-2 px-3 text-center">#</th>
                  <th className="w-[56px] py-2 px-1" />
                  <th className="py-2 px-3 text-left">Card</th>
                  <th className="w-[90px] py-2 px-3 text-right">Price</th>
                  <th className="w-[75px] py-2 px-3 text-right">24h</th>
                  <th className="w-[75px] py-2 px-3 text-right">7d</th>
                  <th className="w-[75px] py-2 px-3 text-right">30d</th>
                  <th className="w-[90px] py-2 px-3 text-right">TCG</th>
                  <th className="w-[90px] py-2 px-3 text-right">eBay</th>
                </tr>
              </thead>
              <tbody>
                {group.cards.map((card, i) => (
                  <tr
                    key={card.id}
                    onClick={() => router.push(`/card/${card.card_image_id}`)}
                    className="border-b border-border hover:bg-surf2 cursor-pointer transition-colors duration-100"
                  >
                    <td className="py-2 px-3 text-center text-text-2 font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="py-1 px-1">
                      {card.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image_url_small ?? card.image_url}
                          alt={card.name ?? ""}
                          width={36}
                          height={50}
                          loading="lazy"
                          className="rounded-sm object-cover w-[36px] h-[50px]"
                        />
                      ) : (
                        <div className="w-[36px] h-[50px] rounded-sm bg-surf3" />
                      )}
                    </td>
                    <td className="py-2 px-3 overflow-hidden">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-text truncate">
                          {card.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {card.card_number && (
                            <span className="text-[10px] font-mono text-text-3">
                              {card.card_number}
                            </span>
                          )}
                          {card.variant_label && (
                            <span className="text-[10px] font-mono text-text-3 bg-surf2 px-1 py-0.5 rounded">
                              {card.variant_label}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-owl">
                      {formatPrice(card.price_stats?.market_avg)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_1d)}`}>
                      {formatPct(card.price_stats?.chg_1d)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_7d)}`}>
                      {formatPct(card.price_stats?.chg_7d)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_30d)}`}>
                      {formatPct(card.price_stats?.chg_30d)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-text-2">
                      {formatPrice(card.price_stats?.tcg_market)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-text-2">
                      {formatPrice(card.price_stats?.ebay_avg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Unknown rarity */}
      {unknownRarity.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-semibold text-text-2">Other</h2>
            <span className="text-text-3 text-xs font-mono">
              {unknownRarity.length} card{unknownRarity.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border mb-2">
            <table className="w-full" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-border bg-surface text-text-2 text-[11px] font-mono uppercase tracking-wider">
                  <th className="w-[48px] py-2 px-3 text-center">#</th>
                  <th className="w-[56px] py-2 px-1" />
                  <th className="py-2 px-3 text-left">Card</th>
                  <th className="w-[90px] py-2 px-3 text-right">Price</th>
                  <th className="w-[75px] py-2 px-3 text-right">24h</th>
                  <th className="w-[75px] py-2 px-3 text-right">7d</th>
                  <th className="w-[75px] py-2 px-3 text-right">30d</th>
                  <th className="w-[90px] py-2 px-3 text-right">TCG</th>
                  <th className="w-[90px] py-2 px-3 text-right">eBay</th>
                </tr>
              </thead>
              <tbody>
                {unknownRarity.map((card, i) => (
                  <tr
                    key={card.id}
                    onClick={() => router.push(`/card/${card.card_image_id}`)}
                    className="border-b border-border hover:bg-surf2 cursor-pointer transition-colors duration-100"
                  >
                    <td className="py-2 px-3 text-center text-text-2 font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="py-1 px-1">
                      {card.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.image_url_small ?? card.image_url}
                          alt={card.name ?? ""}
                          width={36}
                          height={50}
                          loading="lazy"
                          className="rounded-sm object-cover w-[36px] h-[50px]"
                        />
                      ) : (
                        <div className="w-[36px] h-[50px] rounded-sm bg-surf3" />
                      )}
                    </td>
                    <td className="py-2 px-3 overflow-hidden">
                      <span className="text-sm font-medium text-text truncate block">
                        {card.name}
                      </span>
                      <span className="text-[10px] font-mono text-text-3">
                        {card.card_number} {card.rarity ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-owl">
                      {formatPrice(card.price_stats?.market_avg)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_1d)}`}>
                      {formatPct(card.price_stats?.chg_1d)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_7d)}`}>
                      {formatPct(card.price_stats?.chg_7d)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${pctColor(card.price_stats?.chg_30d)}`}>
                      {formatPct(card.price_stats?.chg_30d)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-text-2">
                      {formatPrice(card.price_stats?.tcg_market)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-text-2">
                      {formatPrice(card.price_stats?.ebay_avg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
