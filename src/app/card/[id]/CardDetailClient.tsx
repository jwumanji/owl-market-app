"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPct, pctColor, spreadPct } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";
import { cardDisplayName, cardOfficialIdentity } from "@/lib/card-market-names";
import { gamePath, gameQueryValue } from "@/lib/game-routes";
import type {
  CardCorePayload,
  CardHistoryPayload,
  CardMarketExtrasPayload,
  EbaySaleData,
  JpPriceData,
  PricePoint,
  PriceStatsData,
} from "./card-detail-types";

const PERIODS = ["7d", "1m", "3m", "1y", "max"] as const;
type Period = (typeof PERIODS)[number];

const PriceChart = lazy(() => import("./PriceChartClient"));

// TODO(fx): replace with a timestamped FX feed. The UI labels this as an
// estimate so a fixed conversion is never presented as a tradeable quote.
const JPY_PER_USD = 155;
const DAY_MS = 86_400_000;

type WindowMetric = {
  value: number | null;
  source: "provider" | "history" | "unavailable";
  baselineAt: string | null;
};

type HistoryOverview = {
  current: number | null;
  currentAt: string | null;
  high: number | null;
  highAt: string | null;
  low: number | null;
  lowAt: string | null;
  growthFromLow: number | null;
  rangePosition: number | null;
  sampleCount: number;
  firstAt: string | null;
};

function pointPrice(point: PricePoint): number | null {
  if (Number.isFinite(point.tcg_market) && point.tcg_market > 0) return point.tcg_market;
  if (Number.isFinite(point.market_avg) && point.market_avg > 0) return point.market_avg;
  return null;
}

function deriveHistoryOverview(history: PricePoint[]): HistoryOverview {
  const priced = history
    .map((point) => ({ point, price: pointPrice(point) }))
    .filter((entry): entry is { point: PricePoint; price: number } => entry.price != null)
    .sort(
      (a, b) =>
        new Date(a.point.recorded_at).getTime() - new Date(b.point.recorded_at).getTime()
    );

  if (priced.length === 0) {
    return {
      current: null,
      currentAt: null,
      high: null,
      highAt: null,
      low: null,
      lowAt: null,
      growthFromLow: null,
      rangePosition: null,
      sampleCount: 0,
      firstAt: null,
    };
  }

  const latest = priced[priced.length - 1];
  const high = priced.reduce((best, entry) => (entry.price > best.price ? entry : best));
  const low = priced.reduce((best, entry) => (entry.price < best.price ? entry : best));
  const range = high.price - low.price;

  return {
    current: latest.price,
    currentAt: latest.point.recorded_at,
    high: high.price,
    highAt: high.point.recorded_at,
    low: low.price,
    lowAt: low.point.recorded_at,
    growthFromLow: low.price > 0 ? ((latest.price - low.price) / low.price) * 100 : null,
    rangePosition: range > 0 ? ((latest.price - low.price) / range) * 100 : null,
    sampleCount: priced.length,
    firstAt: priced[0].point.recorded_at,
  };
}

function deriveWindowChange(history: PricePoint[], days: 1 | 7 | 30): WindowMetric {
  const priced = history
    .map((point) => ({ point, price: pointPrice(point) }))
    .filter((entry): entry is { point: PricePoint; price: number } => entry.price != null)
    .sort(
      (a, b) =>
        new Date(a.point.recorded_at).getTime() - new Date(b.point.recorded_at).getTime()
    );

  if (priced.length < 2) return { value: null, source: "unavailable", baselineAt: null };
  const latest = priced[priced.length - 1];
  const latestMs = new Date(latest.point.recorded_at).getTime();
  const cutoff = latestMs - days * DAY_MS;
  const baseline = [...priced]
    .reverse()
    .find((entry) => new Date(entry.point.recorded_at).getTime() <= cutoff);
  if (!baseline || baseline.price <= 0) {
    return { value: null, source: "unavailable", baselineAt: null };
  }

  // Reject a distant sample for short windows. A stale four-day-old quote is
  // not a defensible 24-hour return, even if its numeric value is unchanged.
  const tolerance = days === 1 ? 1.5 * DAY_MS : days === 7 ? 4 * DAY_MS : 10 * DAY_MS;
  if (cutoff - new Date(baseline.point.recorded_at).getTime() > tolerance) {
    return { value: null, source: "unavailable", baselineAt: baseline.point.recorded_at };
  }

  return {
    value: ((latest.price - baseline.price) / baseline.price) * 100,
    source: "history",
    baselineAt: baseline.point.recorded_at,
  };
}

function providerOrHistory(
  providerValue: number | null | undefined,
  fallback: WindowMetric
): WindowMetric {
  if (providerValue != null) {
    return { value: providerValue, source: "provider", baselineAt: null };
  }
  return fallback;
}

function filterByPeriod(history: PricePoint[], period: Period): PricePoint[] {
  if (period === "max") return history;
  const msMap: Record<Exclude<Period, "max">, number> = {
    "7d": 7 * DAY_MS,
    "1m": 30 * DAY_MS,
    "3m": 90 * DAY_MS,
    "1y": 365 * DAY_MS,
  };
  const cutoff = Date.now() - msMap[period];
  return history.filter((point) => new Date(point.recorded_at).getTime() >= cutoff);
}

function formatMarketPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "USD move unavailable";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

function usdMoveFromReturn(
  currentPrice: number | null,
  returnPct: number | null
): number | null {
  if (currentPrice == null || returnPct == null) return null;
  const multiplier = 1 + returnPct / 100;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return currentPrice - currentPrice / multiplier;
}

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("en-US")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatGrade(grade: number): string {
  return grade % 1 === 0 ? String(grade) : grade.toFixed(1);
}

export default function CardDetailClient({
  data,
  error,
  gameRouteSlug,
}: {
  data: CardCorePayload | null;
  error?: string | null;
  gameRouteSlug: string;
}) {
  const [chartPeriod, setChartPeriod] = useState<Period>("3m");
  const [history, setHistory] = useState<CardHistoryPayload | null>(null);
  const [extras, setExtras] = useState<CardMarketExtrasPayload | null>(null);
  const [extrasLoaded, setExtrasLoaded] = useState(false);

  const cardImageId = data?.card.card_image_id ?? null;

  useEffect(() => {
    if (!cardImageId) return;
    const controller = new AbortController();
    const game = encodeURIComponent(gameQueryValue(gameRouteSlug));
    fetch(`/api/card/${encodeURIComponent(cardImageId)}/history?game=${game}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: CardHistoryPayload | null) => {
        setHistory(payload ?? { priceHistory: [], priceHistorySynthetic: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory({ priceHistory: [], priceHistorySynthetic: false });
        }
      });
    return () => controller.abort();
  }, [cardImageId, gameRouteSlug]);

  useEffect(() => {
    if (!cardImageId) return;
    const controller = new AbortController();
    const game = encodeURIComponent(gameQueryValue(gameRouteSlug));
    fetch(`/api/card/${encodeURIComponent(cardImageId)}/extras?game=${game}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: CardMarketExtrasPayload | null) => {
        setExtras(payload);
        setExtrasLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setExtrasLoaded(true);
      });
    return () => controller.abort();
  }, [cardImageId, gameRouteSlug]);

  if (error || !data) {
    return (
      <section className="mx-auto max-w-[1180px] px-6 py-10">
        <p className="font-mono-2 text-sm text-loss-2">{error ?? "Card not found"}</p>
        <Link
          href={gamePath(gameRouteSlug, "/sets")}
          className="mt-4 inline-block text-sm text-coral hover:underline"
        >
          &larr; Back to Sets
        </Link>
      </section>
    );
  }

  const { card, set, priceStats } = data;
  const cardImageSrc = card.image_url ?? card.image_url_preview ?? card.image_url_small;
  const priceHistory = history?.priceHistory ?? [];
  const overview = deriveHistoryOverview(priceHistory);
  const currentPrice = priceStats?.tcg_market ?? priceStats?.market_avg ?? overview.current;
  const observedAt = overview.currentAt ?? priceStats?.updated_at ?? null;
  const change1d = providerOrHistory(
    priceStats?.chg_1d,
    deriveWindowChange(priceHistory, 1)
  );
  const change7d = providerOrHistory(
    priceStats?.chg_7d,
    deriveWindowChange(priceHistory, 7)
  );
  const change30d = providerOrHistory(
    priceStats?.chg_30d,
    deriveWindowChange(priceHistory, 30)
  );
  const recordedHigh = priceStats?.ath ?? overview.high;
  const recordedHighAt = priceStats?.ath_date ?? overview.highAt;
  const recordedLow = priceStats?.atl ?? overview.low;
  const recordedLowAt = priceStats?.atl_date ?? overview.lowAt;
  const currentRangePosition =
    currentPrice != null && recordedLow != null && recordedHigh != null
      ? recordedHigh > recordedLow
        ? Math.max(
            0,
            Math.min(100, ((currentPrice - recordedLow) / (recordedHigh - recordedLow)) * 100)
          )
        : 50
      : null;
  const currentRangeLabelTranslate =
    currentRangePosition == null
      ? "-50%"
      : currentRangePosition < 22
        ? "0%"
        : currentRangePosition > 78
          ? "-100%"
          : "-50%";
  const growthFromLow =
    currentPrice != null && recordedLow != null && recordedLow > 0
      ? ((currentPrice - recordedLow) / recordedLow) * 100
      : overview.growthFromLow;
  const verifiedSales = extras?.ebayRecent.length ?? 0;
  const hasWeeklyEbayRaw = (extras?.ebayWeekStats.rawCount ?? 0) > 0;
  const ebayMarketPrice =
    (hasWeeklyEbayRaw ? extras?.ebayWeekStats.rawAvg : null) ??
    priceStats?.ebay_avg ??
    extras?.ebayStats.rawAvg ??
    extras?.ebayRecent[0]?.sale_price ??
    null;
  const jpMarketPrice = extras?.jpPrice ?? null;
  const jpMarketUsd = jpMarketPrice ? jpMarketPrice.price_jpy / JPY_PER_USD : null;
  const confidenceLevel = getMarketConfidence({
    observedAt,
    sampleCount: overview.sampleCount,
    verifiedSales,
    listingsCount: priceStats?.tcg_listings_count ?? 0,
    synthetic: history?.priceHistorySynthetic ?? false,
  });
  const cardColors = Array.from(
    new Set(
      card.color.flatMap((color) =>
        color
          .split(/[\s/,+]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    )
  ).join(" / ");
  const cardProfileSummary = [
    [cardColors || null, card.card_type].filter(Boolean).join(" ") || null,
    card.cost != null ? `${card.cost} cost` : null,
    card.power != null ? `${card.power.toLocaleString("en-US")} power` : null,
    card.life != null ? `${card.life} life` : null,
    card.counter != null ? `${card.counter.toLocaleString("en-US")} counter` : null,
  ].filter((detail): detail is string => Boolean(detail));
  const printedSetCode = card.card_number?.split("-")[0]?.trim().toUpperCase() ?? null;
  const isReprint = Boolean(set?.code && printedSetCode && set.code !== printedSetCode);
  const cardTraits = [
    card.attribute,
    card.types.length > 0 ? card.types.join(" · ") : null,
    card.artist ? `Art by ${card.artist}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return (
    <section className="mx-auto max-w-[1220px] px-5 pb-24 pt-7 text-ink sm:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        <Link href={gamePath(gameRouteSlug, "/sets")} className="transition-colors hover:text-ink">
          Sets
        </Link>
        <span>/</span>
        {set && (
          <>
            <Link
              href={gamePath(gameRouteSlug, `/sets/${set.slug}`)}
              className="transition-colors hover:text-ink"
            >
              {set.code}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-ink">Market dossier</span>
      </div>

      {/* Card market snapshot */}
      <section className="relative overflow-hidden rounded-[28px] border-[1.5px] border-ink/15 bg-[linear-gradient(135deg,#FFFDF8_0%,#FFEBDD_52%,#FFF4D7_100%)] text-ink shadow-[0_24px_60px_rgba(91,52,25,0.12)]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-coral/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative grid gap-8 p-5 sm:p-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10 lg:p-9">
          <div className="mx-auto w-full max-w-[230px] lg:mx-0">
            {cardImageSrc ? (
              <Image
                src={cardImageSrc}
                sizes="(max-width: 1023px) 230px, 230px"
                alt={cardDisplayName(card)}
                width={300}
                height={420}
                quality={68}
                priority
                fetchPriority="high"
                className="aspect-[5/7] w-full rounded-[18px] object-cover shadow-[0_20px_38px_rgba(74,39,17,0.24)]"
              />
            ) : (
              <div className="aspect-[5/7] w-full rounded-[18px] bg-ink/5" />
            )}
            <div className="mt-3 flex items-center justify-between gap-3 font-mono-2 text-[10px] uppercase tracking-[0.1em] text-ink-3">
              <span>{card.card_number ?? "Catalog card"}</span>
              <span>{set?.code ?? "—"}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-ink/15 bg-white/65 px-3 py-1 font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-2">
                Market snapshot
              </span>
              <ConfidenceBadge confidence={confidenceLevel} />
            </div>

            <h1 className="mt-5 max-w-[760px] font-grotesk text-[30px] font-bold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[38px] lg:text-[44px]">
              {cardDisplayName(card)}
            </h1>
            {cardOfficialIdentity(card) && (
              <p className="mt-2 max-w-[760px] font-grotesk text-[15px] font-semibold text-ink-2">
                Official card name: {card.name}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <RarityBadge rarity={card.rarity} />
              {card.variant_label && <DarkChip>{card.variant_label}</DarkChip>}
              {set && <DarkChip>{set.code} {set.name}</DarkChip>}
            </div>

            <div className="mt-7 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
              <div className="rounded-[18px] border border-ink/10 bg-white/65 p-5">
                <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-3">
                  Card profile
                </div>
                <p className="mt-3 font-grotesk text-[17px] font-bold leading-[1.45] tracking-[-0.01em] text-ink sm:text-[18px]">
                  {cardProfileSummary.length > 0
                    ? cardProfileSummary.join(" · ")
                    : "Gameplay profile not reported"}
                </p>

                <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-2">
                  <div>
                    <div className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                      This printing
                    </div>
                    <div className="mt-1 font-grotesk text-[13px] font-semibold leading-snug text-ink">
                      {set
                        ? `${card.variant_label ?? card.rarity ?? "Card"}${isReprint ? " reprint" : ""} in ${set.code}`
                        : card.variant_label ?? card.rarity ?? "Not reported"}
                    </div>
                    {set && (
                      <div className="mt-1 font-grotesk text-[11px] leading-snug text-ink-3">
                        {set.name}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                      Original printing
                    </div>
                    <div className="mt-1 font-grotesk text-[13px] font-semibold leading-snug text-ink">
                      {printedSetCode ? `Originally printed in ${printedSetCode}` : "Not reported"}
                    </div>
                    {card.card_number && (
                      <div className="mt-1 font-mono-2 text-[10px] uppercase tracking-[0.08em] text-ink-3">
                        Card {card.card_number}
                      </div>
                    )}
                  </div>
                </div>

                {cardTraits.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cardTraits.map((detail) => (
                      <span
                        key={detail}
                        className="rounded-full border border-ink/10 bg-bg-2 px-3 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-2"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[18px] border border-ink/10 bg-white/40 p-5">
                <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-3">
                  Official effect
                </div>
                <p className="mt-3 font-grotesk text-[13px] font-medium leading-[1.65] text-ink-2">
                  {card.effect ?? "Official gameplay text is not available for this printing."}
                </p>
                {card.trigger && (
                  <p className="mt-3 border-l-[3px] border-coral pl-3 font-grotesk text-[12px] leading-[1.55] text-ink-2">
                    <span className="font-semibold text-ink">Trigger:</span> {card.trigger}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Market graph */}
      <section className="mt-4">
        <h2 className="font-grotesk text-[30px] font-bold leading-none tracking-[-0.035em] sm:text-[38px]">
          Market Graph
        </h2>

        <div className="mt-6 grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
          <div className="rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-4 shadow-[0_10px_30px_rgba(55,31,14,0.06)] sm:p-6 lg:order-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-grotesk text-[20px] font-bold tracking-[-0.02em]">Market record</h2>
                <div className="mt-1 font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  TCG quote · rolling average when available
                </div>
              </div>
              <div className="flex gap-1 rounded-full bg-bg-3 p-1">
                {PERIODS.map((period) => (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={chartPeriod === period}
                    onClick={() => setChartPeriod(period)}
                    className={`rounded-full px-3 py-1.5 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                      chartPeriod === period
                        ? "bg-ink text-bg"
                        : "text-ink-2 hover:bg-white/70 hover:text-ink"
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {history?.priceHistorySynthetic && (
              <div className="mb-3 rounded-c-sm bg-gold/10 px-3 py-2 font-mono-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gold">
                Estimated series built from summary statistics
              </div>
            )}

            <MountNearViewport placeholder={<ChartLoading />}>
              <ChartPanel history={priceHistory} period={chartPeriod} loaded={history != null} />
            </MountNearViewport>
          </div>

          <aside className="rounded-[22px] bg-[#FCE6BE] p-5 sm:p-6 lg:order-1">
            <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">
              Recorded range
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <div className="font-mono-2 text-[10px] uppercase tracking-[0.1em] text-ink-3">Low</div>
                <div className="mt-1 font-mono-2 text-[18px] font-semibold">{formatMarketPrice(recordedLow)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono-2 text-[10px] uppercase tracking-[0.1em] text-ink-3">High</div>
                <div className="mt-1 font-mono-2 text-[18px] font-semibold">{formatMarketPrice(recordedHigh)}</div>
              </div>
            </div>
            <div className="relative mt-10">
              {currentRangePosition != null && currentPrice != null && (
                <div
                  className="absolute -top-8 z-10 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm"
                  style={{
                    left: `${currentRangePosition}%`,
                    transform: `translateX(${currentRangeLabelTranslate})`,
                  }}
                >
                  TCGplayer now · {formatMarketPrice(currentPrice)}
                </div>
              )}
              <div className="h-2 overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#FF6BB8,#FF4936,#E89512)]"
                  style={{ width: `${currentRangePosition ?? 0}%` }}
                />
              </div>
              {currentRangePosition != null && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#FCE6BE] bg-ink shadow-[0_2px_6px_rgba(35,18,8,0.3)]"
                  style={{ left: `${currentRangePosition}%` }}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between font-mono-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              <span>{formatDate(recordedLowAt)}</span>
              <span>{formatDate(recordedHighAt)}</span>
            </div>

            <div className="mt-7 space-y-2 border-t border-ink/20 pt-5">
              <MarketPriceRow
                label="TCGplayer"
                value={formatMarketPrice(currentPrice)}
                tone="yellow"
              />
              <MarketPriceRow
                label="eBay"
                value={formatMarketPrice(ebayMarketPrice)}
                tone="blue"
              />
              <MarketPriceRow
                label="Japanese price"
                value={
                  jpMarketPrice && jpMarketUsd != null
                    ? `${formatJpy(jpMarketPrice.price_jpy)} · ${formatMarketPrice(jpMarketUsd)}`
                    : "Not reported"
                }
                tone="red"
              />
              <MarketPriceRow
                label="All-time high"
                value={formatMarketPrice(priceStats?.ath ?? recordedHigh)}
                tone="neutral"
              />
            </div>
            <p className="mt-5 rounded-[12px] bg-white/50 p-3 font-grotesk text-[12px] leading-relaxed text-ink-2">
              All-time high uses a provider lifetime record when available; otherwise it shows the highest quote in this recorded dataset.
            </p>
          </aside>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReturnCard label="24H return" metric={change1d} currentPrice={currentPrice} />
          <ReturnCard label="7D return" metric={change7d} currentPrice={currentPrice} />
          <ReturnCard label="30D return" metric={change30d} currentPrice={currentPrice} />
          <MetricCard
            label="From recorded low"
            value={formatPct(growthFromLow)}
            valueClass={pctColor(growthFromLow)}
            usdValue={formatSignedUsd(
              currentPrice != null && recordedLow != null ? currentPrice - recordedLow : null
            )}
            foot={recordedLowAt ? `Low set ${formatDate(recordedLowAt)}` : "Waiting for history"}
          />
        </div>
      </section>

      {/* Markets */}
      <section className="mt-10" aria-label="Marketplace pricing">
        <h2 className="font-grotesk text-[30px] font-bold leading-none tracking-[-0.035em] sm:text-[38px]">
          Markets
        </h2>
        <div className="mt-6">
          <MarketEvidence
            extras={extras}
            loaded={extrasLoaded}
            enMarketPrice={currentPrice}
            observedAt={observedAt}
            priceStats={priceStats}
            priceHistory={priceHistory}
          />
        </div>
      </section>
    </section>
  );
}

function DarkChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-ink/15 bg-white/55 px-3 py-1 font-mono-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-2">
      {children}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles = {
    high: "border-[#1F6F47]/25 bg-[#DDF3E7] text-[#1F6F47]",
    medium: "border-[#B46B00]/25 bg-[#FFF0C9] text-[#8C5300]",
    low: "border-[#C93426]/25 bg-[#FFE2DE] text-[#C93426]",
  };
  return (
    <span className={`rounded-full border px-3 py-1 font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${styles[confidence]}`}>
      {confidence} confidence
    </span>
  );
}

function ReturnCard({
  label,
  metric,
  currentPrice,
}: {
  label: string;
  metric: WindowMetric;
  currentPrice: number | null;
}) {
  const available = metric.value != null;
  const sourceLabel =
    metric.source === "provider"
      ? "Provider statistic"
      : metric.source === "history"
        ? `History · ${formatDate(metric.baselineAt)}`
        : "Insufficient cadence";
  return (
    <MetricCard
      label={label}
      value={available ? formatPct(metric.value) : "Not reliable"}
      valueClass={available ? pctColor(metric.value) : "text-ink-3"}
      usdValue={formatSignedUsd(usdMoveFromReturn(currentPrice, metric.value))}
      foot={sourceLabel}
      compact={!available}
    />
  );
}

function MetricCard({
  label,
  value,
  foot,
  usdValue,
  valueClass = "text-ink",
  compact = false,
}: {
  label: string;
  value: string;
  foot: string;
  usdValue: string;
  valueClass?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[18px] border-[1.5px] border-ink bg-bg-2 p-4">
      <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-2">{label}</div>
      <div className={`mt-3 font-mono-2 font-semibold leading-none ${compact ? "text-[16px]" : "text-[25px]"} ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 font-mono-2 text-[13px] font-semibold text-ink">{usdValue}</div>
      <div className="mt-1.5 font-grotesk text-[11px] text-ink-3">{foot}</div>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="flex h-[330px] items-center justify-center font-mono-2 text-xs uppercase tracking-[0.1em] text-ink-3">
      Loading market record…
    </div>
  );
}

function ChartPanel({
  history,
  period,
  loaded,
}: {
  history: PricePoint[];
  period: Period;
  loaded: boolean;
}) {
  if (!loaded) return <ChartLoading />;
  const filtered = filterByPeriod(history, period);
  if (filtered.length === 0) {
    return (
      <div className="flex h-[330px] items-center justify-center rounded-[14px] bg-bg font-mono-2 text-xs uppercase tracking-[0.08em] text-ink-3">
        No observations in this window
      </div>
    );
  }
  return (
    <div className="h-[330px]">
      <Suspense fallback={<ChartLoading />}>
        <PriceChart data={filtered} period={period} />
      </Suspense>
    </div>
  );
}

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
    const element = ref.current;
    if (!element || mounted) return;
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
      { rootMargin: "240px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);

  return <div ref={ref}>{mounted ? children : placeholder}</div>;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink/10 pb-3 font-mono-2 text-[11px] font-semibold">
      <span className="uppercase tracking-[0.08em] text-ink-2">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function MarketPriceRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "yellow" | "blue" | "red" | "neutral";
}) {
  const styles = {
    yellow: "border-[#D28A0A] bg-[#FFF1D2] text-[#8F5B00]",
    blue: "border-[#2F66B1] bg-[#E8F0FC] text-[#2F66B1]",
    red: "border-[#D94C45] bg-[#FCE5E3] text-[#B73A34]",
    neutral: "border-ink/30 bg-white/60 text-ink-2",
  };

  return (
    <div className={`rounded-[11px] border-l-[4px] px-3 py-3 ${styles[tone]}`}>
      <div className="flex items-center justify-between gap-3 font-mono-2 text-[10px] font-semibold">
        <span className="uppercase tracking-[0.08em]">{label}</span>
        <span className="text-right text-ink">{value}</span>
      </div>
    </div>
  );
}

function MarketEvidence({
  extras,
  loaded,
  enMarketPrice,
  observedAt,
  priceStats,
  priceHistory,
}: {
  extras: CardMarketExtrasPayload | null;
  loaded: boolean;
  enMarketPrice: number | null;
  observedAt: string | null;
  priceStats: PriceStatsData | null;
  priceHistory: PricePoint[];
}) {
  const jpPrice = extras?.jpPrice ?? null;
  const ebayRecent = extras?.ebayRecent ?? [];
  const ebayWeekStats = extras?.ebayWeekStats ?? null;
  const ebayStats = extras?.ebayStats ?? null;

  return (
    <div>
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <TcgPlayerMarketCard
          currentPrice={enMarketPrice}
          observedAt={observedAt}
          priceStats={priceStats}
          priceHistory={priceHistory}
        />
        {loaded ? (
          <>
            <EbayMarketCard recent={ebayRecent} weekStats={ebayWeekStats} stats={ebayStats} />
            <JapanMarketCard jp={jpPrice} enMarketPrice={enMarketPrice} />
          </>
        ) : (
          <>
            <EvidenceSkeleton accent="ebay" />
            <EvidenceSkeleton accent="japan" />
          </>
        )}
      </div>
      {loaded && ebayRecent.length > 0 && (
        <div className="mt-5">
          <EbaySalesTape recent={ebayRecent} />
        </div>
      )}
    </div>
  );
}

function TcgPlayerMarketCard({
  currentPrice,
  observedAt,
  priceStats,
  priceHistory,
}: {
  currentPrice: number | null;
  observedAt: string | null;
  priceStats: PriceStatsData | null;
  priceHistory: PricePoint[];
}) {
  const recentRecords = [...priceHistory]
    .filter((point) => pointPrice(point) != null)
    .sort(
      (a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    )
    .slice(0, 3);

  return (
    <div className="h-full rounded-[22px] border-[1.5px] border-[#2F66B1]/45 border-t-[5px] border-t-[#2F66B1] bg-[#E8F0FC] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-[#2F66B1] px-3 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
          TCGplayer
        </span>
        <span className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Quote feed
        </span>
      </div>
      <div className="mt-6 font-mono-2 text-[36px] font-semibold leading-none tracking-[-0.04em] text-[#2F66B1]">
        {formatMarketPrice(currentPrice)}
      </div>
      <div className="mt-2 font-grotesk text-[12px] text-ink-3">
        Current market price · {formatDate(observedAt)}
      </div>
      <div className="mt-5 space-y-3 border-t border-ink/15 pt-4">
        <EvidenceRow label="Low" value={formatMarketPrice(priceStats?.tcg_low)} />
        <EvidenceRow label="Mid" value={formatMarketPrice(priceStats?.tcg_mid)} />
        <EvidenceRow
          label="Listings"
          value={
            priceStats?.tcg_listings_count != null
              ? String(priceStats.tcg_listings_count)
              : "Not reported"
          }
        />
      </div>
      {recentRecords.length > 0 && (
        <div className="mt-5 rounded-[14px] bg-white/55 p-4">
          <div className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#2F66B1]">
            Recent price records
          </div>
          <div className="mt-3 space-y-2">
            {recentRecords.map((point) => (
              <div
                key={point.recorded_at}
                className="flex items-center justify-between gap-4 font-mono-2 text-[10px]"
              >
                <span className="text-ink-3">{formatDate(point.recorded_at)}</span>
                <span className="font-semibold text-ink">
                  {formatMarketPrice(pointPrice(point))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceSkeleton({ accent }: { accent: "ebay" | "japan" }) {
  const accentClass =
    accent === "ebay"
      ? "border-[#D94C45]/45 border-t-[#D94C45] bg-[#FCE5E3]"
      : "border-[#D28A0A]/45 border-t-[#D28A0A] bg-[#FFF1D2]";
  return (
    <div className={`h-[270px] animate-pulse rounded-[22px] border-[1.5px] border-t-[5px] p-6 ${accentClass}`}>
      <div className="h-3 w-28 rounded bg-white/70" />
      <div className="mt-8 h-10 w-44 rounded bg-white/70" />
      <div className="mt-5 h-20 rounded bg-white/70" />
    </div>
  );
}

function JapanMarketCard({
  jp,
  enMarketPrice,
}: {
  jp: JpPriceData | null;
  enMarketPrice: number | null;
}) {
  if (!jp) {
    return (
      <EmptyEvidenceCard
        eyebrow="Japan / Yuyu-tei"
        title="No verified counterpart"
        body="A Japanese price will appear only after the collector number and treatment both match this printing."
        accent="japan"
      />
    );
  }

  const jpUsd = jp.price_jpy / JPY_PER_USD;
  const spread = spreadPct(enMarketPrice, jpUsd);
  return (
    <div className="relative h-full overflow-hidden rounded-[22px] border-[1.5px] border-[#D28A0A]/45 border-t-[5px] border-t-[#D28A0A] bg-[#FFF1D2] p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F4B43A]/10 blur-2xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-full bg-[#D28A0A] px-3 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
            Japan / Yuyu-tei
          </div>
          <span className={`rounded-full px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.1em] ${jp.in_stock ? "bg-[#DDF3E7] text-[#1F6F47]" : "bg-bg-3 text-ink-3"}`}>
            {jp.in_stock ? "In stock" : "Out of stock"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-2 text-[35px] font-semibold leading-none tracking-[-0.04em] text-[#A96D00]">{formatJpy(jp.price_jpy)}</div>
            <div className="mt-2 font-mono-2 text-[13px] text-ink-3">≈ {formatMarketPrice(jpUsd)} USD</div>
          </div>
          <div className="text-right">
            <div className="font-mono-2 text-[9px] uppercase tracking-[0.12em] text-ink-3">EN premium</div>
            <div className="mt-1 font-mono-2 text-[22px] font-semibold text-[#A96D00]">{formatPct(spread)}</div>
          </div>
        </div>
        <div className="mt-6 rounded-[14px] bg-white/55 p-4">
          <div className="font-grotesk text-[13px] font-medium text-ink-2">
            {jp.card_name ?? "Japanese market counterpart"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            <span>Snapshot {formatDate(jp.snapshot_date)}</span>
            <span>{jp.comparison_match === "counterpart" ? "Treatment-matched counterpart" : "Directly linked printing"}</span>
            <span>FX estimate ¥{JPY_PER_USD}/USD</span>
          </div>
        </div>
        {jp.source_url && (
          <a
            href={jp.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A96D00] underline decoration-[#A96D00]/30 underline-offset-4 hover:text-ink"
          >
            Inspect source ↗
          </a>
        )}
      </div>
    </div>
  );
}

const TIER_ROWS: Array<[keyof CardMarketExtrasPayload["ebayStats"]["tiers"], string]> = [
  ["BLACK_LABEL", "Black Label"],
  ["PRISTINE_10", "Pristine 10"],
  ["PSA_10", "PSA 10"],
  ["BGS_10", "BGS 10"],
  ["OTHER_10", "Other 10"],
  ["GRADE_9", "Grade 9–9.5"],
];

function EbayMarketCard({
  recent,
  weekStats,
  stats,
}: {
  recent: EbaySaleData[];
  weekStats: CardMarketExtrasPayload["ebayWeekStats"] | null;
  stats: CardMarketExtrasPayload["ebayStats"] | null;
}) {
  const tierRows = TIER_ROWS.filter(([tier]) => (stats?.tiers?.[tier]?.count ?? 0) > 0);
  const totalComps = (stats?.rawCount ?? 0) + tierRows.reduce((sum, [tier]) => sum + (stats?.tiers[tier].count ?? 0), 0);
  const hasWeeklyRaw = (weekStats?.rawCount ?? 0) > 0;
  const rawAverage = hasWeeklyRaw ? weekStats?.rawAvg ?? null : stats?.rawAvg ?? null;
  const rawCount = hasWeeklyRaw ? weekStats?.rawCount ?? 0 : stats?.rawCount ?? 0;
  const averageWindow = hasWeeklyRaw ? "7-day" : "90-day";

  if (recent.length === 0 && totalComps === 0) {
    return (
      <EmptyEvidenceCard
        eyebrow="eBay / verified solds"
        title="No exact-printing comps"
        body="Sales for cards sharing this collector number are excluded when the treatment differs. That absence is a liquidity signal, not an empty-state bug."
        accent="ebay"
      />
    );
  }

  return (
    <div className="h-full rounded-[22px] border-[1.5px] border-[#D94C45]/45 border-t-[5px] border-t-[#D94C45] bg-[#FCE5E3] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full bg-[#D94C45] px-3 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">eBay</div>
        <span className="rounded-full bg-[#FCE5E3] px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#A52F2A]">Exact printing</span>
      </div>
      <div className="mt-6 font-mono-2 text-[38px] font-semibold leading-none tracking-[-0.04em] text-[#B73A34]">{formatMarketPrice(rawAverage)}</div>
      <div className="mt-2 font-grotesk text-[12px] text-ink-3">
        {rawCount > 0 ? `${averageWindow} raw sold average · n=${rawCount}` : "No raw sold average"}
      </div>
      <div className="mt-5 space-y-3 border-t border-ink/20 pt-4">
        {hasWeeklyRaw && (stats?.rawCount ?? 0) > 0 && (
          <EvidenceRow label={`90D raw · n=${stats?.rawCount ?? 0}`} value={formatMarketPrice(stats?.rawAvg)} />
        )}
        {tierRows.slice(0, 3).map(([tier, label]) => (
          <EvidenceRow
            key={tier}
            label={`${label} · n=${stats?.tiers[tier].count ?? 0}`}
            value={formatMarketPrice(stats?.tiers[tier].avg)}
          />
        ))}
        <EvidenceRow label="90D verified comps" value={String(totalComps)} />
      </div>
    </div>
  );
}

function EmptyEvidenceCard({
  eyebrow,
  title,
  body,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent: "ebay" | "japan";
}) {
  const styles =
    accent === "ebay"
      ? {
          border: "border-[#D94C45]/45 border-t-[#D94C45] bg-[#FCE5E3]",
          pill: "bg-[#D94C45]",
          icon: "bg-white/60 text-[#B73A34]",
        }
      : {
          border: "border-[#D28A0A]/45 border-t-[#D28A0A] bg-[#FFF1D2]",
          pill: "bg-[#D28A0A]",
          icon: "bg-white/60 text-[#A96D00]",
        };
  return (
    <div className={`h-full rounded-[22px] border-[1.5px] border-t-[5px] p-6 ${styles.border}`}>
      <div className={`flex w-fit rounded-full px-3 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white ${styles.pill}`}>{eyebrow}</div>
      <div className={`mt-6 flex h-11 w-11 items-center justify-center rounded-full font-mono-2 text-[17px] font-semibold ${styles.icon}`}>
        —
      </div>
      <h3 className="mt-5 font-grotesk text-[24px] font-bold tracking-[-0.025em]">{title}</h3>
      <p className="mt-3 max-w-[470px] font-grotesk text-[13px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

function EbaySalesTape({ recent }: { recent: EbaySaleData[] }) {
  return (
    <div className="overflow-hidden rounded-[22px] border-[1.5px] border-ink bg-bg-2">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-3 px-5 py-4">
        <h3 className="font-grotesk text-[18px] font-bold">Recent verified sales</h3>
        <span className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">Exact printing · newest first</span>
      </div>
      {recent.map((sale, index) => (
        <div
          key={`${sale.sold_at ?? "unknown"}-${index}`}
          className="grid gap-2 border-t border-ink/10 px-5 py-4 sm:grid-cols-[120px_110px_1fr_120px] sm:items-center sm:gap-4"
        >
          <span className="font-mono-2 text-[11px] font-semibold text-ink-2">{formatDate(sale.sold_at)}</span>
          <span className="w-fit rounded-full border border-ink/20 px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.08em]">
            {sale.grader && sale.grade != null ? `${sale.grader} ${formatGrade(sale.grade)}` : "Raw"}
          </span>
          <span className="font-grotesk text-[12px] text-ink-3">{sale.sale_type ?? "Sold listing"}</span>
          <span className="font-mono-2 text-[17px] font-semibold sm:text-right">
            {sale.ebay_url ? (
              <a href={sale.ebay_url} target="_blank" rel="noopener noreferrer" className="hover:text-coral-text">
                {formatMarketPrice(sale.sale_price)} ↗
              </a>
            ) : (
              formatMarketPrice(sale.sale_price)
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function getMarketConfidence({
  observedAt,
  sampleCount,
  verifiedSales,
  listingsCount,
  synthetic,
}: {
  observedAt: string | null;
  sampleCount: number;
  verifiedSales: number;
  listingsCount: number;
  synthetic: boolean;
}): "high" | "medium" | "low" {
  if (synthetic) {
    return "low";
  }
  const ageDays = observedAt
    ? Math.max(0, (Date.now() - new Date(observedAt).getTime()) / DAY_MS)
    : Number.POSITIVE_INFINITY;
  if (ageDays <= 2 && sampleCount >= 12 && verifiedSales >= 3) {
    return "high";
  }
  if (ageDays <= 7 && sampleCount >= 6 && (verifiedSales > 0 || listingsCount > 0)) {
    return "medium";
  }
  if (verifiedSales === 0) {
    return "low";
  }
  return "low";
}
