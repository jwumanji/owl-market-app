"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { SealedDetailData } from "./load-sealed-detail";
import "../terminal.css";
import "./sealed-detail.css";

// ---------------------------------------------------------------------------
// SealedDetailClient — §3.1 hero + §3.2 price history, all interactivity.
// Set value / Value Ratio arrive AS PROPS from the server loader —
// market_index_snapshots is service-role-only and must never be fetched from
// here (spec §6). No useSearchParams anywhere on this surface (CLAUDE.md §7).
// chart.js per the SetChartClient / PriceChartClient pattern: register at
// module scope with only the elements this chart needs.
// ---------------------------------------------------------------------------

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const EM = "—"; // em-dash — the only rendering for missing values, never 0
const DAY_MS = 86_400_000;

// Timeframes are DATA-DRIVEN: adding 1Y later (once our own accumulated
// history is deep enough — JustTCG's ~90-day ceiling caps launch depth) is a
// new entry here, not surgery (spec §3.2).
const TIMEFRAMES = [
  { key: "30D", days: 30, resolution: "DAILY" },
  { key: "90D", days: 90, resolution: "DAILY" },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];
type ViewKey = "chart" | "table";

// -- formatting ---------------------------------------------------------------

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return EM;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** Raw-row rendering (table / tooltip / CSV) keeps the cents. */
function fmtMoneyExact(v: number | null | undefined): string {
  if (v == null) return EM;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return EM;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtMult(v: number | null | undefined): string {
  if (v == null) return EM;
  return `${v.toFixed(1)}×`;
}

/** Exactly-zero deltas are --ink-3 (t-flat), never green — spec §8. */
function deltaCls(v: number | null | undefined): string {
  if (v == null || v === 0) return "t-flat";
  return v > 0 ? "t-up" : "t-down";
}

function parseDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** "APR 28" */
function fmtChartDate(iso: string): string {
  return new Date(parseDay(iso))
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit" })
    .toUpperCase();
}

/** "SEP 06 2025" */
function fmtDateFull(iso: string): string {
  return new Date(parseDay(iso))
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

/**
 * H1 split: last two words carry the Caveat gradient (spec §3.1). A dangling
 * separator left on the plain part ("… New World -") is stripped.
 */
function splitTitle(name: string): { head: string; script: string } {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return { head: "", script: words.join(" ") };
  const script = words.slice(-2).join(" ");
  const head = words
    .slice(0, -2)
    .join(" ")
    .replace(/[-–·:]+$/, "")
    .trim();
  return { head, script };
}

function productTypeLabel(type: string): string {
  return type.replace(/_/g, " ").toUpperCase();
}

// -- chart color plumbing -----------------------------------------------------
// chart.js needs concrete color strings; read the C1.5 tokens at runtime so
// the canvas stays in sync with the CSS (fallbacks mirror globals.css).

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(31,111,71,${alpha})`;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Index a series to 100 = its first non-null point in the window (the scale
 * rule, spec §3.2). Overlay series that begin mid-window (set value is null
 * before the first snapshot ever) index to their own first available point.
 */
function indexTo100(values: (number | null)[]): (number | null)[] {
  const base = values.find((v): v is number => v != null);
  if (base == null || base === 0) return values.map(() => null);
  return values.map((v) => (v == null ? null : (v / base) * 100));
}

// -- component ----------------------------------------------------------------

export default function SealedDetailClient({ data }: { data: SealedDetailData }) {
  const [tf, setTf] = useState<TimeframeKey>("90D"); // default 90D (spec §3.2)
  // Timeframe is independent state — it survives CHART ↔ TABLE toggling in
  // both directions because nothing ever resets it (spec §8 criterion).
  const [view, setView] = useState<ViewKey>("chart");
  const [showSetValue, setShowSetValue] = useState(false);
  const [showRatio, setShowRatio] = useState(false);

  const { product } = data;
  const tfCfg = TIMEFRAMES.find((t) => t.key === tf) ?? TIMEFRAMES[TIMEFRAMES.length - 1];
  const anyOverlay = showSetValue || showRatio;

  const colors = useMemo(
    () => ({
      gain: cssVar("--gain-2", "#1F6F47"),
      gold: cssVar("--gold", "#E89512"),
      select: cssVar("--select", "#1F47A1"),
      ink3: cssVar("--ink-3", "#9A8475"),
      bg2: cssVar("--bg-2", "#FFFFFF"),
    }),
    []
  );

  // All rows with their day-over-day change, chronological. The change of the
  // oldest row inside a window is still computed against the true previous day.
  const allRows = useMemo(
    () =>
      data.points.map((p, i, arr) => ({
        ...p,
        day: parseDay(p.date),
        change:
          i === 0 || arr[i - 1].price === 0
            ? null
            : ((p.price - arr[i - 1].price) / arr[i - 1].price) * 100,
      })),
    [data.points]
  );

  // Window anchored to the last day WITH data — never "today" (the daily cron
  // may not have fired; data can be frozen).
  const windowPoints = useMemo(() => {
    if (allRows.length === 0) return [];
    const latestDay = allRows[allRows.length - 1].day;
    const cutoff = latestDay - (tfCfg.days - 1) * DAY_MS;
    return allRows.filter((r) => r.day >= cutoff);
  }, [allRows, tfCfg]);

  const tableRows = useMemo(() => [...windowPoints].reverse(), [windowPoints]); // newest first

  // -- hero derived bits ------------------------------------------------------

  const { head, script } = splitTitle(product.name);
  const regionLabel = product.region === "jp" ? "JAPANESE" : "ENGLISH";

  // Real span of OUR OWN rows — computed, never the string "52-WEEK RANGE"
  // (spec §3.1; ~13 weeks is the launch normal, not an edge case).
  const rangeLabel = useMemo(() => {
    if (allRows.length === 0) return null;
    const daysCovered =
      Math.round((allRows[allRows.length - 1].day - allRows[0].day) / DAY_MS) + 1;
    if (daysCovered < 14) return `${daysCovered}-DAY RANGE`;
    return `${Math.round(daysCovered / 7)}-WEEK RANGE`;
  }, [allRows]);

  const markerPct = useMemo(() => {
    if (data.ath == null || data.atl == null || data.latestPrice == null) return null;
    if (data.atAth) return 100; // spec §3.1 edge case — AT ATH pins the marker
    if (data.ath.price === data.atl.price) return 100; // flat history: current === ath === atl
    const pct =
      ((data.latestPrice - data.atl.price) / (data.ath.price - data.atl.price)) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [data.ath, data.atl, data.latestPrice, data.atAth]);

  // -- CSV (decision D8: WATCHLIST is a disabled stub; CSV works client-side) --

  const downloadCsv = () => {
    const lines = ["date,box_price,change_pct,set_value,value_ratio"];
    for (const r of tableRows) {
      lines.push(
        [
          r.date,
          r.price.toFixed(2),
          r.change == null ? "" : r.change.toFixed(2),
          r.setValue == null ? "" : r.setValue.toFixed(2),
          r.ratio == null ? "" : r.ratio.toFixed(4),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${product.slug}-${tf.toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // -- chart ------------------------------------------------------------------

  const chartData: ChartData<"line"> = useMemo(() => {
    const labels = windowPoints.map((p) => fmtChartDate(p.date));
    const prices = windowPoints.map((p) => p.price as number | null);
    const setValues = windowPoints.map((p) => p.setValue);
    const ratios = windowPoints.map((p) => p.ratio);
    const fewPoints = windowPoints.length <= 2;

    // THE SCALE RULE (spec §3.2): zero overlays → raw USD + 12% area fill.
    // Any overlay → every series indexed to 100 at its first point in window,
    // fill off. Dollars and multipliers never share a raw axis.
    const priceSeries = anyOverlay ? indexTo100(prices) : prices;

    const datasets: ChartData<"line">["datasets"] = [
      {
        label: "BOX",
        data: priceSeries,
        borderColor: colors.gain,
        borderWidth: 2.2,
        fill: !anyOverlay,
        backgroundColor: hexToRgba(colors.gain, 0.12),
        tension: 0.35,
        pointRadius: fewPoints ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: colors.gain,
        pointBorderColor: colors.bg2,
        pointBorderWidth: 2,
      },
    ];

    if (showSetValue) {
      datasets.push({
        label: "SET",
        // Carry-forward makes set value a step function between weekly
        // snapshots (spec §2.3) — stepped rendering states that honestly.
        data: indexTo100(setValues),
        borderColor: colors.gold,
        borderWidth: 2.2,
        borderDash: [7, 5],
        fill: false,
        stepped: true,
        pointRadius: fewPoints ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: colors.gold,
        pointBorderColor: colors.bg2,
        pointBorderWidth: 2,
      });
    }

    if (showRatio) {
      datasets.push({
        label: "RATIO",
        data: indexTo100(ratios),
        borderColor: colors.select,
        borderWidth: 2.2,
        borderDash: [7, 5],
        fill: false,
        stepped: true,
        pointRadius: fewPoints ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: colors.select,
        pointBorderColor: colors.bg2,
        pointBorderWidth: 2,
      });
    }

    return { labels, datasets };
  }, [windowPoints, anyOverlay, showSetValue, showRatio, colors]);

  const chartOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, right: 10, bottom: 6, left: 6 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        // Built-in tooltip: mouse + touch, auto-flips alignment at both edges
        // so it stays inside the container. Values shown are always the RAW
        // figures, even in indexed mode.
        tooltip: {
          backgroundColor: "rgba(26,15,8,0.95)",
          borderColor: "rgba(26,15,8,0.10)",
          borderWidth: 1,
          titleFont: { family: "JetBrains Mono", size: 10 },
          bodyFont: { family: "JetBrains Mono", size: 11 },
          titleColor: colors.ink3,
          bodyColor: cssVar("--bg", "#FFF5E4"),
          padding: 10,
          callbacks: {
            title: (items) => {
              const p = windowPoints[items[0]?.dataIndex ?? -1];
              return p ? fmtDateFull(p.date) : "";
            },
            label: (item) => {
              const p = windowPoints[item.dataIndex];
              if (!p) return "";
              if (item.dataset.label === "SET") return `  SET ${fmtMoney(p.setValue)}`;
              if (item.dataset.label === "RATIO")
                return `  RATIO ${p.ratio == null ? EM : `${p.ratio.toFixed(2)}×`}`;
              return `  BOX ${fmtMoneyExact(p.price)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(26,15,8,0.06)" },
          ticks: {
            font: { family: "JetBrains Mono", size: 10 },
            color: colors.ink3,
            maxTicksLimit: 7,
            maxRotation: 0,
          },
          border: { display: false },
        },
        y: {
          position: "right",
          grid: { color: "rgba(26,15,8,0.06)" },
          ticks: {
            font: { family: "JetBrains Mono", size: 10 },
            color: colors.ink3,
            callback: (v) =>
              anyOverlay ? String(Math.round(Number(v))) : "$" + Number(v).toLocaleString(),
          },
          border: { display: false },
        },
      },
    }),
    [windowPoints, anyOverlay, colors]
  );

  const axisLabel =
    anyOverlay && windowPoints.length > 0
      ? `INDEXED · 100 = ${fmtChartDate(windowPoints[0].date)}`
      : "BOX PRICE (USD)";

  const windowSpan =
    windowPoints.length > 0
      ? `${fmtChartDate(windowPoints[0].date)} → ${fmtChartDate(windowPoints[windowPoints.length - 1].date)}`
      : EM;

  // -- render -----------------------------------------------------------------

  const deltaChips: Array<{ label: string; value: number | null }> = [
    { label: "7D", value: data.d7 },
    { label: "30D", value: data.d30 },
    { label: "90D", value: data.d90 },
  ];

  return (
    <>
      {/* ================= §3.1 · HERO ================= */}
      <header className="sd-hero">
        <div className="sd-art">
          {product.imageUrl ? (
            <Image
              className="sd-art-img"
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 720px) 150px, 200px"
              priority
            />
          ) : (
            <div className="sd-art-fallback" aria-hidden="true">
              <div className="sd-art-code">{(product.setCode ?? "?").replace(/-/g, "")}</div>
              <div className="sd-art-kind">
                {productTypeLabel(product.productType)}
                {product.packsPerUnit != null ? ` · ${product.packsPerUnit} PACKS` : ""}
              </div>
            </div>
          )}
        </div>

        <div className="sd-main">
          <div className="sd-eyebrow">SEALED PRODUCT · {regionLabel}</div>
          <h1 className="sd-title">
            {head ? `${head} ` : ""}
            <em className="sd-script">{script}</em>
          </h1>

          <div className="sd-price-row">
            <div className="sd-big-price">{fmtMoney(data.latestPrice)}</div>
            <div className="sd-dchips">
              {deltaChips.map((c) => (
                <span key={c.label} className="sd-dchip">
                  <small>{c.label}</small>
                  <span className={deltaCls(c.value)}>{fmtPct(c.value)}</span>
                </span>
              ))}
            </div>
          </div>

          {data.ath && data.atl && data.latestPrice != null && markerPct != null && (
            <div className="sd-range">
              <div className="sd-range-head">
                <span>{rangeLabel}</span>
                {data.atAth ? (
                  <span className="t-up">AT ATH</span>
                ) : (
                  <span>
                    {data.offAth == null ? EM : `${Math.abs(data.offAth).toFixed(1)}% OFF ATH`}
                  </span>
                )}
              </div>
              <div className="sd-range-track">
                <div className="sd-range-marker" style={{ left: `${markerPct}%` }}>
                  <span
                    className={`sd-range-v${markerPct > 88 ? " hi" : markerPct < 12 ? " lo" : ""}`}
                  >
                    {fmtMoney(data.latestPrice)}
                  </span>
                </div>
              </div>
              <div className="sd-range-foot">
                <span>
                  {fmtMoney(data.atl.price)}
                  <em>ATL · {fmtDateFull(data.atl.date)}</em>
                </span>
                <span className="hi">
                  {fmtMoney(data.ath.price)}
                  <em>ATH · {fmtDateFull(data.ath.date)}</em>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="sd-facts-col">
          <div className="sd-facts">
            <div className="sd-facts-head">KEY FACTS</div>
            {/* Null msrp_usd hides BOTH MSRP rows (spec §3.1) — today's normal
                until decision D6 seeds it, not an edge case. */}
            {product.msrpUsd != null && (
              <div className="sd-fact">
                <span className="fk">MSRP</span>
                <span className="fv">{fmtMoney(product.msrpUsd)}</span>
              </div>
            )}
            {product.msrpUsd != null && (
              <div className="sd-fact">
                <span className="fk">VS MSRP</span>
                <span className={`fv ${deltaCls(data.vsMsrp)}`}>{fmtPct(data.vsMsrp)}</span>
              </div>
            )}
            <div className="sd-fact">
              <span className="fk">RELEASED</span>
              <span className="fv">
                {product.releaseDate ? fmtDateFull(product.releaseDate) : EM}
              </span>
            </div>
            <div className="sd-fact">
              <span className="fk">SET VALUE</span>
              <span className="fv">{fmtMoney(data.setValue)}</span>
            </div>
            <div className="sd-fact">
              <span className="fk">VALUE RATIO</span>
              <span className="fv">{fmtMult(data.valueRatio)}</span>
            </div>
            <div className="sd-fact">
              <span className="fk">PRICE ACTIVITY</span>
              <span className="fv">{data.priceActivity30d} MOVES · 30D</span>
            </div>
            <div className="sd-fact">
              <span className="fk">LAST MOVE</span>
              <span className="fv">
                {data.lastMoveDays == null ? EM : `${data.lastMoveDays}D AGO`}
              </span>
            </div>
          </div>
          <div className="sd-btn-row">
            {/* Decision D8: no watchlist backend exists — disabled stub. */}
            <button type="button" className="sd-btn primary" disabled title="Coming soon">
              + WATCHLIST
            </button>
            <button
              type="button"
              className="sd-btn"
              onClick={downloadCsv}
              disabled={tableRows.length === 0}
              aria-label={`Download ${tf} price history as CSV`}
            >
              CSV
            </button>
          </div>
        </div>
      </header>

      {/* ================= §3.2 · PRICE HISTORY ================= */}
      <section className="sd-blk">
        <div className="sd-blk-head">
          <div>
            <div className="sd-blk-title">
              Price <em className="sd-script">history</em>
            </div>
            <div className="sd-blk-sub">
              MARKET PRICE · OVERLAY SET VALUE OR RATIO TO COMPARE · SWITCH TO TABLE FOR THE RAW
              SNAPSHOTS
            </div>
          </div>
          <div className="sd-ctl-row">
            {/* Overlay buttons only affect the chart — hidden in table mode
                (spec §3.2: leaving them visible implies they filter columns). */}
            {view === "chart" && (
              <>
                <span className="sd-ov-label">OVERLAY</span>
                <button
                  type="button"
                  className={`sd-ov sv${showSetValue ? " on" : ""}`}
                  aria-pressed={showSetValue}
                  onClick={() => setShowSetValue((v) => !v)}
                >
                  <span className="dash" aria-hidden="true" />
                  SET VALUE
                </button>
                <button
                  type="button"
                  className={`sd-ov rt${showRatio ? " on" : ""}`}
                  aria-pressed={showRatio}
                  onClick={() => setShowRatio((v) => !v)}
                >
                  <span className="dash" aria-hidden="true" />
                  VALUE RATIO
                </button>
              </>
            )}
            <div className="sd-seg tf">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={tf === t.key ? "on" : ""}
                  aria-pressed={tf === t.key}
                  onClick={() => setTf(t.key)}
                >
                  {t.key}
                </button>
              ))}
            </div>
            <div className="sd-seg pv">
              <button
                type="button"
                className={view === "chart" ? "on" : ""}
                aria-pressed={view === "chart"}
                onClick={() => setView("chart")}
              >
                CHART
              </button>
              <button
                type="button"
                className={view === "table" ? "on" : ""}
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                TABLE
              </button>
            </div>
          </div>
        </div>

        {windowPoints.length === 0 ? (
          <div className="sd-card">
            <div className="sd-chart-empty">NO PRICE HISTORY RECORDED YET</div>
          </div>
        ) : view === "chart" ? (
          <div className="sd-card">
            <div className="sd-chart-wrap">
              <div className="sd-axis-label">{axisLabel}</div>
              <div className="sd-chart-canvas">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
            <div className="sd-card-foot">
              <span className="sd-leg price">━━ BOX PRICE</span>
              {showSetValue && <span className="sd-leg sv">╌╌ SET VALUE</span>}
              {showRatio && <span className="sd-leg rt">╌╌ VALUE RATIO</span>}
              {anyOverlay && (
                <span>SET VALUE &amp; RATIO STEP BETWEEN SNAPSHOTS · CARRIED FORWARD</span>
              )}
              <span className="right">
                {windowPoints.length} POINTS · {windowSpan}
              </span>
            </div>
          </div>
        ) : (
          <div className="sd-card">
            <div className="sd-ph-scroll">
              <table className="sd-ph-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th className="num">BOX PRICE</th>
                    <th className="num">CHANGE</th>
                    <th className="num">SET VALUE</th>
                    <th className="num">RATIO</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.date}>
                      <td>{fmtDateFull(r.date)}</td>
                      <td className="num">{fmtMoneyExact(r.price)}</td>
                      <td className="num">
                        <span className={deltaCls(r.change)}>{fmtPct(r.change)}</span>
                      </td>
                      <td className="num sd-dim">{fmtMoney(r.setValue)}</td>
                      <td className="num">{r.ratio == null ? EM : `${r.ratio.toFixed(2)}×`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sd-card-foot">
              <span>{tableRows.length} SNAPSHOTS · NEWEST FIRST</span>
              <span>{windowSpan}</span>
              <span className="right">{tfCfg.resolution} RESOLUTION</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
