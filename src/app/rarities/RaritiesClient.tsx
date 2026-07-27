"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import FastCardImage from "@/components/ui/FastCardImage";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import {
  RARITIES as FALLBACK_RARITIES,
  TOP_5_SLUGS,
  TIER_2_SLUGS,
  type RarityCard,
  type RarityData,
} from "./rarities-data";
import "./rarities-page.css";

type RarityViewMode = "list" | "grid";

function safeNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCards(rarity: RarityData) {
  return Array.isArray(rarity.topCards) ? rarity.topCards : [];
}

function rarityClass(rarity: string | null | undefined): string {
  const r = (rarity ?? "").toUpperCase();
  if (r.includes("MANGA") || r === "MR") return "rb-mr";
  if (r.includes("GOLDEN") || r === "GMR") return "rb-gmr";
  if (r.includes("SECRET") || r === "SEC") return "rb-sec";
  if (r.includes("SPECIAL") || r === "SP") return "rb-sp";
  if (r.includes("TREAS") || r === "TR") return "rb-tr";
  if (r.includes("ALT") || r === "AA") return "rb-aa";
  if (r.includes("SUPER") || r === "SR") return "rb-sr";
  if (r.includes("LEADER")) return "rb-sr";
  if (r === "SAR") return "rb-sar";
  if (r === "PROMO") return "rb-promo";
  if (r === "SEALED") return "rb-sealed";
  return "rb-r";
}

function buildTieredRarities(apiData: RarityData[], fallback: RarityData[], useFallbackOrdering: boolean) {
  if (!useFallbackOrdering) {
    const all = apiData;
    return { top5: all.slice(0, 5), tier2: all.slice(5, 10), all };
  }

  const lookup = new Map<string, RarityData>();
  for (const r of apiData) lookup.set(r.slug, r);
  for (const r of fallback) if (!lookup.has(r.slug)) lookup.set(r.slug, r);

  const top5 = TOP_5_SLUGS.map((s) => lookup.get(s)).filter(Boolean) as RarityData[];
  const tier2 = TIER_2_SLUGS.map((s) => lookup.get(s)).filter(Boolean) as RarityData[];
  return { top5, tier2, all: [...top5, ...tier2] };
}

function gameDisplayName(gameRouteSlug: string) {
  if (gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG) return "One Piece TCG";
  return gameRouteSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: number | string | null | undefined, options: { compact?: boolean; decimals?: number } = {}) {
  const amount = safeNumber(value);
  if (amount <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.decimals ?? (amount >= 100 ? 0 : 2),
    minimumFractionDigits: options.decimals ?? 0,
  }).format(amount);
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatChange(value: number | string | null | undefined) {
  if (value == null) return "—";
  const amount = safeNumber(value);
  if (amount === 0) return "0%";
  return `${amount > 0 ? "+" : ""}${amount}%`;
}

function changeClass(value: number | string | null | undefined) {
  if (value == null) return "flat";
  const amount = safeNumber(value);
  if (amount === 0) return "flat";
  return amount > 0 ? "up" : "dn";
}

function cardHref(card: RarityCard, catalogOnly: boolean, gameRouteSlug: string) {
  if (catalogOnly && card.cardId) return gamePath(gameRouteSlug, `/catalog/${card.cardId}`);
  if (card.cardImageId) return gamePath(gameRouteSlug, `/card/${card.cardImageId}`);
  return undefined;
}

function ViewIcon({ type }: { type: RarityViewMode }) {
  return (
    <span className={`rar-view-icon ${type}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function RarityPerformanceCard({
  rarity,
  rank,
  active,
  onSelect,
}: {
  rarity: RarityData;
  rank: number;
  active: boolean;
  onSelect: (slug: string) => void;
}) {
  const catalogOnly = rarity.pricingStatus === "catalog_only";
  const cardCount = safeNumber(rarity.cardCount);

  return (
    <button
      type="button"
      className={`rar-rarity-card${active ? " active" : ""}`}
      style={{ ["--rar-card-color" as string]: rarity.color || "var(--gold)" }}
      onClick={() => onSelect(rarity.slug)}
    >
      <div className="rar-card-topline">
        <span className="rank-n">#{rank}</span>
        <span className={`rb ${rarityClass(rarity.code)}`}>{rarity.code}</span>
      </div>
      <div className="rar-card-name">{rarity.name}</div>
      <div className="rar-card-sub">{catalogOnly ? "Catalog only" : rarity.subtitle}</div>
      <div className="rar-card-value">{catalogOnly ? "—" : formatCurrency(rarity.indexValue, { compact: true })}</div>
      <div className="rar-card-metrics">
        <div>
          <span>Avg</span>
          <strong>{catalogOnly ? "—" : formatCurrency(rarity.avgCardPrice)}</strong>
        </div>
        <div>
          <span>Cards</span>
          <strong>{formatCount(cardCount)}</strong>
        </div>
        <div>
          <span>7D</span>
          <strong className={changeClass(rarity.chg7d)}>{catalogOnly ? "—" : formatChange(rarity.chg7d)}</strong>
        </div>
        <div>
          <span>30D</span>
          <strong className={changeClass(rarity.chg30d)}>{catalogOnly ? "—" : formatChange(rarity.chg30d)}</strong>
        </div>
      </div>
    </button>
  );
}

function RarityPerformanceTable({
  rows,
  activeSlug,
  onSelect,
  viewMode,
  onViewModeChange,
}: {
  rows: RarityData[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  viewMode: RarityViewMode;
  onViewModeChange: (mode: RarityViewMode) => void;
}) {
  const rankedRows = [...rows].sort((a, b) => {
    const averageA = safeNumber(a.avgCardPrice);
    const averageB = safeNumber(b.avgCardPrice);
    const pricedA = averageA > 0 ? 1 : 0;
    const pricedB = averageB > 0 ? 1 : 0;
    if (pricedA !== pricedB) return pricedB - pricedA;
    if (averageA !== averageB) return averageB - averageA;
    return safeNumber(b.indexValue) - safeNumber(a.indexValue);
  });

  return (
    <section className="rar-panel rar-performance-panel">
      <div className="rar-panel-head">
        <div>
          <div className="section-title">Rarity Performance</div>
          <div className="section-sub">Ranked by average card value · Compare count and growth across rarity groups</div>
        </div>
        <div className="rar-panel-controls">
          <div className="rar-view-toggle" aria-label="Rarity display mode">
            <button
              type="button"
              className={viewMode === "list" ? "active" : undefined}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              title="List view"
              onClick={() => onViewModeChange("list")}
            >
              <ViewIcon type="list" />
            </button>
            <button
              type="button"
              className={viewMode === "grid" ? "active" : undefined}
              aria-label="Card view"
              aria-pressed={viewMode === "grid"}
              title="Card view"
              onClick={() => onViewModeChange("grid")}
            >
              <ViewIcon type="grid" />
            </button>
          </div>
          <div className="rar-timeframe-pills" aria-label="Timeframe options">
            <span>24H</span>
            <span className="active">7D</span>
            <span>30D</span>
            <span>90D</span>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
      <div className="rar-table-wrap">
        <table className="rar-performance-table">
          <colgroup>
            <col className="rar-col-rank" />
            <col className="rar-col-rarity" />
            <col className="rar-col-index" />
            <col className="rar-col-avg" />
            <col className="rar-col-cards" />
            <col className="rar-col-change" />
            <col className="rar-col-change" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Rarity</th>
              <th className="r">Index Value</th>
              <th className="r">Avg Card</th>
              <th className="r">Cards</th>
              <th className="r">7D</th>
              <th className="r">30D</th>
            </tr>
          </thead>
          <tbody>
            {rankedRows.map((rarity, index) => {
              const active = rarity.slug === activeSlug;
              const catalogOnly = rarity.pricingStatus === "catalog_only";
              const cardCount = safeNumber(rarity.cardCount);

              return (
                <tr
                  key={rarity.slug}
                  className={active ? "active" : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(rarity.slug)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(rarity.slug);
                    }
                  }}
                >
                  <td className="rank-n">{index + 1}</td>
                  <td>
                    <div className="rar-rarity-cell">
                      <span className={`rb ${rarityClass(rarity.code)}`}>{rarity.code}</span>
                      <div>
                        <div className="rar-rarity-name">{rarity.name}</div>
                        <div className="rar-rarity-sub">{catalogOnly ? "Catalog only" : rarity.subtitle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="r rar-num">{catalogOnly ? "—" : formatCurrency(rarity.indexValue, { compact: true })}</td>
                  <td className="r rar-num">{catalogOnly ? "—" : formatCurrency(rarity.avgCardPrice)}</td>
                  <td className="r rar-num">{formatCount(cardCount)}</td>
                  <td className={`r rar-change ${changeClass(rarity.chg7d)}`}>{catalogOnly ? "—" : formatChange(rarity.chg7d)}</td>
                  <td className={`r rar-change ${changeClass(rarity.chg30d)}`}>{catalogOnly ? "—" : formatChange(rarity.chg30d)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
        <div className="rar-performance-grid">
          {rankedRows.map((rarity, index) => (
            <RarityPerformanceCard
              key={rarity.slug}
              rarity={rarity}
              rank={index + 1}
              active={rarity.slug === activeSlug}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SelectedRarityHero({ rarity }: { rarity: RarityData }) {
  const catalogOnly = rarity.pricingStatus === "catalog_only";
  const indexValue = safeNumber(rarity.indexValue);
  const hasPricing = indexValue > 0 && !catalogOnly;
  const cardCount = safeNumber(rarity.cardCount);

  return (
    <section className="rar-index-hero" style={{ ["--rar-color" as string]: rarity.color || "var(--gold)", ["--rar-glow" as string]: rarity.colorD || "rgba(232,160,32,0.18)" }}>
      <div className="rar-index-main">
        <div className="rar-index-label">
          <span className={`rb ${rarityClass(rarity.code)}`}>{rarity.code}</span>
          <span>{rarity.name} Index Value</span>
        </div>
        <div className="rar-index-value">{hasPricing ? formatCurrency(indexValue, { decimals: 2 }) : "—"}</div>
        <div className="rar-index-sub">{rarity.subtitle}</div>
      </div>
      <div className="rar-index-metrics">
        <div className="rar-metric-card">
          <span>Avg Card</span>
          <strong>{hasPricing ? formatCurrency(rarity.avgCardPrice) : "—"}</strong>
        </div>
        <div className="rar-metric-card">
          <span>7D</span>
          <strong className={changeClass(rarity.chg7d)}>{hasPricing ? formatChange(rarity.chg7d) : "—"}</strong>
        </div>
        <div className="rar-metric-card">
          <span>30D</span>
          <strong className={changeClass(rarity.chg30d)}>{hasPricing ? formatChange(rarity.chg30d) : "—"}</strong>
        </div>
        <div className="rar-metric-card">
          <span>Cards</span>
          <strong>{formatCount(cardCount)}</strong>
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({
  card,
  index,
  rarity,
  catalogOnly,
  gameRouteSlug,
}: {
  card: RarityCard;
  index: number;
  rarity: RarityData;
  catalogOnly: boolean;
  gameRouteSlug: string;
}) {
  const href = cardHref(card, catalogOnly, gameRouteSlug);
  const indexValue = safeNumber(rarity.indexValue);
  const share = indexValue > 0 ? (safeNumber(card.avg) / indexValue) * 100 : 0;
  const content = (
    <>
      <div className="rar-feature-top">
        <span>#{index + 1} highest value</span>
        <span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span>
      </div>
      <div className="rar-feature-main">
        {card.imageSmall ? (
          <FastCardImage src={card.imageSmall} alt="" className="rar-feature-img" width={56} height={78} sizes="56px" loading="lazy" fetchPriority="low" />
        ) : (
          <span className="rar-feature-placeholder" />
        )}
        <div className="rar-feature-copy">
          <div className="rar-feature-name">{card.name}</div>
          <span className="card-set-tag">{card.set}</span>
        </div>
      </div>
      <div className="rar-feature-bottom">
        <div>
          <div className="rar-feature-price">{catalogOnly ? "—" : formatCurrency(card.avg)}</div>
          <div className="rar-feature-share">{share > 0 ? `${share.toFixed(1)}% of ${rarity.code} index` : "Catalog preview"}</div>
        </div>
        <span className={`rar-change ${changeClass(card.chg30d)}`}>{catalogOnly ? "—" : formatChange(card.chg30d)}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="rar-feature-card" prefetch={false}>
        {content}
      </Link>
    );
  }

  return <div className="rar-feature-card">{content}</div>;
}

function FullRankingTable({
  rarity,
  catalogOnly,
  gameRouteSlug,
}: {
  rarity: RarityData;
  catalogOnly: boolean;
  gameRouteSlug: string;
}) {
  const cards = safeCards(rarity);

  return (
    <div className="cards-table-wrap rar-full-ranking">
      <table className="cards-table">
        <colgroup>
          <col className="c0" />
          <col className="c1" />
          <col className="c2" />
          <col className="c3" />
          <col className="c4" />
          <col className="c5" />
          <col className="c6" />
          <col className="c7" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Card</th>
            <th>Rarity</th>
            <th className="r">Avg Price</th>
            <th className="r">TCGPlayer</th>
            <th className="r">24H</th>
            <th className="r">7D</th>
            <th className="r">30D</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card, i) => {
            const href = cardHref(card, catalogOnly, gameRouteSlug);
            return (
              <tr key={`${card.name}-${i}`} className={href ? "tr-link" : undefined}>
                <td className="rank-n">{i + 1}</td>
                <td>
                  <div className="card-cell">
                    {card.imageSmall ? (
                      <FastCardImage src={card.imageSmall} alt="" className="card-thumb" width={28} height={38} sizes="28px" loading="lazy" fetchPriority="low" />
                    ) : (
                      <span className="card-art" />
                    )}
                    <div style={{ minWidth: 0 }}>
                      {href ? (
                        <Link href={href} className="rar-card-name-link" prefetch={false}>
                          {card.name}
                        </Link>
                      ) : (
                        <div className="card-name">{card.name}</div>
                      )}
                      <div className="rar-card-meta">
                        <span className="card-set-tag">{card.set}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span>
                </td>
                <td className="price-r">{catalogOnly ? "—" : formatCurrency(card.avg)}</td>
                <td className="price-r">{catalogOnly ? "—" : formatCurrency(card.tcg)}</td>
                <td className={`chg-r ${changeClass(card.chg1d)}`}>{catalogOnly ? "—" : formatChange(card.chg1d)}</td>
                <td className={`chg-r ${changeClass(card.chg7d)}`}>{catalogOnly ? "—" : formatChange(card.chg7d)}</td>
                <td className={`chg-r ${changeClass(card.chg30d)}`}>{catalogOnly ? "—" : formatChange(card.chg30d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectedRarityCards({
  rarity,
  gameRouteSlug,
  showFullRanking,
  onToggleFullRanking,
}: {
  rarity: RarityData;
  gameRouteSlug: string;
  showFullRanking: boolean;
  onToggleFullRanking: () => void;
}) {
  const catalogOnly = rarity.pricingStatus === "catalog_only";
  const topCards = safeCards(rarity);
  const featuredCards = topCards.slice(0, 3);

  return (
    <section className="rar-panel rar-top-cards-panel">
      <div className="rar-panel-head">
        <div>
          <div className="section-title">
            Top Cards <span>Within {rarity.name}</span>
          </div>
          <div className="section-sub">
            {featuredCards.length > 0
              ? `Showing the top ${featuredCards.length} ${rarity.code} cards by average market price`
              : "No card ranking data is available yet"}
          </div>
        </div>
        <Link href={gamePath(gameRouteSlug, catalogOnly ? "/catalog" : "/markets")} className="section-action">
          Open {catalogOnly ? "catalog" : "markets"} &rarr;
        </Link>
      </div>

      {featuredCards.length > 0 ? (
        <>
          <div className="rar-feature-grid">
            {featuredCards.map((card, index) => (
              <FeaturedCard
                key={`${card.name}-${index}`}
                card={card}
                index={index}
                rarity={rarity}
                catalogOnly={catalogOnly}
                gameRouteSlug={gameRouteSlug}
              />
            ))}
          </div>

          {topCards.length > 3 && !showFullRanking ? (
            <div className="rar-ranking-preview">
              {topCards.slice(3, 6).map((card, index) => (
                <div className="rar-preview-row" key={`${card.name}-${index}`}>
                  <span className="rank-n">{index + 4}</span>
                  <span className="rar-preview-name">{card.name}</span>
                  <span className="rar-num">{catalogOnly ? "—" : formatCurrency(card.avg)}</span>
                  <span className={`rar-change ${changeClass(card.chg30d)}`}>{catalogOnly ? "—" : formatChange(card.chg30d)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {topCards.length > 3 ? (
            <div className="rar-ranking-actions">
              <button type="button" className="rar-see-all-btn" onClick={onToggleFullRanking}>
                {showFullRanking ? "Hide Full Ranking" : `View Full Ranking (${topCards.length} cards)`}
              </button>
            </div>
          ) : null}

          {showFullRanking ? (
            <FullRankingTable rarity={rarity} catalogOnly={catalogOnly} gameRouteSlug={gameRouteSlug} />
          ) : null}
        </>
      ) : (
        <div className="rar-coming-soon">
          <p>Card ranking for <strong>{rarity.name}</strong> is coming soon.</p>
        </div>
      )}
    </section>
  );
}

export default function RaritiesClient({
  initialRarities,
  gameRouteSlug,
}: {
  initialRarities: RarityData[];
  gameRouteSlug: string;
}) {
  const isDefaultGame = gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const [activeRarity, setActiveRarity] = useState<string>(() =>
    isDefaultGame ? TOP_5_SLUGS[0] : initialRarities[0]?.slug ?? TOP_5_SLUGS[0]
  );
  const [rarityViewMode, setRarityViewMode] = useState<RarityViewMode>("grid");
  const [showFullRanking, setShowFullRanking] = useState(false);

  const { top5, all } = buildTieredRarities(initialRarities, FALLBACK_RARITIES, isDefaultGame);
  const active = all.find((x) => x.slug === activeRarity) || top5[0];
  // Parity with the pre-SSR page: a game whose loader returned no rarities kept
  // showing the "Loading live data..." subline alongside the empty-state notice.
  const showEmpty = !isDefaultGame && all.length === 0;

  const selectRarity = useCallback((slug: string) => {
    setActiveRarity(slug);
    setShowFullRanking(false);
  }, []);

  return (
    <section className="rar-page">
      <div className="breadcrumb">
        <Link href="/" prefetch={false}>Moon Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--ink)" }}>Rarities</span>
      </div>
      <div className="ph-eyebrow">{gameDisplayName(gameRouteSlug)}</div>
      <div className="ph-title">
        Rarity <span>Index</span>
      </div>
      <div className="ph-sub">
        {showEmpty
          ? "Loading live data..."
          : `${all.length} categories tracked · Compare rarity growth · Drill into top cards`}
      </div>

      {showEmpty ? (
        <div className="rar-coming-soon">
          <p>
            No rarity taxonomy is available for <strong>{gameDisplayName(gameRouteSlug)}</strong> yet.
          </p>
          <Link href={gamePath(gameRouteSlug, "/catalog")} className="section-action">
            Open catalog &rarr;
          </Link>
        </div>
      ) : active ? (
        <>
          <RarityPerformanceTable
            rows={all}
            activeSlug={active.slug}
            onSelect={selectRarity}
            viewMode={rarityViewMode}
            onViewModeChange={setRarityViewMode}
          />
          <SelectedRarityHero rarity={active} />
          <SelectedRarityCards
            rarity={active}
            gameRouteSlug={gameRouteSlug}
            showFullRanking={showFullRanking}
            onToggleFullRanking={() => setShowFullRanking((value) => !value)}
          />
        </>
      ) : null}
    </section>
  );
}
