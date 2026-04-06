"use client";

import Link from "next/link";
import { CardRow } from "@/lib/types";
import { formatPrice, formatPct, pctColor } from "@/lib/utils";

export default function MarketGrid({ cards }: { cards: CardRow[] }) {
  return (
    <div className="mgrid">
      {cards.map((card) => {
        const ps = card.price_stats;
        return (
          <Link
            key={card.id}
            href={`/card/${card.card_image_id}`}
            className="mgrid-card"
          >
            <div className="mgrid-img">
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
              <span className={pctColor(ps?.chg_1d)}>
                24h {formatPct(ps?.chg_1d)}
              </span>
              <span className={pctColor(ps?.chg_7d)}>
                7d {formatPct(ps?.chg_7d)}
              </span>
              <span className={pctColor(ps?.chg_30d)}>
                30d {formatPct(ps?.chg_30d)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
