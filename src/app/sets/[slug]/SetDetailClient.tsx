"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { gamePath } from "@/lib/game-routes";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { CatalogSetCard, SetData, TopCard } from "../sets-data";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const SET_IMAGE_MAP: Record<string, string> = {
  op01: "op01.jpg", op02: "op02.jpg", op03: "op03.jpg", op04: "op04.jpg",
  op05: "op05.jpg", op06: "op06.jpg", op07: "op07.jpg", op08: "op08.jpg",
  op09: "op09.jpg", op10: "op10.jpg", op11: "op11.jpg", op12: "op12.jpg",
  op13: "op13.jpg", op14: "op14.jpg",
  eb01: "eb01.jpg",
  prb01: "prb01.jpg", prb02: "prb02.webp",
};

type RangeKey = "7d" | "1m" | "3m" | "1y" | "max";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "1m": 30, "3m": 90, "1y": 365, max: 999 };

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isCatalogOnly(set: SetData) {
  return set.pricingStatus === "catalog_only";
}

function setCardCount(set: SetData) {
  return set.cardsTotal ?? set.cards;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function rarityClass(rb: string): "sar" | "sp" | "aa" | "sr" | "mr" | "sec" | "other" {
  const r = rb.toLowerCase();
  if (r.includes("sar")) return "sar";
  if (r.includes("sp")) return "sp";
  if (r.includes("aa")) return "aa";
  if (r.includes("mr")) return "mr";
  if (r.includes("sec")) return "sec";
  if (r.includes("sr")) return "sr";
  return "other";
}

function MiniSpark({ data, up, w, h }: { data: number[]; up: boolean; w: number; h: number }) {
  if (!data || data.length < 2) return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} />;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - mn) / rng) * (h - pad * 2);
    return [x.toFixed(1), y.toFixed(1)] as [string, string];
  });
  const poly = pts.map((p) => p.join(",")).join(" ");
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const fill = `${first[0]},${h} ${poly} ${last[0]},${h}`;
  const stroke = up ? "#2D9961" : "#E04E4E";
  const fillCol = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <polygon points={fill} fill={fillCol} />
      <polyline points={poly} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

function PerfCell({ period, v }: { period: string; v: number | null }) {
  const cls = v == null || v === 0 ? "flat" : v > 0 ? "up" : "dn";
  return (
    <div className="setd-perf-cell">
      <div className="setd-perf-period">{period}</div>
      <div className={`setd-perf-val ${cls}`}>
        {v == null ? "—" : v === 0 ? "0.0%" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
      </div>
    </div>
  );
}

function generateChartData(set: SetData, range: RangeKey): { x: string; y: number }[] {
  const numDays = RANGE_DAYS[range];
  const base = set.price;
  const vol = base * 0.03;
  const trend = set.chg7d / 100;
  const pts: { x: string; y: number }[] = [];
  let p = base * (1 - trend * 0.9);
  const len = Math.max(numDays, 7);
  for (let i = len; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const noise = (Math.random() - 0.46) * vol;
    p = Math.max(p + (trend * base) / len + noise, base * 0.2);
    pts.push({ x: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), y: +p.toFixed(2) });
  }
  if (pts.length > 0) pts[pts.length - 1].y = base;
  return pts;
}

function chgCell(v: number) {
  if (v === 0) return <span className="setd-tc-chg flat">0%</span>;
  const up = v > 0;
  return <span className={`setd-tc-chg ${up ? "up" : "dn"}`}>{up ? "+" : ""}{v}%</span>;
}

export default function SetDetailClient({
  set,
  allSets,
  gameRouteSlug,
  gameName = "One Piece TCG",
}: {
  set: SetData;
  allSets: SetData[];
  gameRouteSlug?: string | null;
  gameName?: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("1m");
  const [chartSeed, setChartSeed] = useState(0);

  const colorCss = useMemo(() => ({
    ["--set-color" as string]: set.color,
    ["--set-color-d" as string]: hexToRgba(set.color, 0.16),
    ["--set-color-bd" as string]: hexToRgba(set.color, 0.32),
  } as React.CSSProperties), [set.color]);

  const chartPoints = useMemo(() => generateChartData(set, range), [set, range, chartSeed]);

  const chartData: ChartData<"line"> = useMemo(() => ({
    labels: chartPoints.map((p) => p.x),
    datasets: [
      {
        data: chartPoints.map((p) => p.y),
        borderColor: set.color,
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx) => {
          const chart = ctx.chart;
          const { chartArea } = chart;
          if (!chartArea) return hexToRgba(set.color, 0.1);
          const g = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, hexToRgba(set.color, 0.28));
          g.addColorStop(1, hexToRgba(set.color, 0));
          return g;
        },
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
    ],
  }), [chartPoints, set.color]);

  const chartOptions: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10, right: 8, bottom: 6, left: 6 } },
    interaction: { mode: "index", intersect: false },
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
        callbacks: { label: (item) => `  ${fmtUsd(Number(item.parsed.y))}` },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#9A8475", maxTicksLimit: 6, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        position: "right",
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#9A8475", callback: (v) => "$" + Number(v).toLocaleString() },
        border: { display: false },
      },
    },
  }), []);

  const boosters = allSets.filter((s) => (s.type ?? "") === "op");
  const mains = allSets.filter((s) => (s.type ?? "") === "main");
  const extras = allSets.filter((s) => (s.type ?? "") === "eb");
  const premiums = allSets.filter((s) => (s.type ?? "") === "prb");
  const starters = allSets.filter((s) => (s.type ?? "") === "st");
  const promos = allSets.filter((s) => (s.type ?? "") === "promo");
  const organized = allSets.filter((s) => (s.type ?? "") === "organized");
  const judges = allSets.filter((s) => (s.type ?? "") === "judge");

  const catalogOnly = isCatalogOnly(set);
  const catalogCards = set.catalogCards ?? [];
  const cardCount = setCardCount(set);
  const isLive = !catalogOnly && !set.comingSoon && set.cards > 0;
  const deltaClass = set.chg30d === 0 ? "flat" : set.chg30d > 0 ? "up" : "dn";

  const imgSlug = set.slug.replace(/-/g, "").toLowerCase();
  const imgFile = SET_IMAGE_MAP[imgSlug];

  function chip(s: SetData) {
    const isActive = s.slug === set.slug;
    const arrow = s.chg30d > 0 ? "▲" : s.chg30d < 0 ? "▼" : "·";
    const arrowCls = s.chg30d > 0 ? "up" : s.chg30d < 0 ? "dn" : "";
    return (
      <Link key={s.slug} href={gamePath(gameRouteSlug, `/sets/${s.slug}`)} className={`setd-chip${isActive ? " active" : ""}`}>
        <span>{s.code}</span>
        <span className={`setd-chip-arrow ${arrowCls}`}>{arrow}</span>
      </Link>
    );
  }

  function changeRange(next: RangeKey) {
    setRange(next);
    setChartSeed((s) => s + 1);
  }

  return (
    <section className="setd-page" style={colorCss}>
      <div className="setd-breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep">›</span>
        <Link href={gamePath(gameRouteSlug, "/sets")}>Sets</Link>
        <span className="bsep">›</span>
        <span className="here">{set.code}</span>
      </div>

      <div className="setd-nav">
        <div className="setd-nav-left">
          <Link href={gamePath(gameRouteSlug, "/sets")} className="setd-back">
            <span className="setd-back-arrow">←</span>
            <span className="setd-back-meta">
              <b>All Sets</b>
              <span>Browse {allSets.length} sets</span>
            </span>
          </Link>
          <div className="setd-nav-id">
            <span className="setd-nav-code">{set.code}</span>
            {set.year && <span className="setd-nav-year">{set.year}</span>}
            <span className="setd-nav-name">{set.name}</span>
          </div>
        </div>
      </div>

      <div className="setd-switcher">
        {mains.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Main</span>
            <div className="setd-switcher-chips">{mains.map(chip)}</div>
          </div>
        )}
        {boosters.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Booster</span>
            <div className="setd-switcher-chips">{boosters.map(chip)}</div>
          </div>
        )}
        {(extras.length > 0 || premiums.length > 0) && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Extras</span>
            <div className="setd-switcher-chips">
              {extras.map(chip)}
              {extras.length > 0 && premiums.length > 0 && <div className="setd-chip-divider" />}
              {premiums.map(chip)}
            </div>
          </div>
        )}
        {starters.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Starter</span>
            <div className="setd-switcher-chips">{starters.map(chip)}</div>
          </div>
        )}
        {promos.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Promo</span>
            <div className="setd-switcher-chips">{promos.map(chip)}</div>
          </div>
        )}
        {organized.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Organized</span>
            <div className="setd-switcher-chips">{organized.map(chip)}</div>
          </div>
        )}
        {judges.length > 0 && (
          <div className="setd-switcher-row">
            <span className="setd-switcher-label">Judge</span>
            <div className="setd-switcher-chips">{judges.map(chip)}</div>
          </div>
        )}
      </div>

      <div className="setd-hero">
        <div className="setd-id-card">
          <div className="setd-id-art">
            <div className="setd-id-glow" />
            <div className="setd-id-box">
              {imgFile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/sets/${imgFile}`} alt={`${set.code} ${set.name} Booster Box`} />
              ) : (
                boxArtIcon(set.code)
              )}
            </div>
            <div className="setd-id-art-label">{boxArtCaption(set.code)}</div>
          </div>
          <div className="setd-id-head">
            <div className="setd-id-head-bg" />
            <span className="setd-id-code">{set.code}{set.year ? ` · ${set.year}` : ""}</span>
            <div className="setd-id-name">{set.name}</div>
            <div className="setd-id-desc">
              {catalogOnly
                ? `${gameName} ${set.code} - ${cardCount.toLocaleString()} catalog cards imported. Pricing is not enabled yet.`
                : `${gameName} ${set.code} - ${set.cards} priced cards in this print run.`}
            </div>
          </div>
          <div className="setd-id-rows">
            <div className="setd-id-row">
              <span className="setd-id-key">Index Value</span>
              <span className="setd-id-val" style={{ color: "var(--set-color)" }}>
                {isLive ? fmtUsd(set.price) : "—"}
              </span>
            </div>
            <div className="setd-id-row">
              <span className="setd-id-key">All-Time High</span>
              <span className="setd-id-val">{isLive ? set.ath : "—"}</span>
            </div>
            <div className="setd-id-row">
              <span className="setd-id-key">All-Time Low</span>
              <span className="setd-id-val">{isLive ? set.atl : "—"}</span>
            </div>
            <div className="setd-id-row">
              <span className="setd-id-key">{catalogOnly ? "Cards Imported" : "Cards Priced"}</span>
              <span className="setd-id-val">
                {catalogOnly
                  ? cardCount.toLocaleString()
                  : `${set.cards}${set.cardsTotal && set.cardsTotal !== set.cards ? `/${set.cardsTotal}` : ""}`}
              </span>
            </div>
            <div className="setd-id-row">
              <span className="setd-id-key">Release</span>
              <span className="setd-id-val">{set.year ?? "TBD"}</span>
            </div>
            <div className="setd-id-row">
              <span className="setd-id-key">24H Volume</span>
              <span className="setd-id-val muted">{set.volume}</span>
            </div>
          </div>
        </div>

        <div className="setd-chart-card">
          <div className="setd-cc-head">
            <div>
              <div className="setd-cc-eyebrow">Index Performance</div>
              <div className="setd-cc-title">{set.code} {set.name} Index</div>
              <div className="setd-cc-price-row">
                <span className="setd-cc-price">{isLive ? fmtUsd(set.price) : "—"}</span>
                <span className={`setd-cc-delta ${deltaClass}`}>
                  {set.chg30d === 0 ? "" : set.chg30d > 0 ? "+" : ""}{set.chg30d}%{" "}
                  <span style={{ color: "inherit", opacity: 0.75, fontSize: 10, marginLeft: 3 }}>30D</span>
                </span>
              </div>
              <div className="setd-cc-sub">
                {isLive ? `Total card value · ${set.cards} cards tracked · USD` : `${cardCount.toLocaleString()} catalog cards tracked`}
              </div>
            </div>
            <div className="setd-cc-times">
              {(["7d", "1m", "3m", "1y", "max"] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`setd-cc-time ${range === r ? "on" : ""}`}
                  onClick={() => changeRange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="setd-cc-chart">
            {isLive ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="setd-cc-empty">No price history yet for this set.</div>
            )}
          </div>
          <div className="setd-perf-strip">
            <PerfCell period="1H" v={isLive ? 0 : null} />
            <PerfCell period="24H" v={isLive ? set.chg1d : null} />
            <PerfCell period="7D" v={isLive ? set.chg7d : null} />
            <PerfCell period="30D" v={isLive ? set.chg30d : null} />
            <PerfCell period="1Y" v={isLive ? set.chgMax : null} />
            <PerfCell period="MAX" v={isLive ? set.chgMax : null} />
          </div>
        </div>
      </div>

      <div className="setd-tc-section">
        <div className="setd-tc-head">
          <div>
            <div className="setd-tc-eyebrow">Holdings</div>
            <div className="setd-tc-title">
              {catalogOnly ? "Catalog Cards" : "Top Cards"} in <span>{set.code}</span>
            </div>
            <div className="setd-tc-sub">
              {catalogOnly
                ? `${catalogCards.length.toLocaleString()} preview cards · ${cardCount.toLocaleString()} total imported`
                : `${set.topCards.length} of ${cardCount.toLocaleString()} cards · sorted by average market price`}
            </div>
          </div>
          {catalogOnly ? (
            <Link href={`${gamePath(gameRouteSlug, "/catalog")}?set=${set.slug}`} className="setd-tc-link">
              View all {cardCount.toLocaleString()} in catalog →
            </Link>
          ) : (
            <Link href={`${gamePath(gameRouteSlug, "/markets")}?set=${set.slug}`} className="setd-tc-link">
              View all {cardCount.toLocaleString()} in markets →
            </Link>
          )}
        </div>
        <div className="setd-tc-wrap">
          {catalogOnly ? (
            <CatalogCardsTable cards={catalogCards} gameRouteSlug={gameRouteSlug} setCode={set.code} />
          ) : set.topCards.length === 0 ? (
            <div className="setd-empty-state">No priced cards in this set yet.</div>
          ) : (
            <table className="setd-tc-table">
              <colgroup>
                <col className="c-rank" />
                <col className="c-card" />
                <col className="c-rar" />
                <col className="c-avg" />
                <col className="c-tcg" />
                <col className="c-d1" />
                <col className="c-d7" />
                <col className="c-d30" />
                <col className="c-spark" />
              </colgroup>
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th>Card</th>
                  <th>Rarity</th>
                  <th className="r">Avg Price</th>
                  <th className="r">TCGPlayer</th>
                  <th className="r">24H</th>
                  <th className="r">7D</th>
                  <th className="r">30D</th>
                  <th className="r">7D Trend</th>
                </tr>
              </thead>
              <tbody>
                {set.topCards.map((c: TopCard, i: number) => {
                  const cardId = c.id;
                  return (
                    <tr
                      key={cardId ?? i}
                      onClick={() => cardId && router.push(gamePath(gameRouteSlug, `/card/${cardId}`))}
                      style={{ cursor: cardId ? "pointer" : "default" }}
                    >
                      <td className="setd-tc-rank">{i + 1}</td>
                      <td>
                        <div className="setd-tc-card-cell">
                          <div className="setd-tc-card-art">
                            {c.img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.img} alt={c.n} loading="lazy" />
                            ) : (
                              c.e
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="setd-tc-card-name">{c.n}</div>
                            <div className="setd-tc-tag-row">
                              <span className="setd-tc-set-tag">{set.code}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`setd-rb ${rarityClass(c.rb)}`}>{c.rl}</span>
                      </td>
                      <td className="setd-tc-price">{fmtUsd(c.avg)}</td>
                      <td className="setd-tc-price">{fmtUsd(c.tcg)}</td>
                      <td>{chgCell(c.d1)}</td>
                      <td>{chgCell(c.d7)}</td>
                      <td>{chgCell(c.d30)}</td>
                      <td className="setd-tc-spark">
                        <MiniSpark data={c.sp} up={c.d7 >= 0} w={90} h={22} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function CatalogCardsTable({
  cards,
  gameRouteSlug,
  setCode,
}: {
  cards: CatalogSetCard[];
  gameRouteSlug?: string | null;
  setCode: string;
}) {
  if (cards.length === 0) {
    return <div className="setd-empty-state">No catalog cards imported for this set yet.</div>;
  }

  return (
    <table className="setd-tc-table setd-catalog-table">
      <colgroup>
        <col className="c-rank" />
        <col className="c-card" />
        <col className="c-rar" />
        <col className="c-variant" />
        <col className="c-type" />
        <col className="c-cost" />
        <col className="c-domain" />
      </colgroup>
      <thead>
        <tr>
          <th className="r">#</th>
          <th>Card</th>
          <th>Rarity</th>
          <th>Variant</th>
          <th>Type</th>
          <th className="r">Cost</th>
          <th>Domain</th>
        </tr>
      </thead>
      <tbody>
        {cards.map((card, index) => (
          <tr key={card.id}>
            <td className="setd-tc-rank">{index + 1}</td>
            <td>
              <Link href={gamePath(gameRouteSlug, `/catalog/${card.id}`)} className="setd-catalog-card-link">
                <div className="setd-tc-card-cell">
                  <div className="setd-tc-card-art">
                    {card.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.img} alt={card.name} loading="lazy" />
                    ) : (
                      setCode
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="setd-tc-card-name">{card.name}</div>
                    <div className="setd-tc-tag-row">
                      <span className="setd-tc-set-tag">{card.number ?? card.cardImageId ?? setCode}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </td>
            <td>
              <span className={`setd-rb ${rarityClass(card.rarity ?? "")}`}>{card.rarity ?? "Unknown"}</span>
            </td>
            <td className="setd-catalog-muted">{card.variant ?? "Base"}</td>
            <td className="setd-catalog-muted">{card.type ?? "Catalog card"}</td>
            <td className="setd-tc-price">{card.cost ?? "—"}</td>
            <td className="setd-catalog-muted">{card.domains ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function boxArtIcon(code: string): string {
  const prefix = code.replace(/[0-9]/g, "");
  if (["OGN", "SFD", "UNL", "OGS", "OPP", "JDG"].includes(code)) return "RB";
  if (prefix === "OP") return "⚓";
  if (prefix === "EB") return "✨";
  if (prefix === "PRB") return "💎";
  if (prefix === "ST") return "🎴";
  if (code === "P") return "📜";
  return "🦉";
}

function boxArtCaption(code: string): string {
  const prefix = code.replace(/[0-9]/g, "");
  if (["OGN", "SFD", "UNL"].includes(code)) return `Main Set · ${code}`;
  if (code === "OGS") return `Starter Deck · ${code}`;
  if (code === "OPP") return `Organized Play · ${code}`;
  if (code === "JDG") return `Judge Promo · ${code}`;
  if (prefix === "OP") return `Booster Box · ${code}`;
  if (prefix === "EB") return `Extra Booster · ${code}`;
  if (prefix === "PRB") return `Premium · ${code}`;
  if (prefix === "ST") return `Starter Deck · ${code}`;
  if (code === "P") return "Promo Bin";
  return code;
}
