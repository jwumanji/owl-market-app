"use client";

import Link from "next/link";
import { CardRow } from "@/lib/types";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { formatPrice, formatPct } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";

function changeVariant(pct: number | null | undefined): "up" | "down" | "flat" {
  if (pct == null || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

export default function MarketGrid({
  cards,
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  cards: CardRow[];
  gameRouteSlug?: string | null;
}) {
  return (
    <div className="mgrid">
      {cards.map((card, i) => {
        const ps = card.price_stats;
        const rank = String(i + 1).padStart(2, "0");
        return (
          <Link
            key={card.id}
            href={gamePath(gameRouteSlug, `/card/${card.card_image_id}`)}
            className="mgrid-card"
          >
            <div className="mgrid-img">
              <span className="mgrid-rank">#{rank}</span>
              <span className="mgrid-rar">
                <RarityBadge rarity={card.rarity} />
              </span>
              {card.image_url ? (
                <img
                  src={card.image_url}
                  alt={card.name}
                  loading="lazy"
                />
              ) : (
                <div className="mgrid-img-placeholder" />
              )}
            </div>

            <div className="mgrid-info">
              <p className="mgrid-name" title={card.name}>{card.name}</p>
              <p className="mgrid-series">{card.sets?.name ?? "Unknown Set"}</p>
              <p className="mgrid-price">{formatPrice(ps?.market_avg)}</p>
            </div>

            <div className="mgrid-changes">
              <span className={`mgrid-change ${changeVariant(ps?.chg_1d)}`}>
                <span className="label">24h</span>{formatPct(ps?.chg_1d)}
              </span>
              <span className={`mgrid-change ${changeVariant(ps?.chg_7d)}`}>
                <span className="label">7d</span>{formatPct(ps?.chg_7d)}
              </span>
              <span className={`mgrid-change ${changeVariant(ps?.chg_30d)}`}>
                <span className="label">30d</span>{formatPct(ps?.chg_30d)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
