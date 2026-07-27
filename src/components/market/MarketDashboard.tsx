"use client";

import Link from "next/link";
import { useState } from "react";

import ArticleCard from "@/components/articles/ArticleCard";
import type { ArticleSummary } from "@/lib/articles";
import { gamePath } from "@/lib/game-routes";
import { ONE_PIECE_ROUTE_SLUG } from "@/lib/games/one-piece";
import { RIFTBOUND_ROUTE_SLUG } from "@/lib/games/registry";
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

const RIFTBOUND_GUIDES = [
  {
    href: "/champions",
    title: "Explore champions, signature cards, and collector standouts",
    category: "champions",
    tone: "reveal",
    heroLabel: "Champion index",
    meta: "Champion-linked cards",
  },
  {
    href: "/sets",
    title: "Browse Origins, Spiritforged, Unleashed, and promo releases",
    category: "sets",
    tone: "market",
    heroLabel: "Set library",
    meta: "All Riftbound releases",
  },
  {
    href: "/rarities",
    title: "Compare Signature, Overnumbered, Metal, and promo treatments",
    category: "treatments",
    tone: "event",
    heroLabel: "Treatment guide",
    meta: "Collector rarity index",
  },
  {
    href: "/languages",
    title: "Track English, Chinese, and localized market editions",
    category: "languages",
    tone: "release",
    heroLabel: "Language markets",
    meta: "Edition coverage",
  },
] as const;

const UPCOMING_ONE_PIECE_EVENTS = [
  {
    month: "Aug",
    day: "22–23",
    label: "One Piece Day ’26 · Japan",
    kind: "event",
    dateTime: "2026-08-22",
    dateLabel: "August 22 to 23, 2026",
  },
  {
    month: "Sep",
    day: "TBD",
    label: "OP-17 · Japan release",
    kind: "release",
  },
  {
    month: "Oct",
    day: "TBD",
    label: "OP-17 · English pre-release",
    kind: "release",
  },
  {
    month: "Nov",
    day: "TBD",
    label: "Championship finals",
    kind: "tournament",
  },
] as const;

type UpcomingEventKind = (typeof UPCOMING_ONE_PIECE_EVENTS)[number]["kind"];

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

export function MarketNewsSection({
  articles,
  gameRouteSlug,
}: {
  articles: ArticleSummary[];
  gameRouteSlug?: string | null;
}) {
  const isRiftbound = gameRouteSlug === RIFTBOUND_ROUTE_SLUG;
  const archiveHref = gamePath(gameRouteSlug, "/news");

  return (
    <section className="qd-section qd-news-section" aria-labelledby="quickdash-news">
      <div className="qd-section-head">
        <div>
          <div className="qd-section-kicker">{isRiftbound ? "Build your market view" : "What's happening"}</div>
          <h2 id="quickdash-news" className="qd-section-title">
            {isRiftbound ? <>Riftbound <em>market</em></> : <>Events &amp; <em>news</em></>}
          </h2>
        </div>
        <Link href={archiveHref} className="qd-see-all qd-see-all-top" prefetch={false}>
          See more stories <span aria-hidden="true">→</span>
        </Link>
      </div>

      {articles.length > 0 ? (
        <div className="qd-news-grid">
          {articles.map((article, index) => (
            <ArticleCard
              key={article.id}
              article={article}
              accentIndex={index}
              href={gamePath(gameRouteSlug, `/news/${article.slug}`)}
            />
          ))}
        </div>
      ) : isRiftbound ? (
        <div className="qd-news-grid">
          {RIFTBOUND_GUIDES.map((guide, index) => (
            <Link
              key={guide.href}
              href={gamePath(gameRouteSlug, guide.href)}
              className="qd-news-card"
              prefetch={false}
            >
              <div className={`qd-news-image qd-art-${index + 1}`}>
                <span>{guide.heroLabel}</span>
              </div>
              <div className="qd-news-body">
                <span className={`qd-news-tag ${guide.tone}`}>{guide.category}</span>
                <span className="qd-news-title">{guide.title}</span>
                <span className="qd-news-date">{guide.meta}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="qd-news-empty">
          The first story for this game is being prepared.
        </div>
      )}
    </section>
  );
}

function UpcomingEventIcon({ kind }: { kind: UpcomingEventKind }) {
  if (kind === "release") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="3.5" width="12" height="17" rx="2.2" />
        <path d="M9 7h6M9 11h6M10 15h4" />
      </svg>
    );
  }

  if (kind === "tournament") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v5M8 20h8M10 17h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3Z" />
    </svg>
  );
}

function UpcomingEventsSection() {
  return (
    <section className="qd-upcoming" aria-labelledby="quickdash-upcoming">
      <div className="qd-upcoming-copy">
        <div>
          <div className="qd-section-kicker">Coming up</div>
          <h2 id="quickdash-upcoming" className="qd-upcoming-title">
            Dates to <em>watch</em>
          </h2>
        </div>
        <p className="qd-upcoming-note">Dates subject to change</p>
      </div>

      <div className="qd-upcoming-track-wrap">
        <div className="qd-upcoming-track">
          {UPCOMING_ONE_PIECE_EVENTS.map((event) => (
            <div key={`${event.month}-${event.label}`} className="qd-upcoming-event">
              {"dateTime" in event ? (
                <time
                  className="qd-upcoming-date"
                  dateTime={event.dateTime}
                  aria-label={event.dateLabel}
                >
                  <span>{event.month}</span>
                  <strong>{event.day}</strong>
                </time>
              ) : (
                <span className="qd-upcoming-date" aria-label={`${event.month}, date to be announced`}>
                  <span>{event.month}</span>
                  <strong>{event.day}</strong>
                </span>
              )}
              <span className={`qd-upcoming-marker qd-upcoming-marker-${event.kind}`} aria-hidden="true">
                <UpcomingEventIcon kind={event.kind} />
              </span>
              <span className="qd-upcoming-event-name">{event.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrendThumbnail({
  alt,
  imageUrl,
  imageUrlPreview,
  imageUrlSmall,
}: {
  alt: string;
  imageUrl?: string | null;
  imageUrlPreview?: string | null;
  imageUrlSmall?: string | null;
}) {
  return (
    <span className="qd-trend-thumbnail">
      <MarketCardImage
        alt={`${alt} card art`}
        className="qd-trend-thumbnail-image"
        fallbackTimeoutMs={0}
        fetchPriority="low"
        height={42}
        imageUrl={imageUrl}
        imageUrlPreview={imageUrlPreview}
        imageUrlSmall={imageUrlSmall}
        loading="lazy"
        sourceSize="thumbnail"
        width={30}
      />
    </span>
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
      <TrendThumbnail
        alt={card.name}
        imageUrl={card.image_url}
        imageUrlPreview={card.image_url_preview}
        imageUrlSmall={card.image_url_small}
      />
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
      <TrendThumbnail
        alt={sale.card_name}
        imageUrl={sale.image_url}
        imageUrlPreview={sale.image_url_preview}
        imageUrlSmall={sale.image_url_small}
      />
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
        {sets.length === 0 ? (
          <div className="qd-section-empty">
            <strong>Sealed pricing is coming online.</strong>
            <span>Explore the set library while booster box coverage fills in.</span>
          </div>
        ) : sets.map((item, index) => {
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
  const isRiftbound = gameRouteSlug === RIFTBOUND_ROUTE_SLUG;
  const indexHref = gamePath(gameRouteSlug, isRiftbound ? "/champions" : "/characters");

  return (
    <section className="qd-section" aria-labelledby="quickdash-characters">
      <SectionHeader
        eyebrow={isRiftbound ? "Ranked by featured card market value" : "Ranked only by total set value"}
        title="Top"
        emphasis={isRiftbound ? "champions" : "characters"}
        selector={<WindowSelector data={data.topCharacters} value={window} onChange={setWindow} label={isRiftbound ? "Top champions" : "Top characters"} />}
      />
      <h2 id="quickdash-characters" className="sr-only">{isRiftbound ? "Top champions" : "Top characters"}</h2>
      <div className="qd-card-grid">
        {characters.length === 0 ? (
          <div className="qd-section-empty">
            <strong>{isRiftbound ? "Champion rankings are coming online." : "Character rankings are unavailable."}</strong>
            <span>Browse the full index while linked-card values fill in.</span>
          </div>
        ) : characters.map((item, index) => (
          <Link
            key={item.slug}
            href={isRiftbound ? `${indexHref}?q=${encodeURIComponent(item.name)}` : indexHref}
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
                <span>{isRiftbound ? "Featured card value" : "Total set value"}</span>
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
      <SeeAll href={indexHref}>{isRiftbound ? "See all champions" : "See all characters"}</SeeAll>
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
  articles,
  gameRouteSlug,
}: {
  data: DashboardData;
  articles: ArticleSummary[];
  gameRouteSlug?: string | null;
}) {
  const showUpcomingEvents = !gameRouteSlug || gameRouteSlug === ONE_PIECE_ROUTE_SLUG;

  return (
    <div className="qd-dashboard">
      <MarketNewsSection articles={articles} gameRouteSlug={gameRouteSlug} />
      {showUpcomingEvents && <UpcomingEventsSection />}
      <TrendingSection data={data} gameRouteSlug={gameRouteSlug} />
      <TopCardsSection data={data} gameRouteSlug={gameRouteSlug} />
      <SetsSection data={data} gameRouteSlug={gameRouteSlug} />
      <CharactersSection data={data} gameRouteSlug={gameRouteSlug} />
      <RaritySection data={data} gameRouteSlug={gameRouteSlug} />
    </div>
  );
}
