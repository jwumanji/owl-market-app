"use client";

import Link from "next/link";
import { useState } from "react";

import { gamePath } from "@/lib/game-routes";
import {
  rankBoosterBoxesByPrice,
  rankBoosterBoxesByTotalSetValue,
  sealedValueMultiple,
} from "@/lib/market-sealed";
import type {
  CharacterRankItem,
  DashboardCard,
  DashboardData,
  EbaySaleItem,
  MarketWindow,
  MarketWindowPayload,
  SealedRankItem,
} from "@/lib/types";
import { formatPct, formatPrice, pctColor } from "@/lib/utils";
import MarketCardImage from "./MarketCardImage";
import "./market-dashboard.css";

const WINDOWS: MarketWindow[] = ["1D", "7D", "90D"];
type SetRankingMode = "booster_box" | "tsv";

const NEWS = [
  {
    slug: "op16-round-one-reveals",
    title: "Round 1 cards revealed — OP16 first look",
    category: "reveal",
    hero_image_url: null,
    published_at: "2026-07-14",
  },
  {
    slug: "regional-market-movers",
    title: "Top regional cards: what won and what it did to prices",
    category: "market",
    hero_image_url: null,
    published_at: "2026-07-11",
  },
  {
    slug: "one-piece-day-2026",
    title: "One Piece Day 2026 — full reveal schedule",
    category: "event",
    hero_image_url: null,
    published_at: "2026-07-08",
  },
  {
    slug: "op16-secret-rare",
    title: "Round 2 cards revealed — secret rare chase confirmed",
    category: "release",
    hero_image_url: null,
    published_at: "2026-07-05",
  },
] as const;

function WindowSelector<T>({
  data,
  value,
  onChange,
  label,
  windows = WINDOWS,
}: {
  data: MarketWindowPayload<T>;
  value: MarketWindow;
  onChange: (window: MarketWindow) => void;
  label: string;
  windows?: MarketWindow[];
}) {
  return (
    <div className="qd-timeframes" role="group" aria-label={`${label} timeframe`}>
      {windows.map((window) => {
        const available = data[window] != null;
        return (
          <button
            key={window}
            type="button"
            className={value === window ? "is-active" : undefined}
            disabled={!available}
            title={available ? `Show ${window} performance` : "Coming soon"}
            aria-pressed={value === window}
            onClick={() => available && onChange(window)}
          >
            {window}
          </button>
        );
      })}
    </div>
  );
}

function SetRankingToggle({
  value,
  onChange,
}: {
  value: SetRankingMode;
  onChange: (mode: SetRankingMode) => void;
}) {
  return (
    <div className="qd-ranking-toggle" role="group" aria-label="Rank box sets by">
      <button
        type="button"
        className={value === "booster_box" ? "is-active" : undefined}
        aria-pressed={value === "booster_box"}
        onClick={() => onChange("booster_box")}
      >
        Booster box
      </button>
      <button
        type="button"
        className={value === "tsv" ? "is-active" : undefined}
        aria-pressed={value === "tsv"}
        onClick={() => onChange("tsv")}
      >
        TSV
      </button>
    </div>
  );
}

function DeltaChip({ value }: { value: number | null | undefined }) {
  const direction = value == null || value === 0 ? "flat" : value > 0 ? "gain" : "loss";
  return (
    <span className={`qd-chip ${direction} ${pctColor(value)}`}>
      {value != null && value !== 0 && <span aria-hidden="true">{value > 0 ? "▲" : "▼"} </span>}
      {formatPct(value)}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  emphasis,
  titleAddon,
  selector,
}: {
  eyebrow: string;
  title: string;
  emphasis: string;
  titleAddon?: React.ReactNode;
  selector?: React.ReactNode;
}) {
  return (
    <div className="qd-section-head">
      <div>
        <div className="qd-section-kicker">{eyebrow}</div>
        <div className="qd-section-title-line">
          <h2 className="qd-section-title">
            {title && <>{title} </>}
            <em>{emphasis}</em>
          </h2>
          {titleAddon}
        </div>
      </div>
      {selector}
    </div>
  );
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="qd-see-all-row">
      <Link href={href} className="qd-see-all" prefetch={false}>
        {children} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function NewsSection() {
  return (
    <section className="qd-section" aria-labelledby="quickdash-news">
      <div className="qd-section-head">
        <div>
          <div className="qd-section-kicker">What&apos;s happening</div>
          <h2 id="quickdash-news" className="qd-section-title">
            Events &amp; <em>news</em>
          </h2>
        </div>
        <Link href="/news" className="qd-see-all qd-see-all-top" prefetch={false}>
          See more stories <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="qd-news-grid">
        {NEWS.map((article, index) => (
          <Link
            key={article.slug}
            href={`/news/${article.slug}`}
            className="qd-news-card"
            prefetch={false}
          >
            <div className={`qd-news-image qd-art-${index + 1}`}>
              <span>Article hero</span>
            </div>
            <div className="qd-news-body">
              <span className={`qd-news-tag ${article.category}`}>{article.category}</span>
              <span className="qd-news-title">{article.title}</span>
              <time className="qd-news-date" dateTime={article.published_at}>
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${article.published_at}T00:00:00Z`))}
              </time>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrendRow({
  card,
  rank,
  window,
  gameRouteSlug,
}: {
  card: DashboardCard;
  rank: number;
  window: MarketWindow;
  gameRouteSlug?: string | null;
}) {
  return (
    <Link
      href={gamePath(gameRouteSlug, `/card/${card.card_image_id}`)}
      className="qd-trend-row"
      prefetch={false}
    >
      <span className="qd-trend-rank">{rank}</span>
      <span className="qd-trend-name">
        {card.name}
        <span>{card.card_number ?? card.set_code}</span>
      </span>
      <span className="qd-trend-price">{formatPrice(card.market_avg)}</span>
      <DeltaChip value={card.changes[window]} />
    </Link>
  );
}

function formatSaleDate(value: string | null) {
  if (!value) return "Recent";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function EbaySaleRow({
  sale,
  rank,
  gameRouteSlug,
}: {
  sale: EbaySaleItem;
  rank: number;
  gameRouteSlug?: string | null;
}) {
  const content = (
    <>
      <span className="qd-trend-rank">{rank}</span>
      <span className="qd-trend-name" title={sale.title ?? sale.card_name}>
        {sale.card_name}
        <span>{sale.card_number ?? sale.set_code}</span>
      </span>
      <span className="qd-ebay-sale-meta">
        <strong>{formatPrice(sale.sale_price)}</strong>
        <small>{formatSaleDate(sale.sold_at)}{sale.ebay_url ? " ↗" : ""}</small>
      </span>
    </>
  );

  if (sale.ebay_url) {
    return (
      <a
        href={sale.ebay_url}
        className="qd-trend-row qd-ebay-row"
        target="_blank"
        rel="noreferrer"
        aria-label={`${sale.card_name}, sold for ${formatPrice(sale.sale_price)} on eBay`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={gamePath(gameRouteSlug, `/card/${sale.card_image_id}`)}
      className="qd-trend-row qd-ebay-row"
      prefetch={false}
    >
      {content}
    </Link>
  );
}

function TrendingSection({ data, gameRouteSlug }: { data: DashboardData; gameRouteSlug?: string | null }) {
  const [window, setWindow] = useState<MarketWindow>("1D");
  const gainers = data.topGainers[window] ?? [];
  const losers = data.topLosers[window] ?? [];

  return (
    <section className="qd-section" aria-labelledby="quickdash-trending">
      <SectionHeader
        eyebrow="$100+ movers right now"
        title=""
        emphasis="Trending"
        selector={<WindowSelector data={data.topGainers} value={window} onChange={setWindow} label="Trending" />}
      />
      <h2 id="quickdash-trending" className="sr-only">Trending cards</h2>
      <div className="qd-trend-grid">
        <div className="qd-trend-panel">
          <h3><span className="qd-dot gain" />Top gainers</h3>
          {gainers.length > 0
            ? gainers.map((card, index) => (
                <TrendRow key={card.id} card={card} rank={index + 1} window={window} gameRouteSlug={gameRouteSlug} />
              ))
            : <div className="qd-trend-empty">No qualifying gainers</div>}
        </div>
        <div className="qd-trend-panel">
          <h3><span className="qd-dot loss" />Top losers</h3>
          {losers.length > 0
            ? losers.map((card, index) => (
                <TrendRow key={card.id} card={card} rank={index + 1} window={window} gameRouteSlug={gameRouteSlug} />
              ))
            : <div className="qd-trend-empty">No qualifying losers</div>}
        </div>
        <div className="qd-trend-panel">
          <h3>
            <span className="qd-dot ebay" />
            Top eBay sales
            <span className="qd-panel-window">90D</span>
          </h3>
          {data.topEbaySales.length > 0
            ? data.topEbaySales.map((sale, index) => (
                <EbaySaleRow
                  key={sale.ebay_item_id}
                  sale={sale}
                  rank={index + 1}
                  gameRouteSlug={gameRouteSlug}
                />
              ))
            : <div className="qd-trend-empty">No recent eBay sales</div>}
        </div>
      </div>
    </section>
  );
}

function CardImage({ card, eager = false }: { card: DashboardCard; eager?: boolean }) {
  return (
    <div className="qd-market-image tall">
      <MarketCardImage
        alt={card.name}
        className="qd-image"
        fallbackTimeoutMs={0}
        fetchPriority={eager ? "high" : "low"}
        height={420}
        imageUrl={card.image_url}
        imageUrlPreview={card.image_url_preview}
        imageUrlSmall={card.image_url_small}
        loading={eager ? "eager" : "lazy"}
        sourceSize="display"
        width={300}
      />
    </div>
  );
}

function TopCardsSection({ data, gameRouteSlug }: { data: DashboardData; gameRouteSlug?: string | null }) {
  const [window, setWindow] = useState<MarketWindow>("1D");
  const cards = data.topCards[window] ?? [];

  return (
    <section className="qd-section" aria-labelledby="quickdash-cards">
      <SectionHeader
        eyebrow="Ranked by market value"
        title="Top"
        emphasis="cards"
        selector={<WindowSelector data={data.topCards} value={window} onChange={setWindow} label="Top cards" />}
      />
      <h2 id="quickdash-cards" className="sr-only">Top cards</h2>
      <div className="qd-card-grid qd-top-cards">
        {cards.map((card, index) => (
          <Link
            key={card.id}
            href={gamePath(gameRouteSlug, `/card/${card.card_image_id}`)}
            className="qd-market-card"
            prefetch={false}
          >
            <div className="qd-card-head">
              <span className="qd-rank">#{index + 1}</span>
              <span className="qd-card-name">{card.name}</span>
            </div>
            <CardImage card={card} eager={index < 2} />
            <div className="qd-card-id">{card.card_number ?? card.set_code ?? "—"}</div>
            <div className="qd-stats">
              <div className="qd-stat">
                <span>Market value</span>
                <strong>{formatPrice(card.market_avg)}</strong>
              </div>
              <div className="qd-stat">
                <span>{window}</span>
                <DeltaChip value={card.changes[window]} />
              </div>
            </div>
          </Link>
        ))}
      </div>
      <SeeAll href={gamePath(gameRouteSlug, "/markets/top-cards")}>See top 50 cards</SeeAll>
    </section>
  );
}

function SetImage({ item }: { item: SealedRankItem }) {
  return (
    <div className="qd-market-image wide">
      <MarketCardImage
        alt={`${item.name} box art`}
        className="qd-image"
        fallbackTimeoutMs={0}
        fetchPriority="low"
        height={200}
        imageUrl={item.image_url}
        imageUrlSmall={item.image_url_fallback}
        loading="lazy"
        sourceSize="display"
        width={320}
      />
    </div>
  );
}

function SetsSection({ data, gameRouteSlug }: { data: DashboardData; gameRouteSlug?: string | null }) {
  const [window, setWindow] = useState<MarketWindow>("1D");
  const [rankingMode, setRankingMode] = useState<SetRankingMode>("booster_box");
  const allSets = data.sealedBoxes[window] ?? [];
  const sets = rankingMode === "tsv"
    ? rankBoosterBoxesByTotalSetValue(allSets, 5)
    : rankBoosterBoxesByPrice(allSets, 5);

  return (
    <section className="qd-section" aria-labelledby="quickdash-sets">
      <SectionHeader
        eyebrow={rankingMode === "tsv" ? "Ranked by total set value" : "Ranked by booster box cost"}
        title="Box"
        emphasis="sets"
        titleAddon={<SetRankingToggle value={rankingMode} onChange={setRankingMode} />}
        selector={<WindowSelector data={data.sealedBoxes} value={window} onChange={setWindow} label="Box sets" />}
      />
      <h2 id="quickdash-sets" className="sr-only">Box sets</h2>
      <div className="qd-card-grid">
        {sets.map((item, index) => {
          const valueMultiple = sealedValueMultiple(item.total_set_value, item.market_avg);
          const valueFormula = valueMultiple == null
            ? "TSV or booster box price is unavailable"
            : `${formatPrice(item.total_set_value)} ÷ ${formatPrice(item.market_avg)} = ${valueMultiple.toFixed(1)}×`;

          return (
            <Link
              key={`${item.set_code ?? item.name}-${index}`}
              href={item.set_slug ? gamePath(gameRouteSlug, `/sets/${item.set_slug}`) : gamePath(gameRouteSlug, "/sets")}
              className="qd-market-card"
              prefetch={false}
            >
              <div className="qd-card-head">
                <span className="qd-rank">#{index + 1}</span>
                <span className="qd-card-name">{item.name}</span>
              </div>
              <SetImage item={item} />
              <div className="qd-stats qd-stats-wide">
                <div className="qd-stat">
                  <span>Booster box</span>
                  <strong>{formatPrice(item.market_avg)}</strong>
                </div>
                <div className="qd-stat">
                  <span>Case price</span>
                  <b>{formatPrice(item.case_market_avg)}</b>
                </div>
                <div className="qd-stat">
                  <span>Total set value</span>
                  <b>{formatPrice(item.total_set_value)}</b>
                </div>
                <div className="qd-value-formula" title={valueFormula} aria-label={valueFormula}>
                  <span>TSV ÷ box</span>
                  <b>{valueMultiple == null ? "—" : `= ${valueMultiple.toFixed(1)}×`}</b>
                </div>
                <div className="qd-stat">
                  <span>{window}</span>
                  <DeltaChip value={item.changes[window]} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <SeeAll href={gamePath(gameRouteSlug, "/sets")}>See all sets</SeeAll>
    </section>
  );
}

function CharacterImage({ item }: { item: CharacterRankItem }) {
  return (
    <div className="qd-market-image wide qd-character-image">
      <MarketCardImage
        alt={item.name}
        className="qd-image"
        fallbackTimeoutMs={0}
        fetchPriority="low"
        height={200}
        imageUrl={item.image_url}
        imageUrlPreview={item.image_url_preview}
        imageUrlSmall={item.image_url_small}
        loading="lazy"
        sourceSize="display"
        width={320}
      />
    </div>
  );
}

function CharactersSection({ data, gameRouteSlug }: { data: DashboardData; gameRouteSlug?: string | null }) {
  const [window, setWindow] = useState<MarketWindow>("7D");
  const characters = data.topCharacters[window] ?? [];

  return (
    <section className="qd-section" aria-labelledby="quickdash-characters">
      <SectionHeader
        eyebrow="Ranked only by total set value"
        title="Top"
        emphasis="characters"
        selector={<WindowSelector data={data.topCharacters} value={window} onChange={setWindow} label="Top characters" />}
      />
      <h2 id="quickdash-characters" className="sr-only">Top characters</h2>
      <div className="qd-card-grid">
        {characters.map((item, index) => (
          <Link
            key={item.slug}
            href={gamePath(gameRouteSlug, "/characters")}
            className="qd-market-card"
            prefetch={false}
          >
            <div className="qd-card-head">
              <span className="qd-rank">#{index + 1}</span>
              <span className="qd-card-name">{item.name}</span>
            </div>
            <CharacterImage item={item} />
            <div className="qd-stats qd-stats-wide">
              <div className="qd-stat">
                <span>Total set value</span>
                <strong>{formatPrice(item.index_value)}</strong>
              </div>
              <div className="qd-stat">
                <span>{window}</span>
                <DeltaChip value={item.changes[window]} />
              </div>
            </div>
          </Link>
        ))}
      </div>
      <SeeAll href={gamePath(gameRouteSlug, "/characters")}>See all characters</SeeAll>
    </section>
  );
}

function RaritySection({ data, gameRouteSlug }: { data: DashboardData; gameRouteSlug?: string | null }) {
  const [window, setWindow] = useState<MarketWindow>("7D");
  const rarities = data.rarityRanking[window] ?? [];

  return (
    <section className="qd-section qd-section-last" aria-labelledby="quickdash-rarities">
      <SectionHeader
        eyebrow="Ranked by total set value"
        title="Rarity"
        emphasis="index"
        selector={(
          <WindowSelector
            data={data.rarityRanking}
            value={window}
            onChange={setWindow}
            label="Rarity index"
            windows={["7D", "30D"]}
          />
        )}
      />
      <h2 id="quickdash-rarities" className="sr-only">Rarity index</h2>
      <div className="qd-rarity-grid">
        {rarities.map((item, index) => (
          <Link
            key={item.code}
            href={gamePath(gameRouteSlug, "/rarities")}
            className="qd-rarity-card"
            prefetch={false}
          >
            <div className="qd-rarity-card-head">
              <span className="qd-rarity-rank">#{index + 1}</span>
              <span className="qd-rarity-name" title={item.name}>{item.name}</span>
              <span className={`qd-rarity-badge rarity-${item.code.toLowerCase()}`}>{item.code}</span>
            </div>
            <div className="qd-market-image qd-rarity-image">
              <MarketCardImage
                alt={item.top_card_name ?? `${item.name} top card`}
                className="qd-image"
                fallbackTimeoutMs={0}
                fetchPriority={index < 2 ? "high" : "low"}
                height={180}
                imageUrl={item.image_url}
                imageUrlPreview={item.image_url_preview}
                imageUrlSmall={item.image_url_small}
                loading={index < 2 ? "eager" : "lazy"}
                sourceSize="display"
                width={128}
              />
            </div>
            <div className="qd-rarity-top-card">
              <span>Top card</span>
              <strong title={item.top_card_name ?? undefined}>{item.top_card_name ?? "Preview unavailable"}</strong>
            </div>
            <div className="qd-rarity-stats">
              <div className="qd-rarity-index">
                <span>Total set value</span>
                <strong>{formatPrice(item.index_value)}</strong>
              </div>
              <span className="qd-rarity-meta">
                <span>{item.card_count} cards</span>
                <DeltaChip value={item.changes[window]} />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <SeeAll href={gamePath(gameRouteSlug, "/rarities")}>See all rarities</SeeAll>
    </section>
  );
}

export default function MarketDashboard({
  data,
  gameRouteSlug,
}: {
  data: DashboardData;
  gameRouteSlug?: string | null;
}) {
  return (
    <div className="qd-dashboard">
      <NewsSection />
      <TrendingSection data={data} gameRouteSlug={gameRouteSlug} />
      <TopCardsSection data={data} gameRouteSlug={gameRouteSlug} />
      <SetsSection data={data} gameRouteSlug={gameRouteSlug} />
      <CharactersSection data={data} gameRouteSlug={gameRouteSlug} />
      <RaritySection data={data} gameRouteSlug={gameRouteSlug} />
    </div>
  );
}
