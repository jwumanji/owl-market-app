"use client";

import Link from "next/link";
import Image from "next/image";
import DashboardWidget from "./DashboardWidget";
import RarityBadge from "@/components/ui/RarityBadge";
import { formatPrice, formatPct, pctColor } from "@/lib/utils";
import { RARITY_META } from "@/app/rarities/rarities-data";
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
  const cls = "dash-row";
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls}>{children}</div>;
}

/* ── Card row (Trending / Gainers / Losers) ── */
function CardRow({ card, rank }: { card: DashboardCard; rank: number }) {
  return (
    <Row href={`/card/${card.card_image_id}`}>
      <span className="dash-rank">{rank}</span>
      {card.image_url_small && (
        <Image
          src={card.image_url_small}
          alt={card.name}
          width={32}
          height={45}
          className="dash-thumb"
          unoptimized
        />
      )}
      <span className="dash-info">
        <span className="dash-name">{card.name}</span>
        <span className="dash-meta">
          {card.set_code && <span className="dash-set">{card.set_code}</span>}
          {card.rarity && (
            <span className="dash-rarity-inline">
              <RarityBadge rarity={card.rarity} />
            </span>
          )}
        </span>
      </span>
      <span className="dash-values">
        <span className="dash-price">{formatPrice(card.market_avg)}</span>
        <span className={`dash-chg ${pctColor(card.chg_1d)}`}>{formatPct(card.chg_1d)}</span>
      </span>
    </Row>
  );
}

/* ── Rarity ranking row ── */
function RarityRow({ item, rank }: { item: RarityRankItem; rank: number }) {
  const meta = RARITY_META[item.code];
  return (
    <Row href="/rarities">
      <span className="dash-rank">{rank}</span>
      <span
        className="dash-rarity-badge"
        style={{ background: meta?.colorD ?? "rgba(255,255,255,0.05)", color: meta?.color ?? "#7A88A8" }}
      >
        {item.code}
      </span>
      <span className="dash-info">
        <span className="dash-name">{item.name}</span>
        <span className="dash-meta">
          Avg ${item.avg_price.toFixed(0)} &middot; {item.card_count} cards
        </span>
      </span>
      <span className={`dash-chg-solo ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
    </Row>
  );
}

/* ── Character row ── */
function CharacterRow({ item, rank }: { item: CharacterRankItem; rank: number }) {
  return (
    <Row href="/characters">
      <span className="dash-rank">{rank}</span>
      <span className="dash-info">
        <span className="dash-name">{item.name}</span>
        <span className="dash-meta dash-badges">
          {item.rarities.slice(0, 5).map((r) => (
            <RarityBadge key={r} rarity={r} />
          ))}
        </span>
      </span>
      <span className={`dash-chg-solo ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
    </Row>
  );
}

/* ── Sealed row ── */
function SealedRow({ item, rank }: { item: SealedRankItem; rank: number }) {
  return (
    <Row>
      <span className="dash-rank">{rank}</span>
      <span className="dash-info">
        <span className="dash-name">{item.name}</span>
        <span className="dash-meta">
          {item.set_code && <span>{item.set_code}</span>}
          {item.product_type && <span> &middot; {item.product_type}</span>}
        </span>
      </span>
      <span className="dash-values">
        <span className="dash-price">{formatPrice(item.market_avg)}</span>
        <span className={`dash-chg ${pctColor(item.chg_1d)}`}>{formatPct(item.chg_1d)}</span>
      </span>
    </Row>
  );
}

/* ── eBay sale row ── */
function EbayRow({ item }: { item: EbaySaleItem }) {
  return (
    <Row>
      <span className="dash-info">
        <span className="dash-name">{item.title ?? "Unknown card"}</span>
      </span>
      <span className="dash-price">{formatPrice(item.sale_price)}</span>
    </Row>
  );
}

/* ── Empty state ── */
function Empty() {
  return <div className="dash-empty">No data available</div>;
}

/* ══════════════════════════════
   Main Dashboard Component
══════════════════════════════ */
export default function MarketDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="dashboard-grid">
      {/* ── Top row: 3 columns ── */}
      <div className="dashboard-top">
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
      <div className="dashboard-bottom">
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
