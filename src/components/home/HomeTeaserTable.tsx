import Link from "next/link";

export type TeaserCard = {
  id: string;
  name: string;
  rarity: string | null;
  image_url_small: string | null;
  set_code: string | null;
  set_name: string | null;
  card_number: string | null;
  market_avg: number | null;
  chg_1d: number | null;
};

const RARITY_VARIANTS: Record<string, string> = {
  C: "c-teaser-rar-c",
  UC: "c-teaser-rar-uc",
  R: "c-teaser-rar-r",
  SR: "c-teaser-rar-sr",
  L: "c-teaser-rar-l",
  SEC: "c-teaser-rar-sec",
  MR: "c-teaser-rar-mr",
  SP: "c-teaser-rar-sp",
  TR: "c-teaser-rar-tr",
};

const GRADIENT_RARITIES = new Set(["SEC", "MR", "SP", "TR"]);

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

function formatDelta(chg: number | null): string {
  if (chg == null) return "—";
  const sign = chg >= 0 ? "+" : "−";
  return `${sign}${Math.abs(chg).toFixed(1)}%`;
}

function RarityChip({ rarity }: { rarity: string | null }) {
  if (!rarity) return <span className="c-teaser-rar c-teaser-rar-c">—</span>;
  const variant = RARITY_VARIANTS[rarity] ?? "c-teaser-rar-c";
  const useGradient = GRADIENT_RARITIES.has(rarity);
  return (
    <span className={`c-teaser-rar ${variant}`}>
      {useGradient ? <span>{rarity}</span> : rarity}
    </span>
  );
}

function CardThumb({ card }: { card: TeaserCard }) {
  if (card.image_url_small) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.image_url_small}
        alt=""
        className="c-teaser-thumb"
        loading="lazy"
      />
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
};

export default function HomeTeaserTable({ cards }: Props) {
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
          const isUp = (card.chg_1d ?? 0) >= 0;
          return (
            <Link
              key={card.id}
              href={`/card/${card.id}`}
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
              <RarityChip rarity={card.rarity} />
              <span className="c-teaser-price">{formatUsd(card.market_avg)}</span>
              <span className="c-teaser-delta-wrap">
                <span className={`c-teaser-delta ${isUp ? "up" : "down"}`}>
                  {formatDelta(card.chg_1d)}
                </span>
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}
