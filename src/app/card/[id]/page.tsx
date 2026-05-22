"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { formatPrice, formatPct, pctColor, timeAgo } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface CardData {
  id: string;
  card_image_id: string;
  card_number: string | null;
  name: string;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_type: string | null;
  color: string[];
  image_url: string | null;
  image_url_small: string | null;
}

interface SetData {
  id: string;
  slug: string;
  code: string;
  name: string;
  series: string | null;
  color: string | null;
  year: number | null;
}

interface PriceStatsData {
  market_avg: number | null;
  tcg_market: number | null;
  ebay_avg: number | null;
  tcg_low: number | null;
  tcg_mid: number | null;
  tcg_high: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  updated_at: string | null;
}

interface PricePoint {
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

const PERIODS = ["7d", "1m", "3m", "1y", "max"] as const;
type Period = (typeof PERIODS)[number];

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

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "1y" || period === "max") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAthDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function CardDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [card, setCard] = useState<CardData | null>(null);
  const [set, setSet] = useState<SetData | null>(null);
  const [priceStats, setPriceStats] = useState<PriceStatsData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [historySynthetic, setHistorySynthetic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<Period>("3m");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/card/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Card not found" : "Failed to load card");
          return;
        }
        const data = await res.json();
        setCard(data.card);
        setSet(data.set);
        setPriceStats(data.priceStats);
        setPriceHistory(data.priceHistory);
        setHistorySynthetic(Boolean(data.priceHistorySynthetic));
      } catch {
        setError("Failed to load card data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <section className="card-page max-w-[1180px] mx-auto px-8 py-8">
        <p className="text-ink-2 text-sm font-mono-2">Loading card data...</p>
      </section>
    );
  }

  if (error || !card) {
    return (
      <section className="card-page max-w-[1180px] mx-auto px-8 py-8">
        <p className="text-loss-2 text-sm font-mono-2">{error ?? "Card not found"}</p>
        <Link href="/sets" className="text-coral text-sm mt-4 inline-block hover:underline">
          &larr; Back to Sets
        </Link>
      </section>
    );
  }

  const growth =
    priceStats?.market_avg != null && priceStats?.atl != null && priceStats.atl > 0
      ? ((priceStats.market_avg - priceStats.atl) / priceStats.atl) * 100
      : null;

  const filteredHistory = filterByPeriod(priceHistory, chartPeriod);
  const chg1d = priceStats?.chg_1d;
  const heroPrice = priceStats?.market_avg ?? null;

  return (
    <section className="card-page max-w-[1180px] mx-auto px-8 pt-8 pb-24 text-ink">
      {/* Breadcrumb */}
      <div className="mb-8 font-mono-2 font-semibold text-[12px] tracking-[0.04em] flex items-center flex-wrap">
        <Link href="/sets" className="text-ink-3 hover:text-ink transition-colors">
          Sets
        </Link>
        {set && (
          <>
            <span className="mx-2 text-ink-3">/</span>
            <Link
              href={`/sets/${set.slug}`}
              className="text-ink-3 hover:text-ink transition-colors"
            >
              {set.code} {set.name}
            </Link>
          </>
        )}
        <span className="mx-2 text-ink-3">/</span>
        <span className="text-ink truncate max-w-[300px]">{card.name}</span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-14 items-start">
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
                    href={`/sets/${set.slug}`}
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

          {card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt={card.name}
              className="w-full aspect-[5/7] object-cover rounded-c-md border-[1.5px] border-ink shadow-[0_10px_24px_rgba(26,15,8,0.10)]"
            />
          ) : (
            <div className="w-full aspect-[5/7] rounded-c-md border-[1.5px] border-ink bg-bg-3" />
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
                {historySynthetic && filteredHistory.length > 0 && (
                  <span className="font-mono-2 font-semibold text-[10px] text-ink-3 uppercase tracking-[0.1em]">
                    Estimated from 30-day stats
                  </span>
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

            {filteredHistory.length > 0 ? (
              <div style={{ height: 280 }}>
                <PriceChart data={filteredHistory} period={chartPeriod} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-ink-3 text-sm font-mono-2">
                No price history available
              </div>
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

function PriceChart({ data, period }: { data: PricePoint[]; period: Period }) {
  const chartData = {
    labels: data.map((p) => formatDate(p.recorded_at, period)),
    datasets: [
      {
        data: data.map((p) => p.market_avg),
        borderColor: "#2D9961",
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return "rgba(45,153,97,0.05)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(45,153,97,0.20)");
          g.addColorStop(1, "rgba(45,153,97,0.02)");
          return g;
        },
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#2D9961",
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12, right: 12, bottom: 8, left: 8 } },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(26,15,8,0.95)",
        borderColor: "rgba(26,15,8,0.10)",
        borderWidth: 1,
        titleFont: { family: "JetBrains Mono", size: 10 },
        bodyFont: { family: "JetBrains Mono", size: 11 },
        titleColor: "#9A8475",
        bodyColor: "#FFF5E4",
        padding: 10,
        callbacks: {
          label: (v: { parsed: { y: number | null } }) =>
            `  $${(v.parsed.y ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: {
          font: { family: "JetBrains Mono", size: 10 },
          color: "#9A8475",
          maxTicksLimit: 8,
          maxRotation: 0,
        },
        border: { display: false },
      },
      y: {
        position: "right" as const,
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: {
          font: { family: "JetBrains Mono", size: 10 },
          color: "#9A8475",
          callback: (v: number | string) => "$" + Number(v).toLocaleString(),
        },
        border: { display: false },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
