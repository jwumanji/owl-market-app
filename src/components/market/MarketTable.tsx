"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CardRow, SetInfo, SortKey } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import FilterBar from "./FilterBar";
import RarityBadge from "../ui/RarityBadge";
import ChangeCell from "../ui/ChangeCell";

interface MarketTableProps {
  cards: CardRow[];
  sets: SetInfo[];
  initialSet?: string;
}

export default function MarketTable({ cards, sets, initialSet = "all" }: MarketTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState(initialSet);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("value");

  const handleSetChange = (setId: string) => {
    setSelectedSet(setId);
    if (setId === "all") {
      router.push("/markets");
    } else {
      router.push(`/markets?set=${setId}`);
    }
  };

  const filtered = useMemo(() => {
    let result = cards;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name?.toLowerCase().includes(q));
    }

    if (selectedSet !== "all") {
      result = result.filter((c) => c.sets?.id === selectedSet);
    }

    if (selectedRarities.length > 0) {
      result = result.filter((c) => c.rarity && selectedRarities.includes(c.rarity));
    }

    return [...result].sort((a, b) => {
      const pa = a.price_stats;
      const pb = b.price_stats;
      switch (sortBy) {
        case "value":
          return (pb?.market_avg ?? 0) - (pa?.market_avg ?? 0);
        case "chg_1d":
          return (pb?.chg_1d ?? 0) - (pa?.chg_1d ?? 0);
        case "chg_7d":
          return (pb?.chg_7d ?? 0) - (pa?.chg_7d ?? 0);
        case "chg_30d":
          return (pb?.chg_30d ?? 0) - (pa?.chg_30d ?? 0);
        default:
          return 0;
      }
    });
  }, [cards, search, selectedSet, selectedRarities, sortBy]);

  return (
    <>
      <FilterBar
        sets={sets}
        search={search}
        onSearchChange={setSearch}
        selectedSet={selectedSet}
        onSetChange={handleSetChange}
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
          <tbody>
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
                  No cards found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
