import Link from "next/link";
import RarityBadge from "@/components/ui/RarityBadge";
import CardHoverZoom from "@/components/ui/CardHoverZoom";
import FastCardImage from "@/components/ui/FastCardImage";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { formatPct } from "@/lib/utils";

export type TeaserCard = {
  id: string;
  card_image_id: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview?: string | null;
  set_code: string | null;
  set_name: string | null;
  card_number: string | null;
  market_avg: number | null;
  chg_1d: number | null;
};

function thumbBg(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 35%)`;
}

function formatUsd(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

/** Three-state delta variant — matches pctColor's neutral-zero semantics. */
function deltaState(chg: number | null | undefined): "up" | "down" | "flat" {
  if (chg == null || chg === 0) return "flat";
  return chg > 0 ? "up" : "down";
}

function CardThumb({ card }: { card: TeaserCard }) {
  const imageSrc = card.image_url_small ?? card.image_url;
  if (imageSrc) {
    return (
      <CardHoverZoom src={imageSrc} previewSrc={card.image_url_preview ?? card.image_url ?? imageSrc} alt={card.name}>
        <FastCardImage
          src={imageSrc}
          alt=""
          width={52}
          height={73}
          sizes="52px"
          className="c-teaser-thumb"
          loading="lazy"
          fetchPriority="low"
        />
      </CardHoverZoom>
    );
  }
  const initial = card.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="c-teaser-thumb"
      style={{ background: thumbBg(card.name), color: "var(--bg)" }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

type Props = {
  cards: TeaserCard[];
  gameRouteSlug?: string | null;
};

export default function HomeTeaserTable({
  cards,
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: Props) {
  return (
    <div className="c-teaser-table">
      <div className="c-teaser-thead">
        <span>#</span>
        <span>Card</span>
        <span>Rarity</span>
        <span className="right">Price</span>
        <span className="right">24h</span>
      </div>

      {cards.length === 0 ? (
        <div className="c-teaser-empty">Market data loading…</div>
      ) : (
        cards.map((card, i) => {
          const setLine = [card.set_code, card.set_name].filter(Boolean).join(" ");
          const cardNum = card.card_number ? ` · #${card.card_number}` : "";
          const state = deltaState(card.chg_1d);
          return (
            <Link
              key={card.id}
              href={gamePath(gameRouteSlug, `/card/${card.card_image_id ?? card.id}`)}
              prefetch={false}
              className="c-teaser-row"
            >
              <span className="c-teaser-rank">{String(i + 1).padStart(2, "0")}</span>
              <div className="c-teaser-card-cell">
                <CardThumb card={card} />
                <div className="c-teaser-card-meta">
                  <div className="c-teaser-card-name">{card.name}</div>
                  <div className="c-teaser-card-set">
                    {setLine}
                    {cardNum}
                  </div>
                </div>
              </div>
              <RarityBadge rarity={card.rarity} />
              <span className="c-teaser-price">{formatUsd(card.market_avg)}</span>
              <span className="c-teaser-delta-wrap">
                <span className={`c-teaser-delta ${state}`}>{formatPct(card.chg_1d)}</span>
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}
