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
import { formatPrice, formatPct, pctColor } from "@/lib/utils";
import RarityBadge from "@/components/ui/RarityBadge";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const RARITY_LABELS: Record<string, string> = {
  MR: "Manga Rare", SP: "Special", SEC: "Secret Rare", TR: "Treasure Rare",
  AA: "Alternate Art", L: "Leader", SR: "Super Rare", R: "Rare",
  UC: "Uncommon", C: "Common",
};

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

const COLOR_LABELS: Record<string, { bg: string; text: string }> = {
  Red:    { bg: "bg-[#FF4560]/10", text: "text-[#FF4560]" },
  Blue:   { bg: "bg-[#4F8EF7]/10", text: "text-[#4F8EF7]" },
  Green:  { bg: "bg-[#00D68F]/10", text: "text-[#00D68F]" },
  Purple: { bg: "bg-[#9B72FF]/10", text: "text-[#9B72FF]" },
  Black:  { bg: "bg-white/5",      text: "text-text-2" },
  Yellow: { bg: "bg-[#E8A020]/10", text: "text-owl" },
};

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
      <section className="max-w-[1400px] mx-auto px-4 py-8">
        <p className="text-text-2 text-sm">Loading card data...</p>
      </section>
    );
  }

  if (error || !card) {
    return (
      <section className="max-w-[1400px] mx-auto px-4 py-8">
        <p className="text-loss text-sm">{error ?? "Card not found"}</p>
        <Link href="/sets" className="text-owl text-sm mt-4 inline-block">
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

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-3 mb-6 font-mono">
        <Link href="/sets" className="hover:text-owl transition-colors">Sets</Link>
        {set && (
          <>
            <span>/</span>
            <Link href={`/sets/${set.slug}`} className="hover:text-owl transition-colors">
              {set.code}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-text truncate max-w-[200px]">{card.name}</span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8 mb-10">
        {/* Left — Card Image */}
        <div>
          {card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt={card.name}
              className="w-full max-w-[320px] rounded-lg shadow-lg shadow-black/30"
            />
          ) : (
            <div className="w-full max-w-[320px] aspect-[63/88] rounded-lg bg-surf3" />
          )}
        </div>

        {/* Right — Info + Prices */}
        <div className="flex flex-col gap-5">
          {/* Card name */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{card.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <RarityBadge rarity={card.rarity} />
              {card.rarity && (
                <span className="text-xs text-text-2">
                  {RARITY_LABELS[card.rarity] ?? card.rarity}
                </span>
              )}
              {card.card_type && (
                <span className="text-xs font-mono text-text-2 bg-surf2 px-1.5 py-0.5 rounded border border-border">
                  {card.card_type}
                </span>
              )}
              {card.variant_label && (
                <span className="text-xs font-mono text-text-2 bg-surf2 px-1.5 py-0.5 rounded border border-border">
                  {card.variant_label}
                </span>
              )}
            </div>
          </div>

          {/* Set & meta info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-2">
            {set && (
              <Link href={`/sets/${set.slug}`} className="hover:text-owl transition-colors">
                [{set.code}] {set.name}
              </Link>
            )}
            {set?.series && <span className="text-text-3">&middot;</span>}
            {set?.series && <span>{set.series}</span>}
            {set?.year && <span className="text-text-3">&middot;</span>}
            {set?.year && <span>{set.year}</span>}
          </div>

          {/* Card number */}
          {card.card_number && (
            <div className="text-xs font-mono text-text-3">
              Card # {card.card_number}
            </div>
          )}

          {/* Color tags */}
          {card.color && card.color.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.color.map((c) => {
                const style = COLOR_LABELS[c] ?? { bg: "bg-white/5", text: "text-text-2" };
                return (
                  <span
                    key={c}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${style.bg} ${style.text}`}
                  >
                    {c}
                  </span>
                );
              })}
            </div>
          )}

          {/* Price cards */}
          <div className="grid grid-cols-3 gap-3">
            <PriceCard label="Market Avg" value={priceStats?.market_avg} primary />
            <PriceCard label="TCG Market" value={priceStats?.tcg_market} />
            <PriceCard label="eBay Avg" value={priceStats?.ebay_avg} />
          </div>

          {/* Change row */}
          <div className="grid grid-cols-3 gap-3">
            <ChangeCard label="24h" value={priceStats?.chg_1d} />
            <ChangeCard label="7d" value={priceStats?.chg_7d} />
            <ChangeCard label="30d" value={priceStats?.chg_30d} />
          </div>

          {/* ATH / ATL / Growth */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1">
                All-Time High
              </div>
              <div className="text-sm font-mono text-owl font-medium">
                {formatPrice(priceStats?.ath)}
              </div>
              <div className="text-[10px] font-mono text-text-3 mt-0.5">
                {formatAthDate(priceStats?.ath_date ?? null)}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1">
                All-Time Low
              </div>
              <div className="text-sm font-mono text-text-2 font-medium">
                {formatPrice(priceStats?.atl)}
              </div>
              <div className="text-[10px] font-mono text-text-3 mt-0.5">
                {formatAthDate(priceStats?.atl_date ?? null)}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1">
                Growth from ATL
              </div>
              <div className={`text-sm font-mono font-medium ${pctColor(growth)}`}>
                {formatPct(growth)}
              </div>
              <div className="text-[10px] font-mono text-text-3 mt-0.5">
                price change
              </div>
            </div>
          </div>

          {/* TCG Range */}
          {(priceStats?.tcg_low != null || priceStats?.tcg_mid != null || priceStats?.tcg_high != null) && (
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-2">
                TCG Price Range (30d)
              </div>
              <div className="flex items-center gap-4 font-mono text-sm">
                <div>
                  <span className="text-text-3 text-[10px] mr-1">Low</span>
                  <span className="text-text-2">{formatPrice(priceStats.tcg_low)}</span>
                </div>
                <div className="text-text-3">/</div>
                <div>
                  <span className="text-text-3 text-[10px] mr-1">Mid</span>
                  <span className="text-text">{formatPrice(priceStats.tcg_mid)}</span>
                </div>
                <div className="text-text-3">/</div>
                <div>
                  <span className="text-text-3 text-[10px] mr-1">High</span>
                  <span className="text-text-2">{formatPrice(priceStats.tcg_high)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Last updated */}
          {priceStats?.updated_at && (
            <div className="text-[10px] font-mono text-text-3">
              Prices updated {new Date(priceStats.updated_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </div>
          )}
        </div>
      </div>

      {/* Price History Chart */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold">Price History</h2>
            {historySynthetic && filteredHistory.length > 0 && (
              <span className="text-[10px] font-mono text-text-3 uppercase tracking-wider">
                Estimated from 30-day stats
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                  chartPeriod === p
                    ? "bg-owl/20 text-owl"
                    : "text-text-3 hover:text-text-2 hover:bg-surf2"
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
          <div className="flex items-center justify-center h-[280px] text-text-3 text-sm font-mono">
            No price history available
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function PriceCard({ label, value, primary }: { label: string; value: number | null | undefined; primary?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-lg font-mono font-medium ${primary ? "text-owl" : "text-text"}`}>
        {formatPrice(value)}
      </div>
    </div>
  );
}

function ChangeCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-sm font-mono font-medium ${pctColor(value)}`}>
        {formatPct(value)}
      </div>
    </div>
  );
}

function PriceChart({ data, period }: { data: PricePoint[]; period: Period }) {
  const chartData = {
    labels: data.map((p) => formatDate(p.recorded_at, period)),
    datasets: [
      {
        data: data.map((p) => p.market_avg),
        borderColor: "#E8A020",
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return "rgba(232,160,32,0.05)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(232,160,32,0.19)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          return g;
        },
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
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
        backgroundColor: "rgba(14,22,40,0.95)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        titleFont: { family: "IBM Plex Mono", size: 10 },
        bodyFont: { family: "IBM Plex Mono", size: 11 },
        titleColor: "#7A88A8",
        bodyColor: "#E4EAF6",
        padding: 10,
        callbacks: {
          label: (v: { parsed: { y: number | null } }) =>
            `  $${(v.parsed.y ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.03)" },
        ticks: {
          font: { family: "IBM Plex Mono", size: 10 },
          color: "#7A88A8",
          maxTicksLimit: 8,
          maxRotation: 0,
        },
        border: { display: false },
      },
      y: {
        position: "right" as const,
        grid: { color: "rgba(255,255,255,0.035)" },
        ticks: {
          font: { family: "IBM Plex Mono", size: 10 },
          color: "#7A88A8",
          callback: (v: number | string) => "$" + Number(v).toLocaleString(),
        },
        border: { display: false },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
