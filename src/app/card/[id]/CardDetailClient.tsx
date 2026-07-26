"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPct, pctColor, spreadPct, timeAgo } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";
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

function TimeAgoLabel({ date }: { date: string }) {
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  useEffect(() => setClientLabel(timeAgo(date)), [date]);
  return <span suppressHydrationWarning>{clientLabel ?? timeAgo(date)}</span>;
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
  const growthFromLow =
    currentPrice != null && recordedLow != null && recordedLow > 0
      ? ((currentPrice - recordedLow) / recordedLow) * 100
      : overview.growthFromLow;
  const verifiedSales = extras?.ebayRecent.length ?? 0;
  const hasWeeklyEbayRaw = (extras?.ebayWeekStats.rawCount ?? 0) > 0;
  const ebayRawAverage = hasWeeklyEbayRaw
    ? extras?.ebayWeekStats.rawAvg ?? null
    : extras?.ebayStats.rawAvg ?? null;
  const ebayRawCount = hasWeeklyEbayRaw
    ? extras?.ebayWeekStats.rawCount ?? 0
    : extras?.ebayStats.rawCount ?? 0;
  const jpMarketPrice = extras?.jpPrice ?? null;
  const jpUsd = jpMarketPrice ? jpMarketPrice.price_jpy / JPY_PER_USD : null;
  const marketConfidence = getMarketConfidence({
    observedAt,
    sampleCount: overview.sampleCount,
    verifiedSales,
    listingsCount: priceStats?.tcg_listings_count ?? 0,
    synthetic: history?.priceHistorySynthetic ?? false,
  });

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

      {/* 01 — investor snapshot */}
      <section className="relative overflow-hidden rounded-[28px] border-[1.5px] border-ink/15 bg-[linear-gradient(135deg,#FFFDF8_0%,#FFEBDD_52%,#FFF4D7_100%)] text-ink shadow-[0_24px_60px_rgba(91,52,25,0.12)]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-coral/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative grid gap-8 p-5 sm:p-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10 lg:p-9">
          <div className="mx-auto w-full max-w-[230px] lg:mx-0">
            {cardImageSrc ? (
              <Image
                src={cardImageSrc}
                sizes="(max-width: 1023px) 230px, 230px"
                alt={card.name}
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
                01 / Market snapshot
              </span>
              <ConfidenceBadge confidence={marketConfidence.level} />
            </div>

            <h1 className="mt-5 max-w-[760px] font-grotesk text-[30px] font-bold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[38px] lg:text-[44px]">
              {card.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <RarityBadge rarity={card.rarity} />
              {card.variant_label && (
                <DarkChip>{card.variant_label}</DarkChip>
              )}
              {set && <DarkChip>{set.code} {set.name}</DarkChip>}
            </div>

            <div className="mt-8 grid gap-px overflow-hidden rounded-[18px] bg-ink/10 sm:grid-cols-3">
              <MarketQuoteCard
                eyebrow="TCGplayer"
                label="Market price"
                value={formatMarketPrice(currentPrice)}
                detail={observedAt ? `Observed ${formatDate(observedAt)}` : "No quote timestamp"}
                accent="yellow"
              />
              <MarketQuoteCard
                eyebrow="eBay"
                label={hasWeeklyEbayRaw ? "7D sold average" : "Recent sold average"}
                value={extrasLoaded ? formatMarketPrice(ebayRawAverage) : "Checking…"}
                detail={
                  extrasLoaded
                    ? ebayRawCount > 0
                      ? `${ebayRawCount} exact-printing raw sold${ebayRawCount === 1 ? "" : "s"}`
                      : "No exact-printing raw solds"
                    : "Loading verified solds"
                }
                accent="blue"
              />
              <MarketQuoteCard
                eyebrow="Japan"
                label="Yuyu-tei price"
                value={extrasLoaded && jpMarketPrice ? formatJpy(jpMarketPrice.price_jpy) : extrasLoaded ? "—" : "Checking…"}
                detail={
                  extrasLoaded && jpMarketPrice
                    ? `≈ ${formatMarketPrice(jpUsd)} USD · ${formatDate(jpMarketPrice.snapshot_date)}`
                    : extrasLoaded
                      ? "No verified counterpart"
                      : "Loading Japanese market"
                }
                accent="red"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b border-ink/15 pb-5">
              <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                Market read
              </div>
              <p className="max-w-[600px] font-grotesk text-[13px] font-medium leading-relaxed text-ink-2 sm:text-right">
                {marketConfidence.summary}
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[16px] bg-ink/10 sm:grid-cols-3">
              <HeroFact
                label="Last observed"
                value={observedAt ? <TimeAgoLabel date={observedAt} /> : "Unavailable"}
                foot={formatDate(observedAt)}
              />
              <HeroFact
                label="Price evidence"
                value={`${overview.sampleCount} snapshots`}
                foot={overview.firstAt ? `Since ${formatDate(overview.firstAt)}` : "No history yet"}
              />
              <HeroFact
                label="Verified sales"
                value={extrasLoaded ? String(verifiedSales) : "Checking…"}
                foot={verifiedSales > 0 ? "Exact-printing eBay comps" : "Exact printing only"}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReturnCard label="24H return" metric={change1d} />
        <ReturnCard label="7D return" metric={change7d} />
        <ReturnCard label="30D return" metric={change30d} />
        <MetricCard
          label="From recorded low"
          value={formatPct(growthFromLow)}
          valueClass={pctColor(growthFromLow)}
          foot={recordedLowAt ? `Low set ${formatDate(recordedLowAt)}` : "Waiting for history"}
        />
      </div>

      {/* 02 — performance canvas */}
      <section className="mt-14">
        <SectionHeading
          index="02"
          eyebrow="Performance canvas"
          title="Price behavior, without the false precision."
          description="Quote history and rolling market average are separated. Sparse windows stay unavailable instead of becoming artificial zeroes."
        />

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-4 shadow-[0_10px_30px_rgba(55,31,14,0.06)] sm:p-6">
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

          <aside className="rounded-[22px] bg-[#FCE6BE] p-5 sm:p-6">
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
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#FF6BB8,#FF4936,#E89512)]"
                style={{ width: `${Math.max(0, Math.min(100, overview.rangePosition ?? 0))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              <span>{formatDate(recordedLowAt)}</span>
              <span>{formatDate(recordedHighAt)}</span>
            </div>

            <div className="mt-7 space-y-3 border-t border-ink/20 pt-5">
              <EvidenceRow label="TCG low" value={formatMarketPrice(priceStats?.tcg_low)} />
              <EvidenceRow label="TCG midpoint" value={formatMarketPrice(priceStats?.tcg_mid)} />
              <EvidenceRow label="TCG high" value={formatMarketPrice(priceStats?.tcg_high)} />
              <EvidenceRow
                label="Listings"
                value={priceStats?.tcg_listings_count != null ? String(priceStats.tcg_listings_count) : "Not reported"}
              />
              <EvidenceRow
                label="30D volume"
                value={priceStats?.volume_30d != null ? String(priceStats.volume_30d) : "Not reported"}
              />
            </div>
            <p className="mt-5 rounded-[12px] bg-white/50 p-3 font-grotesk text-[12px] leading-relaxed text-ink-2">
              High and low refer to this recorded dataset. They are not presented as lifetime records unless the provider supplies verified all-time statistics.
            </p>
          </aside>
        </div>
      </section>

      {/* 03 — cross-market evidence */}
      <section className="mt-14">
        <SectionHeading
          index="03"
          eyebrow="Markets & evidence"
          title="What buyers are actually paying elsewhere."
          description="TCGplayer quotes, exact-printing eBay solds, and Japanese pricing stay separate so every number keeps its market context."
        />
        <MarketEvidence
          extras={extras}
          loaded={extrasLoaded}
          enMarketPrice={currentPrice}
          priceStats={priceStats}
          priceHistory={priceHistory}
          observedAt={observedAt}
          syntheticHistory={history?.priceHistorySynthetic ?? false}
        />
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

function HeroFact({
  label,
  value,
  foot,
}: {
  label: string;
  value: React.ReactNode;
  foot: string;
}) {
  return (
    <div className="bg-white/60 p-4">
      <div className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-3">{label}</div>
      <div className="mt-2 font-mono-2 text-[15px] font-semibold text-ink">{value}</div>
      <div className="mt-1 font-grotesk text-[11px] text-ink-3">{foot}</div>
    </div>
  );
}

function MarketQuoteCard({
  eyebrow,
  label,
  value,
  detail,
  accent,
}: {
  eyebrow: string;
  label: string;
  value: string;
  detail: string;
  accent: "yellow" | "blue" | "red";
}) {
  const headerClass = {
    yellow: "bg-[#F2C94C] text-[#352509]",
    blue: "bg-[#2F66B0] text-white",
    red: "bg-[#D85045] text-white",
  }[accent];

  return (
    <div className="bg-white/65">
      <div className={`px-4 py-3 font-mono-2 text-[9px] font-bold uppercase tracking-[0.16em] sm:px-5 ${headerClass}`}>
        {eyebrow}
      </div>
      <div className="p-4 sm:p-5">
        <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          {label}
        </div>
        <div className="mt-2 font-mono-2 text-[25px] font-semibold leading-none tracking-[-0.035em] text-ink sm:text-[28px]">
          {value}
        </div>
        <div className="mt-3 min-h-[30px] font-grotesk text-[11px] leading-snug text-ink-3">
          {detail}
        </div>
      </div>
    </div>
  );
}

function ReturnCard({ label, metric }: { label: string; metric: WindowMetric }) {
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
      foot={sourceLabel}
      compact={!available}
    />
  );
}

function MetricCard({
  label,
  value,
  foot,
  valueClass = "text-ink",
  compact = false,
}: {
  label: string;
  value: string;
  foot: string;
  valueClass?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[18px] border-[1.5px] border-ink bg-bg-2 p-4">
      <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-2">{label}</div>
      <div className={`mt-3 font-mono-2 font-semibold leading-none ${compact ? "text-[16px]" : "text-[25px]"} ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 font-grotesk text-[11px] text-ink-3">{foot}</div>
    </div>
  );
}

function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_430px] md:items-end">
      <div>
        <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-coral-text">
          {index} / {eyebrow}
        </div>
        <h2 className="mt-2 max-w-[680px] font-grotesk text-[30px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[38px]">
          {title}
        </h2>
      </div>
      <p className="font-grotesk text-[14px] leading-relaxed text-ink-2">{description}</p>
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

function MarketEvidence({
  extras,
  loaded,
  enMarketPrice,
  priceStats,
  priceHistory,
  observedAt,
  syntheticHistory,
}: {
  extras: CardMarketExtrasPayload | null;
  loaded: boolean;
  enMarketPrice: number | null;
  priceStats: PriceStatsData | null;
  priceHistory: PricePoint[];
  observedAt: string | null;
  syntheticHistory: boolean;
}) {
  const jpPrice = extras?.jpPrice ?? null;
  const ebayRecent = extras?.ebayRecent ?? [];
  const ebayWeekStats = extras?.ebayWeekStats ?? null;
  const ebayStats = extras?.ebayStats ?? null;

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-3">
      <TcgMarketCard
        marketPrice={enMarketPrice}
        priceStats={priceStats}
        history={priceHistory}
        observedAt={observedAt}
        syntheticHistory={syntheticHistory}
      />
      {loaded ? (
        <>
          <EbayMarketCard recent={ebayRecent} weekStats={ebayWeekStats} stats={ebayStats} />
          <JapanMarketCard jp={jpPrice} enMarketPrice={enMarketPrice} />
        </>
      ) : (
        <>
          <EvidenceSkeleton />
          <EvidenceSkeleton />
        </>
      )}
      {loaded && ebayRecent.length > 0 && (
        <div className="lg:col-span-3">
          <EbaySalesTape recent={ebayRecent} />
        </div>
      )}
    </div>
  );
}

function EvidenceSkeleton() {
  return (
    <div className="h-[270px] animate-pulse rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-6">
      <div className="h-3 w-28 rounded bg-bg-3" />
      <div className="mt-8 h-10 w-44 rounded bg-bg-3" />
      <div className="mt-5 h-20 rounded bg-bg-3" />
    </div>
  );
}

function TcgMarketCard({
  marketPrice,
  priceStats,
  history,
  observedAt,
  syntheticHistory,
}: {
  marketPrice: number | null;
  priceStats: PriceStatsData | null;
  history: PricePoint[];
  observedAt: string | null;
  syntheticHistory: boolean;
}) {
  const recentRecords = history
    .map((point) => ({ point, price: pointPrice(point) }))
    .filter((entry): entry is { point: PricePoint; price: number } => entry.price != null)
    .sort(
      (a, b) =>
        new Date(b.point.recorded_at).getTime() - new Date(a.point.recorded_at).getTime()
    )
    .slice(0, 3);

  return (
    <div className="rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">
          TCGplayer / market
        </div>
        <span className="rounded-full bg-coral/10 px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-coral-text">
          Quote feed
        </span>
      </div>
      <div className="mt-5 font-mono-2 text-[38px] font-semibold leading-none tracking-[-0.04em]">
        {formatMarketPrice(marketPrice)}
      </div>
      <div className="mt-2 font-grotesk text-[12px] text-ink-3">
        Current market price {observedAt ? `· ${formatDate(observedAt)}` : ""}
      </div>

      <div className="mt-5 space-y-3 border-t border-ink/20 pt-4">
        <EvidenceRow label="Low" value={formatMarketPrice(priceStats?.tcg_low)} />
        <EvidenceRow label="Mid" value={formatMarketPrice(priceStats?.tcg_mid)} />
        <EvidenceRow
          label="Listings"
          value={priceStats?.tcg_listings_count != null ? String(priceStats.tcg_listings_count) : "Not reported"}
        />
      </div>

      <div className="mt-5 rounded-[14px] bg-bg-3 p-4">
        <div className="font-mono-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Recent price records
        </div>
        <div className="mt-3 space-y-2">
          {recentRecords.length > 0 ? (
            recentRecords.map(({ point, price }) => (
              <div key={point.recorded_at} className="flex items-center justify-between gap-3 font-mono-2 text-[10px] font-semibold">
                <span className="text-ink-3">{formatDate(point.recorded_at)}</span>
                <span>{formatMarketPrice(price)}</span>
              </div>
            ))
          ) : (
            <div className="font-grotesk text-[11px] text-ink-3">No quote history yet.</div>
          )}
        </div>
      </div>
      <p className="mt-4 font-grotesk text-[10px] leading-relaxed text-ink-3">
        {syntheticHistory
          ? "Estimated quote history; not transaction-level sold listings."
          : "TCGplayer supplies market quotes here, not transaction-level last-sold records."}
      </p>
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
      />
    );
  }

  const jpUsd = jp.price_jpy / JPY_PER_USD;
  const spread = spreadPct(enMarketPrice, jpUsd);
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-[#1F47A1] p-6 text-white shadow-[0_12px_34px_rgba(31,71,161,0.18)]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
            Japan / Yuyu-tei
          </div>
          <span className={`rounded-full px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.1em] ${jp.in_stock ? "bg-[#9DE8BF]/20 text-[#B9F4D0]" : "bg-white/10 text-white/60"}`}>
            {jp.in_stock ? "In stock" : "Out of stock"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-2 text-[35px] font-semibold leading-none tracking-[-0.04em]">{formatJpy(jp.price_jpy)}</div>
            <div className="mt-2 font-mono-2 text-[13px] text-white/60">≈ {formatMarketPrice(jpUsd)} USD</div>
          </div>
          <div className="text-right">
            <div className="font-mono-2 text-[9px] uppercase tracking-[0.12em] text-white/50">EN premium</div>
            <div className="mt-1 font-mono-2 text-[22px] font-semibold">{formatPct(spread)}</div>
          </div>
        </div>
        <div className="mt-6 rounded-[14px] bg-black/20 p-4">
          <div className="font-grotesk text-[13px] font-medium text-white/80">
            {jp.card_name ?? "Japanese market counterpart"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/50">
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
            className="mt-5 inline-flex font-mono-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white"
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
        accent="coral"
      />
    );
  }

  return (
    <div className="rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">eBay / verified solds</div>
        <span className="rounded-full bg-gain-2 px-2.5 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-white">Exact printing</span>
      </div>
      <div className="mt-5 font-mono-2 text-[38px] font-semibold leading-none tracking-[-0.04em]">{formatMarketPrice(rawAverage)}</div>
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
  accent = "gold",
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent?: "gold" | "coral";
}) {
  return (
    <div className="rounded-[22px] border-[1.5px] border-ink bg-bg-2 p-6">
      <div className="font-mono-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">{eyebrow}</div>
      <div className={`mt-6 inline-flex h-11 w-11 items-center justify-center rounded-full font-mono-2 text-[17px] font-semibold ${accent === "coral" ? "bg-coral/10 text-coral-text" : "bg-gold/20 text-gold"}`}>
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
}): { level: "high" | "medium" | "low"; summary: string } {
  if (synthetic) {
    return { level: "low", summary: "Estimated history with no direct transaction evidence." };
  }
  const ageDays = observedAt
    ? Math.max(0, (Date.now() - new Date(observedAt).getTime()) / DAY_MS)
    : Number.POSITIVE_INFINITY;
  if (ageDays <= 2 && sampleCount >= 12 && verifiedSales >= 3) {
    return { level: "high", summary: "Fresh quote supported by repeat observations and verified sales." };
  }
  if (ageDays <= 7 && sampleCount >= 6 && (verifiedSales > 0 || listingsCount > 0)) {
    return { level: "medium", summary: "Usable quote, but transaction depth remains limited." };
  }
  if (verifiedSales === 0) {
    return { level: "low", summary: "Thin market: no verified sales for this exact printing." };
  }
  return { level: "low", summary: "Sparse or stale observations limit price confidence." };
}
