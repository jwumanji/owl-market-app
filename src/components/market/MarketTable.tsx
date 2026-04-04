"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CardRow, SetInfo, SortKey } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import FilterBar from "./FilterBar";
import RarityBadge from "../ui/RarityBadge";
import ChangeCell from "../ui/ChangeCell";

interface MarketTableProps {
  cards: CardRow[];
  sets: SetInfo[];
}

export default function MarketTable({ cards: initialCards, sets }: MarketTableProps) {
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
      const params = new URLSearchParams({ set, sort, limit: "20" });
      const res = await fetch(`/api/markets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards(selectedSet, sortBy);
  }, [selectedSet, sortBy, fetchCards]);

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

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-border bg-surface text-text-2 text-[11px] font-mono uppercase tracking-wider">
              <th className="w-[48px] py-3 px-3 text-center">#</th>
              <th className="w-[56px] py-3 px-1" />
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
                onClick={() => router.push(`/card/${card.card_image_id}`)}
                className="border-b border-border hover:bg-surf2 cursor-pointer transition-colors duration-100"
              >
                {/* Rank */}
                <td className="py-3 px-3 text-center text-text-2 font-mono text-sm">
                  {i + 1}
                </td>

                {/* Thumbnail */}
                <td className="py-2 px-1">
                  {card.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.image_url_small ?? card.image_url}
                      alt={card.name ?? ""}
                      width={40}
                      height={56}
                      loading="lazy"
                      className="rounded-sm object-cover w-[40px] h-[56px]"
                    />
                  ) : (
                    <div className="w-[40px] h-[56px] rounded-sm bg-surf3" />
                  )}
                </td>

                {/* Card name + set + rarity */}
                <td className="py-3 px-3 overflow-hidden">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-text truncate">
                      {card.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {card.sets?.code && (
                        <span className="text-[10px] font-mono text-text-2 bg-surf2 px-1.5 py-0.5 rounded">
                          {card.sets.code}
                        </span>
                      )}
                      <RarityBadge rarity={card.rarity} />
                    </div>
                  </div>
                </td>

                {/* Price */}
                <td className="py-3 px-3 text-right font-mono text-sm text-owl">
                  {formatPrice(card.price_stats?.market_avg)}
                </td>

                {/* % changes */}
                <ChangeCell value={card.price_stats?.chg_1d} />
                <ChangeCell value={card.price_stats?.chg_7d} />
                <ChangeCell value={card.price_stats?.chg_30d} />

                {/* TCG */}
                <td className="py-3 px-3 text-right font-mono text-sm text-text-2">
                  {formatPrice(card.price_stats?.tcg_market)}
                </td>

                {/* eBay */}
                <td className="py-3 px-3 text-right font-mono text-sm text-text-2">
                  {formatPrice(card.price_stats?.ebay_avg)}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-text-3 text-sm">
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
