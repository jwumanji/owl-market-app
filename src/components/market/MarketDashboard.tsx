"use client";

import Link from "next/link";
import Image from "next/image";
import DashboardWidget from "./DashboardWidget";
import RarityBadge from "@/components/ui/RarityBadge";
import CardHoverZoom from "@/components/ui/CardHoverZoom";
import { formatPrice, formatPct, pctColor } from "@/lib/utils";
import type {
  DashboardData,
  DashboardCard,
  RarityRankItem,
  CharacterRankItem,
  SealedRankItem,
  EbaySaleItem,
} from "@/lib/types";

/* ── Shared row wrapper ── */
function Row({ href, children }: { href?: string; children: React.ReactNode }) {
  const cls = "c-drow";
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls}>{children}</div>;
}

/* ── Card row (Trending / Gainers / Losers) ── */
function CardRow({ card, rank }: { card: DashboardCard; rank: number }) {
  return (
    <Row href={`/card/${card.card_image_id}`}>
      <span className="c-drank">{rank}</span>
      {card.image_url_small ? (
        <CardHoverZoom src={card.image_url_small} alt={card.name}>
          <Image
            src={card.image_url_small}
            alt={card.name}
            width={42}
            height={59}
            className="c-dthumb"
            unoptimized
          />
        </CardHoverZoom>
      ) : (
        <span className="c-dthumb" aria-hidden="true">
          {card.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="c-dinfo">
        <span className="c-dname">{card.name}</span>
        <span className="c-dmeta">
          {card.set_code && <span className="c-dsetcode">{card.set_code}</span>}
          {card.rarity && <RarityBadge rarity={card.rarity} />}
        </span>
      </span>
      <span className="c-dvalues">
        <span className="c-dprice">{formatPrice(card.market_avg)}</span>
        <span className={`c-dchg ${pctColor(card.chg_1d)}`}>{formatPct(card.chg_1d)}</span>
      </span>
    </Row>
  );
}

/* ── Rarity ranking row ── */
function RarityRow({ item, rank }: { item: RarityRankItem; rank: number }) {
  return (
    <Row href="/rarities">
      <span className="c-drank">{rank}</span>
      <RarityBadge rarity={item.code} />
      <span className="c-dinfo">
        <span className="c-dname">{item.name}</span>
        <span className="c-dmeta">
          Avg ${item.avg_price.toFixed(0)} &middot; {item.card_count} cards
        </span>
      </span>
      <span className={`c-dchg-solo ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
    </Row>
  );
}

/* ── Character row ── */
function CharacterRow({ item, rank }: { item: CharacterRankItem; rank: number }) {
  return (
    <Row href="/characters">
      <span className="c-drank">{rank}</span>
      <span className="c-dinfo">
        <span className="c-dname">{item.name}</span>
        <span className="c-dmeta c-dbadges">
          {item.rarities.slice(0, 5).map((r) => (
            <RarityBadge key={r} rarity={r} />
          ))}
        </span>
      </span>
      <span className={`c-dchg-solo ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
    </Row>
  );
}

/* ── Sealed row ── */
function SealedRow({ item, rank }: { item: SealedRankItem; rank: number }) {
  return (
    <Row>
      <span className="c-drank">{rank}</span>
      <span className="c-dinfo">
        <span className="c-dname">{item.name}</span>
        <span className="c-dmeta">
          {item.set_code && <span>{item.set_code}</span>}
          {item.product_type && <span> &middot; {item.product_type}</span>}
        </span>
      </span>
      <span className="c-dvalues">
        <span className="c-dprice">{formatPrice(item.market_avg)}</span>
        <span className={`c-dchg ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
      </span>
    </Row>
  );
}

/* ── eBay sale row ── */
function EbayRow({ item }: { item: EbaySaleItem }) {
  return (
    <Row>
      <span className="c-dinfo">
        <span className="c-dname">{item.title ?? "Unknown card"}</span>
      </span>
      <span className="c-dprice">{formatPrice(item.sale_price)}</span>
    </Row>
  );
}

/* ── Empty state ── */
function Empty() {
  return <div className="c-dempty">No data available</div>;
}

/* ══════════════════════════════
   Main Dashboard Component
══════════════════════════════ */
export default function MarketDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="c-dashboard">
      {/* ── Top row: 3 columns ── */}
      <div className="c-dash-top">
        <DashboardWidget icon="🔥" title="Trending" viewAllHref="/markets?sort=chg_1d">
          {data.trending.length > 0
            ? data.trending.map((c, i) => <CardRow key={c.id} card={c} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>

        <DashboardWidget icon="🚀" title="Top Gainers" viewAllHref="/markets?sort=chg_1d">
          {data.topGainers.length > 0
            ? data.topGainers.map((c, i) => <CardRow key={c.id} card={c} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>

        <DashboardWidget icon="📉" title="Top Losers" viewAllHref="/markets?sort=chg_1d">
          {data.topLosers.length > 0
            ? data.topLosers.map((c, i) => <CardRow key={c.id} card={c} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>
      </div>

      {/* ── Bottom row: 4 columns ── */}
      <div className="c-dash-bottom">
        <DashboardWidget icon="🏆" title="Rarity Ranking" viewAllHref="/rarities">
          {data.rarityRanking.length > 0
            ? data.rarityRanking.map((r, i) => <RarityRow key={r.code} item={r} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>

        <DashboardWidget icon="⭐" title="Top Characters" viewAllHref="/characters">
          {data.topCharacters.length > 0
            ? data.topCharacters.map((c, i) => <CharacterRow key={c.slug} item={c} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>

        <DashboardWidget icon="📦" title="Sealed Boxes" viewAllHref="/rarities">
          {data.sealedBoxes.length > 0
            ? data.sealedBoxes.map((s, i) => <SealedRow key={i} item={s} rank={i + 1} />)
            : <Empty />}
        </DashboardWidget>

        <DashboardWidget icon="🛒" title="Top eBay Sales">
          {data.topEbaySales.length > 0
            ? data.topEbaySales.map((e, i) => <EbayRow key={i} item={e} />)
            : <Empty />}
        </DashboardWidget>
      </div>
    </div>
  );
}
