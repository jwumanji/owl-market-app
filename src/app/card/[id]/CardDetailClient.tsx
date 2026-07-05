"use client";

import { lazy, Suspense, use, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice, formatPct, pctColor, timeAgo } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";
import { gamePath } from "@/lib/game-routes";
import type { CardCorePayload, CardHistoryPayload, PricePoint } from "./card-detail-types";

const PERIODS = ["7d", "1m", "3m", "1y", "max"] as const;
type Period = (typeof PERIODS)[number];

const PriceChart = lazy(() => import("./PriceChartClient"));

function filterByPeriod(history: PricePoint[], period: Period): PricePoint[] {
  if (period === "max") return history;
  const now = Date.now();
  const msMap: Record<string, number> = {
    "7d": 7 * 86400000,
    "1m": 30 * 86400000,
    "3m": 90 * 86400000,
    "1y": 365 * 86400000,
  };
  const cutoff = now - msMap[period];
  return history.filter((p) => new Date(p.recorded_at).getTime() >= cutoff);
}

function formatAthDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function CardDetailClient({
  data,
  historyPromise,
  error,
  gameRouteSlug,
}: {
  data: CardCorePayload | null;
  // Un-awaited on the server: the above-fold content streams at first byte
  // while the price_history query resolves behind Suspense.
  historyPromise: Promise<CardHistoryPayload> | null;
  error?: string | null;
  gameRouteSlug: string;
}) {
  const [chartPeriod, setChartPeriod] = useState<Period>("3m");

  if (error || !data) {
    return (
      <section className="card-page max-w-[1180px] mx-auto px-8 py-8">
        <p className="text-loss-2 text-sm font-mono-2">{error ?? "Card not found"}</p>
        <Link href={gamePath(gameRouteSlug, "/sets")} className="text-coral text-sm mt-4 inline-block hover:underline">
          &larr; Back to Sets
        </Link>
      </section>
    );
  }

  const { card, set, priceStats } = data;
  // Always route the hero through the optimizer, mirrored or not: the mirrored
  // srcSet topped out at the 420px preview (soft on retina, cross-origin, no
  // AVIF), while the optimizer serves display-sized AVIF from the same origin.
  // Feed it the largest source available — it never upscales.
  const cardImageSrc = card.image_url ?? card.image_url_preview ?? card.image_url_small;
  const growth =
    priceStats?.market_avg != null && priceStats?.atl != null && priceStats.atl > 0
      ? ((priceStats.market_avg - priceStats.atl) / priceStats.atl) * 100
      : null;

  const chg1d = priceStats?.chg_1d;
  const heroPrice = priceStats?.market_avg ?? null;

  return (
    <section className="card-page max-w-[1180px] mx-auto px-8 pt-8 pb-24 text-ink">
      {/* Breadcrumb */}
      <div className="mb-8 font-mono-2 font-semibold text-[12px] tracking-[0.04em] flex items-center flex-wrap text-[var(--breadcrumb-accent)]">
        <Link href={gamePath(gameRouteSlug, "/sets")} className="text-[var(--breadcrumb-accent)] hover:text-ink transition-colors">
          Sets
        </Link>
        {set && (
          <>
            <span className="mx-2 text-[var(--breadcrumb-accent)]">/</span>
            <Link
              href={gamePath(gameRouteSlug, `/sets/${set.slug}`)}
              className="text-[var(--breadcrumb-accent)] hover:text-ink transition-colors"
            >
              {set.code} {set.name}
            </Link>
          </>
        )}
        <span className="mx-2 text-[var(--breadcrumb-accent)]">/</span>
        <span className="text-ink truncate max-w-[300px]">{card.name}</span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-14 items-start">
        {/* Left col — title block + art */}
        <div>
          <div className="mb-5">
            <h1 className="font-grotesk font-bold text-[32px] leading-[1.15] tracking-[-0.02em] text-ink">
              {card.name}
            </h1>
            <div className="mt-3 flex items-center gap-2.5 flex-wrap">
              <span className="font-mono-2 font-semibold text-[12.5px] text-ink-2">
                {set ? (
                  <Link
                    href={gamePath(gameRouteSlug, `/sets/${set.slug}`)}
                    className="hover:text-ink transition-colors"
                  >
                    {set.code} {set.name}
                  </Link>
                ) : null}
                {card.card_number ? ` · #${card.card_number}` : ""}
              </span>
              <RarityBadge rarity={card.rarity} />
            </div>
            {(card.card_type ||
              (card.variant_label && card.variant_label !== card.rarity) ||
              (card.color && card.color.length > 0)) && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {card.card_type && <Chip>{card.card_type}</Chip>}
                {card.variant_label && card.variant_label !== card.rarity && (
                  <Chip>{card.variant_label}</Chip>
                )}
                {card.color?.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            )}
          </div>

          {cardImageSrc ? (
            <Image
              src={cardImageSrc}
              sizes="(max-width: 364px) calc(100vw - 4rem), 300px"
              alt={card.name}
              width={300}
              height={420}
              quality={60}
              priority
              className="w-full max-w-[300px] aspect-[5/7] object-cover rounded-c-md border-[1.5px] border-ink shadow-[0_10px_24px_rgba(26,15,8,0.10)]"
            />
          ) : (
            <div className="w-full max-w-[300px] aspect-[5/7] rounded-c-md border-[1.5px] border-ink bg-bg-3" />
          )}
        </div>

        {/* Right col — price hero + chart + stats */}
        <div className="min-w-0">
          {/* Price hero */}
          <div className="mb-9">
            <div className="font-mono-2 font-semibold text-[12px] tracking-[0.14em] uppercase text-ink-2 mb-3">
              Market average
            </div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="font-mono-2 font-semibold text-[56px] leading-none tracking-[-0.01em] text-ink">
                {formatPrice(heroPrice)}
              </span>
              {chg1d != null && <DeltaPill value={chg1d} />}
            </div>
            {priceStats?.updated_at && (
              <div className="mt-2.5 font-mono-2 font-semibold text-[13px] text-ink-2">
                Last updated {timeAgo(priceStats.updated_at)}
              </div>
            )}
          </div>

          {/* Chart block */}
          <div className="bg-bg-2 border-[1.5px] border-ink rounded-c-md p-5 mb-8">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-baseline gap-2">
                <h2 className="font-grotesk font-bold text-[18px] tracking-[-0.01em] text-ink">
                  Price History
                </h2>
                {historyPromise && (
                  <Suspense fallback={null}>
                    <HistoryNotice promise={historyPromise} period={chartPeriod} />
                  </Suspense>
                )}
              </div>
              <div className="flex gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`font-mono-2 font-semibold text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-c-pill transition-colors ${
                      chartPeriod === p
                        ? "bg-ink text-bg"
                        : "text-ink-2 hover:bg-bg-3"
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {historyPromise ? (
              <MountNearViewport placeholder={<ChartLoading />}>
                <Suspense fallback={<ChartLoading />}>
                  <HistorySection promise={historyPromise} period={chartPeriod} />
                </Suspense>
              </MountNearViewport>
            ) : (
              <HistoryEmpty />
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3.5">
            <StatTile
              label="24h change"
              value={formatPct(priceStats?.chg_1d)}
              valueClass={pctColor(priceStats?.chg_1d)}
            />
            <StatTile
              label="7d change"
              value={formatPct(priceStats?.chg_7d)}
              valueClass={pctColor(priceStats?.chg_7d)}
            />
            <StatTile
              label="30d change"
              value={formatPct(priceStats?.chg_30d)}
              valueClass={pctColor(priceStats?.chg_30d)}
            />
            <StatTile
              label="All-time high"
              value={formatPrice(priceStats?.ath)}
              foot={formatAthDate(priceStats?.ath_date ?? null)}
            />
            <StatTile
              label="All-time low"
              value={formatPrice(priceStats?.atl)}
              foot={formatAthDate(priceStats?.atl_date ?? null)}
            />
            <StatTile
              label="Growth from ATL"
              value={formatPct(growth)}
              valueClass={pctColor(growth)}
            />
          </div>

          {/* TCG Range */}
          {(priceStats?.tcg_low != null ||
            priceStats?.tcg_mid != null ||
            priceStats?.tcg_high != null) && (
            <div className="mt-3.5 bg-bg-2 border-[1.5px] border-ink rounded-c-md px-5 py-4">
              <div className="font-mono-2 font-semibold text-[11px] tracking-[0.12em] uppercase text-ink-2 mb-2">
                TCG Price Range (30d)
              </div>
              <div className="flex items-center gap-5 font-mono-2 font-semibold text-[14px] text-ink flex-wrap">
                <div>
                  <span className="text-ink-3 text-[11px] mr-1.5 uppercase tracking-[0.06em]">
                    Low
                  </span>
                  {formatPrice(priceStats.tcg_low)}
                </div>
                <span className="text-ink-3">·</span>
                <div>
                  <span className="text-ink-3 text-[11px] mr-1.5 uppercase tracking-[0.06em]">
                    Mid
                  </span>
                  {formatPrice(priceStats.tcg_mid)}
                </div>
                <span className="text-ink-3">·</span>
                <div>
                  <span className="text-ink-3 text-[11px] mr-1.5 uppercase tracking-[0.06em]">
                    High
                  </span>
                  {formatPrice(priceStats.tcg_high)}
                </div>
              </div>
            </div>
          )}

          {/*
            Recent-sales table from the mockup is intentionally deferred —
            no per-sale data source exists today (TCGplayer has no sales-history
            API). Future source: eBay sold-listings feed. Volume (7d) and PSA 10
            population tiles are deferred for the same reason. Render the
            Date / Grade / Source / Price table here using the mockup's
            `.sales-table` styling once the feed lands.
          */}
        </div>
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono-2 font-semibold text-[11px] tracking-[0.06em] px-2.5 py-1 rounded-c-pill border-[1.5px] border-ink-2 text-ink-2 bg-bg-2">
      {children}
    </span>
  );
}

function DeltaPill({ value }: { value: number }) {
  const bg = value > 0 ? "bg-gain-2" : value < 0 ? "bg-loss-2" : "bg-ink-3";
  const arrow = value > 0 ? "↑ " : value < 0 ? "↓ " : "";
  const magnitude = value === 0 ? formatPct(value) : formatPct(Math.abs(value));
  return (
    <span
      className={`inline-flex items-center font-mono-2 font-semibold text-[13px] text-bg px-3 py-1.5 rounded-c-pill ${bg}`}
    >
      {arrow}
      {magnitude} · 24h
    </span>
  );
}

function ChartLoading() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm font-mono-2 text-ink-3">
      Loading price history...
    </div>
  );
}

/* Defers mounting its children until the block scrolls near the viewport.
   chart.js parsing/rendering was the biggest TBT contributor after react-dom
   hydration; on mobile the chart is below the fold, so this moves that work
   out of the load window entirely. Desktop (chart above the fold) mounts on
   the first observer callback. */
function MountNearViewport({
  children,
  placeholder,
}: {
  children: React.ReactNode;
  placeholder: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || mounted) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  return <div ref={ref}>{mounted ? children : placeholder}</div>;
}

function HistoryEmpty() {
  return (
    <div className="flex items-center justify-center h-[280px] text-ink-3 text-sm font-mono-2">
      No price history available
    </div>
  );
}

/* Both consumers below use() the same streamed promise — React resolves it
   once; the header notice and the chart body unsuspend together. */

function HistoryNotice({
  promise,
  period,
}: {
  promise: Promise<CardHistoryPayload>;
  period: Period;
}) {
  const { priceHistory, priceHistorySynthetic } = use(promise);
  if (!priceHistorySynthetic || filterByPeriod(priceHistory, period).length === 0) return null;
  return (
    <span className="font-mono-2 font-semibold text-[10px] text-ink-3 uppercase tracking-[0.1em]">
      Estimated from 30-day stats
    </span>
  );
}

function HistorySection({
  promise,
  period,
}: {
  promise: Promise<CardHistoryPayload>;
  period: Period;
}) {
  const { priceHistory } = use(promise);
  const filteredHistory = filterByPeriod(priceHistory, period);

  if (filteredHistory.length === 0) return <HistoryEmpty />;

  return (
    <div style={{ height: 280 }}>
      <Suspense fallback={<ChartLoading />}>
        <PriceChart data={filteredHistory} period={period} />
      </Suspense>
    </div>
  );
}

function StatTile({
  label,
  value,
  foot,
  valueClass = "text-ink",
}: {
  label: string;
  value: string;
  foot?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-bg-2 border-[1.5px] border-ink rounded-c-md px-[18px] py-4">
      <div className="font-mono-2 font-semibold text-[11px] tracking-[0.12em] uppercase text-ink-2">
        {label}
      </div>
      <div
        className={`mt-2 font-mono-2 font-semibold text-[22px] leading-none tracking-[-0.01em] ${valueClass}`}
      >
        {value}
      </div>
      {foot && (
        <div className="mt-1.5 font-mono-2 font-semibold text-[11px] text-ink-2">
          {foot}
        </div>
      )}
    </div>
  );
}
