"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CardRow, SetInfo, SortKey } from "@/lib/types";
import { gamePath, gameQueryValue } from "@/lib/game-routes";
import { formatPrice } from "@/lib/utils";
import FilterBar from "./FilterBar";
import RarityBadge from "../ui/RarityBadge";
import ChangeCell from "../ui/ChangeCell";
import CardHoverZoom from "../ui/CardHoverZoom";

interface MarketTableProps {
  cards: CardRow[];
  sets: SetInfo[];
  gameRouteSlug?: string | null;
}

export default function MarketTable({ cards: initialCards, sets, gameRouteSlug }: MarketTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState("all");
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [cards, setCards] = useState<CardRow[]>(initialCards);
  const [loading, setLoading] = useState(false);

  const fetchCards = useCallback(async (set: string, sort: SortKey) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ set, sort, limit: "20", game: gameQueryValue(gameRouteSlug) });
      const res = await fetch(`/api/markets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data);
      }
    } finally {
      setLoading(false);
    }
  }, [gameRouteSlug]);

  useEffect(() => {
    if (selectedSet === "all" && sortBy === "value") {
      setCards(initialCards);
      setLoading(false);
      return;
    }
    fetchCards(selectedSet, sortBy);
  }, [initialCards, selectedSet, sortBy, fetchCards]);

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name?.toLowerCase().includes(q));
    }

    if (selectedRarities.length > 0) {
      result = result.filter((c) => c.rarity && selectedRarities.includes(c.rarity));
    }

    return result;
  }, [cards, search, selectedRarities]);

  return (
    <>
      <FilterBar
        sets={sets}
        search={search}
        onSearchChange={setSearch}
        selectedSet={selectedSet}
        onSetChange={setSelectedSet}
        selectedRarities={selectedRarities}
        onRaritiesChange={setSelectedRarities}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className="overflow-x-auto rounded-c-md border-[1.5px] border-ink bg-bg-2">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b-[1.5px] border-ink bg-bg-3 text-ink-2 text-[11px] font-mono-2 font-semibold uppercase tracking-wider">
              <th className="w-[48px] py-3 px-3 text-center">#</th>
              <th className="w-[64px] py-3 px-1" />
              <th className="py-3 px-3 text-left">Card</th>
              <th className="w-[100px] py-3 px-3 text-right">Price</th>
              <th className="w-[80px] py-3 px-3 text-right">24h</th>
              <th className="w-[80px] py-3 px-3 text-right">7d</th>
              <th className="w-[80px] py-3 px-3 text-right">30d</th>
              <th className="w-[100px] py-3 px-3 text-right">TCG</th>
              <th className="w-[100px] py-3 px-3 text-right">eBay</th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {filtered.map((card, i) => (
              <tr
                key={card.id}
                onClick={() => router.push(gamePath(gameRouteSlug, `/card/${card.card_image_id}`))}
                className="border-t border-bg-3 hover:bg-bg-3 cursor-pointer transition-colors duration-100"
              >
                {/* Rank */}
                <td className="py-3 px-3 text-center text-ink-2 font-mono-2 text-[12px] font-semibold">
                  {i + 1}
                </td>

                {/* Thumbnail */}
                <td className="py-2 px-1">
                  {card.image_url ? (
                    <CardHoverZoom
                      src={card.image_url ?? card.image_url_small ?? null}
                      alt={card.name ?? ""}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.image_url_small ?? card.image_url}
                        alt={card.name ?? ""}
                        width={52}
                        height={73}
                        loading="lazy"
                        className="rounded-[4px] border-[1.5px] border-ink object-cover w-[52px] h-[73px]"
                      />
                    </CardHoverZoom>
                  ) : (
                    <div className="w-[52px] h-[73px] rounded-[4px] border-[1.5px] border-ink bg-bg-3" />
                  )}
                </td>

                {/* Card name + set + rarity */}
                <td className="py-3 px-3 overflow-hidden">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-grotesk font-semibold text-ink truncate">
                      {card.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {card.sets?.code && (
                        <span className="text-[9px] font-mono-2 font-semibold text-ink-2 bg-bg-3 px-1.5 py-0.5 rounded tracking-[0.04em]">
                          {card.sets.code}
                        </span>
                      )}
                      <RarityBadge rarity={card.rarity} />
                    </div>
                  </div>
                </td>

                {/* Price */}
                <td className="py-3 px-3 text-right font-mono-2 text-sm font-semibold text-ink tabular-nums">
                  {formatPrice(card.price_stats?.market_avg)}
                </td>

                {/* % changes */}
                <ChangeCell value={card.price_stats?.chg_1d} />
                <ChangeCell value={card.price_stats?.chg_7d} />
                <ChangeCell value={card.price_stats?.chg_30d} />

                {/* TCG */}
                <td className="py-3 px-3 text-right font-mono-2 text-[12.5px] text-ink-2 tabular-nums">
                  {formatPrice(card.price_stats?.tcg_market)}
                </td>

                {/* eBay */}
                <td className="py-3 px-3 text-right font-mono-2 text-[12.5px] text-ink-2 tabular-nums">
                  {formatPrice(card.price_stats?.ebay_avg)}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="py-12 text-center text-ink-3 text-sm font-mono-2 uppercase tracking-[0.08em]"
                >
                  {loading ? "Loading..." : "No cards found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
