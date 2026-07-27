"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type {
  SealedDashboardData,
  SealedPeriodSeries,
  SealedProductRow,
} from "./load-sealed";
import "./terminal.css";

// ---------------------------------------------------------------------------
// SealedTrackerClient — all dashboard interactivity (spec §4).
// Set value and Value Ratio arrive AS PROPS from the server loader —
// market_index_snapshots is service-role-only and must never be fetched from
// here (spec §6). No useSearchParams anywhere on this surface (CLAUDE.md §7).
// ---------------------------------------------------------------------------

const PERIODS = 12;
const EM = "—"; // em-dash — the only rendering for missing values, never 0
const VIEW_STORAGE_KEY = "owl-terminal-sealed-view";

type PeriodKey = "weekly" | "monthly";
type ViewKey = "grid" | "table" | "cards";
type ModeKey = "trending" | "ratio" | "price" | "setval" | "offath" | "release";

const MODE_LABELS: Record<ModeKey, string> = {
  trending: "TRENDING",
  ratio: "VALUE RATIO",
  price: "PRICE",
  setval: "SET VALUE",
  offath: "OFF ATH",
  release: "RELEASE",
};

// offath sorts ascending: values are ≤ 0, so ascending puts furthest-off-ATH first.
const MODE_DESC: Record<ModeKey, boolean> = {
  trending: true,
  ratio: true,
  price: true,
  setval: true,
  offath: false,
  release: true,
};

// -- formatting ---------------------------------------------------------------

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return EM;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function fmtMult(v: number | null | undefined): string {
  if (v == null) return EM;
  return `${v.toFixed(1)}×`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return EM;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** Exactly-zero deltas are --ink-3 (t-flat), never green — spec §4. */
function deltaCls(v: number | null | undefined): string {
  if (v == null || v === 0) return "t-flat";
  return v > 0 ? "t-up" : "t-down";
}

function releaseLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t)
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" })
    .toUpperCase();
}

function productTypeLabel(type: string): string {
  return type.replace(/_/g, " ").toUpperCase();
}

/** Cell background tint by step delta, capped at ±8% (spec §4). Token-derived. */
function tintStyle(v: number | null | undefined): React.CSSProperties | undefined {
  if (v == null) return undefined;
  const abs = Math.abs(v);
  if (abs < 0.15) return undefined;
  const alpha = Math.min(abs / 8, 1) * 0.3 + 0.04;
  const token = v > 0 ? "--gain-2" : "--loss-2";
  return {
    background: `color-mix(in srgb, var(${token}) ${(alpha * 100).toFixed(1)}%, transparent)`,
  };
}

// -- period config ------------------------------------------------------------

type PeriodCfg = {
  labels: string[];
  pre: string;
  step: string;
  trendCol: string;
  trendLabel: string;
  breadth: string;
  series: (p: SealedProductRow) => SealedPeriodSeries;
  trendMetric: (p: SealedProductRow) => number | null;
  deltaCols: Array<{ h: string; get: (p: SealedProductRow) => number | null }>;
};

function buildPeriodCfg(period: PeriodKey, data: SealedDashboardData): PeriodCfg {
  if (period === "weekly") {
    return {
      labels: data.weeklyLabels,
      pre: "W",
      step: "W/W",
      trendCol: "7D %",
      trendLabel: "12W TREND",
      breadth: "THIS WEEK",
      series: (p) => p.weekly,
      trendMetric: (p) => p.d7,
      deltaCols: [
        { h: "7D %", get: (p) => p.d7 },
        { h: "30D %", get: (p) => p.d30 },
        { h: "90D %", get: (p) => p.d90 },
      ],
    };
  }
  return {
    labels: data.monthlyLabels,
    pre: "M",
    step: "M/M",
    trendCol: "M/M %",
    trendLabel: "12M TREND",
    breadth: "THIS MONTH",
    series: (p) => p.monthly,
    trendMetric: (p) => p.mom,
    deltaCols: [
      { h: "M/M %", get: (p) => p.mom },
      { h: "3M %", get: (p) => p.m3 },
      { h: "12M %", get: (p) => p.m12 },
    ],
  };
}

function modeKey(p: SealedProductRow, mode: ModeKey, cfg: PeriodCfg): number | null {
  switch (mode) {
    case "trending":
      return cfg.trendMetric(p);
    case "ratio":
      return p.valueRatio;
    case "price":
      return p.latestPrice;
    case "setval":
      return p.setValue;
    case "offath":
      return p.offAth;
    case "release":
      return p.releaseDate ? Date.parse(p.releaseDate) : null;
  }
}

function metricHeader(mode: ModeKey, cfg: PeriodCfg): string {
  switch (mode) {
    case "trending":
      return cfg.trendCol;
    case "ratio":
      return "BOX / SET / RATIO";
    case "price":
      return "PRICE";
    case "setval":
      return "SET VALUE";
    case "offath":
      return "OFF ATH";
    case "release":
      return "RELEASE";
  }
}

// -- small components ---------------------------------------------------------

function Pct({ v }: { v: number | null | undefined }) {
  return <span className={deltaCls(v)}>{fmtPct(v)}</span>;
}

/**
 * Hand-rolled inline SVG sparkline — spec §4 keeps chart.js OFF this page;
 * one chart instance per row is not worth it.
 */
function Spark({
  series,
  area = false,
  width = 92,
  height = 26,
}: {
  series: (number | null)[];
  area?: boolean;
  width?: number;
  height?: number;
}) {
  const vals = series.filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="t-flat">{EM}</span>;
  const pad = 3;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = pad + (i * (width - 2 * pad)) / (vals.length - 1);
    const y = height - pad - ((v - min) / rng) * (height - 2 * pad);
    return [x, y] as const;
  });
  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1];
  const first = vals[0];
  const cls = last > first ? "t-up" : last < first ? "t-down" : "t-flat";
  const end = pts[pts.length - 1];
  return (
    <svg
      className={`${area ? "" : "t-spark "}${cls}`.trim()}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {area && (
        <polygon
          points={`${pad},${height} ${poly} ${(width - pad).toFixed(1)},${height}`}
          fill="currentColor"
          opacity="0.13"
        />
      )}
      <polyline
        points={poly}
        fill="none"
        stroke="currentColor"
        strokeWidth={area ? 2.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {area && (
        <circle
          cx={end[0].toFixed(1)}
          cy={end[1].toFixed(1)}
          r="3.5"
          fill="var(--bg-2)"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}

function BoxThumb({
  product,
  width,
  height,
  className,
}: {
  product: SealedProductRow;
  width: number;
  height: number;
  className: string;
}) {
  if (product.imageUrl) {
    return (
      <Image
        className={className}
        src={product.imageUrl}
        alt=""
        width={width}
        height={height}
        sizes={`${width}px`}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`${className} t-thumb-fallback`} aria-hidden="true">
      {(product.setCode ?? "?").replace(/-/g, "")}
    </span>
  );
}

// -- main component -----------------------------------------------------------

export default function SealedTrackerClient({ data }: { data: SealedDashboardData }) {
  const [mode, setMode] = useState<ModeKey>("trending");
  const [relDesc, setRelDesc] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("weekly");
  const [view, setViewState] = useState<ViewKey>("grid"); // grid is default and stays default
  const [query, setQuery] = useState("");

  // View preference persists across reloads; read AFTER mount so the server
  // and first client render agree (no hydration mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "table" || stored === "cards") {
        setViewState(stored);
      }
    } catch {
      // storage unavailable — keep the default
    }
  }, []);

  const setView = (v: ViewKey) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // storage unavailable — the choice just won't persist
    }
  };

  const gameName = data.game.name;

  // Spec §4 second empty state: zero set snapshots for this game means SET
  // VALUE and VALUE RATIO do not exist as metrics yet (both read the same
  // service-role-only snapshot table). Hide their chips and columns entirely
  // with a one-line explanation — never a grid of em-dashes.
  const hasRatio = data.hasSetSnapshots;
  const effectiveMode: ModeKey = !hasRatio && (mode === "ratio" || mode === "setval") ? "trending" : mode;
  const isRatio = effectiveMode === "ratio";

  const cfg = useMemo(() => buildPeriodCfg(period, data), [period, data]);

  // Only booster boxes ship in v1 — CASES / DECKS / JP are disabled with SOON.
  const boxes = useMemo(
    () => data.products.filter((p) => p.productType === "booster_box"),
    [data.products]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? boxes.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.setCode ?? "").toLowerCase().includes(q)
        )
      : boxes;
    const desc = effectiveMode === "release" ? relDesc : MODE_DESC[effectiveMode];
    return [...filtered].sort((a, b) => {
      const av = modeKey(a, effectiveMode, cfg);
      const bv = modeKey(b, effectiveMode, cfg);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return desc ? bv - av : av - bv;
    });
  }, [boxes, query, effectiveMode, relDesc, cfg]);

  // Stat rail — recomputed from the active period (and unit-switched in ratio
  // mode), over all boxes rather than the search-filtered subset.
  const rail = useMemo(() => {
    const seriesOf = (p: SealedProductRow) => {
      const s = cfg.series(p);
      return isRatio ? s.ratios : s.prices;
    };
    const nowVals = boxes.map((p) => seriesOf(p)[PERIODS - 1]).filter((v): v is number => v != null);
    const prevVals = boxes.map((p) => seriesOf(p)[PERIODS - 2]).filter((v): v is number => v != null);
    const avg = (vals: number[]) => (vals.length > 0 ? vals.reduce((a, v) => a + v, 0) / vals.length : null);
    const idxNow = avg(nowVals);
    const idxPrev = avg(prevVals);
    const idxDelta = idxNow != null && idxPrev != null && idxPrev !== 0 ? ((idxNow - idxPrev) / idxPrev) * 100 : null;

    const metricOf = (p: SealedProductRow) =>
      isRatio ? cfg.series(p).ratioDeltas[PERIODS - 1] : cfg.trendMetric(p);
    const entries = boxes
      .map((p) => ({ code: p.setCode ?? p.name, d: metricOf(p) }))
      .filter((e): e is { code: string; d: number } => e.d != null);
    const ups = entries.filter((e) => e.d > 0).length;
    const best = entries.length > 0 ? entries.reduce((a, e) => (e.d > a.d ? e : a)) : null;
    const worst = entries.length > 0 ? entries.reduce((a, e) => (e.d < a.d ? e : a)) : null;

    return { idxNow, idxDelta, entries, ups, best, worst };
  }, [boxes, cfg, isRatio]);

  const unit = isRatio ? `RATIO ${cfg.step}` : cfg.step;
  const visibleModes = (Object.keys(MODE_LABELS) as ModeKey[]).filter(
    (m) => hasRatio || (m !== "ratio" && m !== "setval")
  );

  const onChip = (m: ModeKey) => {
    if (m === "release" && effectiveMode === "release") setRelDesc((d) => !d);
    setMode(m);
  };

  // -- cell renderers ---------------------------------------------------------

  const metricCell = (p: SealedProductRow, idx: number) => {
    if (isRatio) {
      const s = cfg.series(p);
      const box = s.prices[PERIODS - 1];
      const sv = s.setValues[PERIODS - 1];
      const r = s.ratios[PERIODS - 1];
      const d = s.ratioDeltas[PERIODS - 1];
      return (
        <td className="t-mcell">
          <span className="t-mrank">#{idx + 1}</span>
          <div className="t-msrow">
            <span className="t-mskey">BOX</span>
            <b>{fmtMoney(box)}</b>
          </div>
          <div className="t-msrow">
            <span className="t-mskey">SET</span>
            <b>{fmtMoney(sv)}</b>
          </div>
          <div className="t-msmult">
            <span className="mv">{fmtMult(r)}</span>
            <span className={`md ${deltaCls(d)}`}>{d == null ? "·" : fmtPct(d)}</span>
          </div>
        </td>
      );
    }
    let value: React.ReactNode;
    let colored: string | null = null;
    switch (effectiveMode) {
      case "trending": {
        const v = cfg.trendMetric(p);
        value = fmtPct(v);
        colored = deltaCls(v);
        break;
      }
      case "price":
        value = fmtMoney(p.latestPrice);
        break;
      case "setval":
        value = fmtMoney(p.setValue);
        break;
      case "offath": {
        value = fmtPct(p.offAth);
        colored = deltaCls(p.offAth);
        break;
      }
      case "release":
        value = releaseLabel(p.releaseDate) ?? EM;
        break;
      default:
        value = EM;
    }
    return (
      <td className="t-mcell">
        <span className="t-mrank">#{idx + 1}</span>
        <span className={`t-mval${colored ? ` ${colored}` : ""}`}>{value}</span>
      </td>
    );
  };

  const productCell = (p: SealedProductRow) => {
    const rel = releaseLabel(p.releaseDate);
    return (
      <td className="t-pcell">
        <div className="t-prod">
          <BoxThumb product={p} width={30} height={40} className="t-boxthumb" />
          <div>
            <div className="t-prodname">
              {p.name}
              {p.atAth && <span className="t-athchip">ATH</span>}
            </div>
            <div className="t-prodmeta">
              {p.setCode ?? EM}
              {rel ? ` · ${rel}` : ""}
            </div>
          </div>
        </div>
      </td>
    );
  };

  // -- views ------------------------------------------------------------------

  const gridView = (
    <div className={`terminal-table-card terminal-grid-view${isRatio ? " ratio-mode" : ""}`}>
      <div className="terminal-scroll">
        <table>
          <thead>
            <tr>
              <th className="t-mhead">{metricHeader(effectiveMode, cfg)}</th>
              <th className="t-phead">PRODUCT</th>
              {cfg.labels.map((label, i) => (
                <th key={label} className={`t-wk${i === PERIODS - 1 ? " now" : ""}`}>
                  {cfg.pre}
                  {i + 1}
                  <small>{label}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => {
              const s = cfg.series(p);
              const series = isRatio ? s.ratios : s.prices;
              const deltas = isRatio ? s.ratioDeltas : s.deltas;
              return (
                <tr key={p.id}>
                  {metricCell(p, idx)}
                  {productCell(p)}
                  {series.map((v, i) => {
                    if (v == null) {
                      // Missing periods are em-dashes, never zeros (spec §4).
                      return (
                        <td key={i}>
                          <span className="t-cell t-flat">{EM}</span>
                        </td>
                      );
                    }
                    const d = deltas[i];
                    return (
                      <td key={i} style={tintStyle(d)}>
                        <span className={`t-cell${i === PERIODS - 1 ? " now" : ""}`}>
                          {isRatio ? fmtMult(v) : fmtMoney(v)}
                          <span className={`t-celld ${deltaCls(d)}`}>
                            {d == null ? "·" : fmtPct(d)}
                          </span>
                          {isRatio && (
                            <span className="t-cellsub">
                              {fmtMoney(s.prices[i])} {"·"} {fmtMoney(s.setValues[i])}
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const tableSortCol: string | null = (() => {
    switch (effectiveMode) {
      case "price":
        return "PRICE";
      case "trending":
        return cfg.trendCol;
      case "setval":
        return "SET VALUE";
      case "ratio":
        return "RATIO";
      case "offath":
        return "OFF ATH";
      default:
        return null;
    }
  })();

  const tableView = (
    <div className="terminal-table-card terminal-table-view">
      <div className="terminal-scroll">
        <table>
          <thead>
            <tr>
              <th className="t-mhead">{isRatio ? "RATIO" : metricHeader(effectiveMode, cfg)}</th>
              <th className="t-phead">PRODUCT</th>
              {[
                "PRICE",
                ...cfg.deltaCols.map((c) => c.h),
                cfg.trendLabel,
                ...(hasRatio ? ["SET VALUE", "RATIO", `RATIO ${cfg.step}`] : []),
                "ATH",
                "OFF ATH",
              ].map((h) => (
                <th key={h} className={`num${h === tableSortCol ? " sorted" : ""}`}>
                  {h}
                  {h === tableSortCol && <span className="t-sort-arrow"> {"▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => {
              const s = cfg.series(p);
              const ratio = s.ratios[PERIODS - 1];
              const ratioDelta = s.ratioDeltas[PERIODS - 1];
              return (
                <tr key={p.id}>
                  {isRatio ? (
                    <td className="t-mcell">
                      <span className="t-mrank">#{idx + 1}</span>
                      <span className="t-mval">{fmtMult(ratio)}</span>
                    </td>
                  ) : (
                    metricCell(p, idx)
                  )}
                  {productCell(p)}
                  <td className="num">{fmtMoney(p.latestPrice)}</td>
                  {cfg.deltaCols.map((c) => (
                    <td key={c.h} className="num">
                      <Pct v={c.get(p)} />
                    </td>
                  ))}
                  <td className="num">
                    <Spark series={s.prices} />
                  </td>
                  {hasRatio && (
                    <>
                      <td className="num t-dim">{fmtMoney(s.setValues[PERIODS - 1])}</td>
                      <td className="num">{fmtMult(ratio)}</td>
                      <td className="num">
                        <Pct v={ratioDelta} />
                      </td>
                    </>
                  )}
                  <td className="num t-dim">{fmtMoney(p.ath)}</td>
                  <td className="num">
                    <Pct v={p.offAth} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const cardsView = (
    <div className="terminal-cards-view">
      {rows.map((p, idx) => {
        const s = cfg.series(p);
        const series = isRatio ? s.ratios : s.prices;
        const live = series.filter((v): v is number => v != null);
        const d = isRatio ? s.ratioDeltas[PERIODS - 1] : cfg.trendMetric(p);
        const fmtV = isRatio ? fmtMult : fmtMoney;
        const startIdx = series.findIndex((v) => v != null);
        const rel = releaseLabel(p.releaseDate);

        let footPrimary: React.ReactNode;
        let footSecondary: React.ReactNode;
        if (isRatio) {
          footPrimary = (
            <div className="t-pc-stat">
              <div className="t-pc-sl">SET VALUE</div>
              <div className="t-pc-sv">{fmtMoney(s.setValues[PERIODS - 1])}</div>
            </div>
          );
          footSecondary = (
            <div className="t-pc-stat active">
              <div className="t-pc-sl">RATIO {cfg.step}</div>
              <div className="t-pc-sv">
                {fmtMult(s.ratios[PERIODS - 1])}{" "}
                <span className={deltaCls(s.ratioDeltas[PERIODS - 1])} style={{ fontSize: 11 }}>
                  {s.ratioDeltas[PERIODS - 1] == null ? "" : fmtPct(s.ratioDeltas[PERIODS - 1])}
                </span>
              </div>
            </div>
          );
        } else {
          const metricValue = (() => {
            switch (effectiveMode) {
              case "trending":
                return <span className={deltaCls(cfg.trendMetric(p))}>{fmtPct(cfg.trendMetric(p))}</span>;
              case "price":
                return fmtMoney(p.latestPrice);
              case "setval":
                return fmtMoney(p.setValue);
              case "offath":
                return <span className={deltaCls(p.offAth)}>{fmtPct(p.offAth)}</span>;
              case "release":
                return rel ?? EM;
              default:
                return EM;
            }
          })();
          const secondary = (() => {
            if (effectiveMode === "setval" && hasRatio) {
              return { label: "RATIO", value: <>{fmtMult(p.valueRatio)}</> };
            }
            if (effectiveMode === "offath") {
              return { label: "ATH", value: <>{fmtMoney(p.ath)}</> };
            }
            return {
              label: "OFF ATH",
              value: <span className={deltaCls(p.offAth)}>{fmtPct(p.offAth)}</span>,
            };
          })();
          footPrimary = (
            <div className="t-pc-stat active">
              <div className="t-pc-sl">{metricHeader(effectiveMode, cfg)}</div>
              <div className="t-pc-sv">{metricValue}</div>
            </div>
          );
          footSecondary = (
            <div className="t-pc-stat">
              <div className="t-pc-sl">{secondary.label}</div>
              <div className="t-pc-sv">{secondary.value}</div>
            </div>
          );
        }

        return (
          <article key={p.id} className={`terminal-pcard${p.atAth ? " at-ath" : ""}`}>
            <div className="t-pc-top">
              <span className="t-pc-rank">#{idx + 1}</span>
              <span className="t-pc-rel">
                {rel ?? EM}
                {p.atAth && (
                  <>
                    {" · "}
                    <span className="t-up">AT ATH</span>
                  </>
                )}
              </span>
            </div>
            <div className="t-pc-body">
              <BoxThumb product={p} width={60} height={80} className="t-pc-art" />
              <div>
                <div className="t-pc-name">{p.name}</div>
                <div className="t-pc-code">
                  {p.setCode ?? EM} {"·"} {productTypeLabel(p.productType)}
                </div>
                <div className="t-pc-price">{fmtMoney(s.prices[PERIODS - 1])}</div>
                <div className="t-pc-delta">
                  <span className={deltaCls(d)}>
                    {d == null ? EM : `${d > 0 ? "▲" : d < 0 ? "▼" : ""} ${fmtPct(d)}`}
                  </span>{" "}
                  <span className="t-flat">{unit}</span>
                </div>
              </div>
            </div>
            <div className="t-pc-sparklabel">
              {isRatio ? "VALUE RATIO" : "BOX PRICE"} {"·"}{" "}
              {startIdx >= 0 ? cfg.labels[startIdx] : EM} {"→"} {cfg.labels[PERIODS - 1]}
            </div>
            <div className="t-pc-spark">
              {live.length >= 2 ? <Spark series={series} area width={260} height={52} /> : <span className="t-flat">{EM}</span>}
            </div>
            <div className="t-pc-range">
              <span>LOW {live.length > 0 ? fmtV(Math.min(...live)) : EM}</span>
              <span>HIGH {live.length > 0 ? fmtV(Math.max(...live)) : EM}</span>
              <span className="t-pc-ath">ATH {fmtMoney(p.ath)}</span>
            </div>
            <div className="t-pc-foot">
              {footPrimary}
              {footSecondary}
            </div>
          </article>
        );
      })}
    </div>
  );

  // -- compose ----------------------------------------------------------------

  return (
    <div className="terminal-dash">
      {/* stat rail — recomputed from the active period (spec §4) */}
      <section className="terminal-stat-rail">
        <div className="terminal-stat">
          <div className="terminal-stat-label">{isRatio ? "AVG VALUE RATIO" : "SEALED INDEX"}</div>
          <div className="terminal-stat-value">
            {isRatio ? fmtMult(rail.idxNow) : fmtMoney(rail.idxNow)}
          </div>
          <div className={`terminal-stat-delta ${deltaCls(rail.idxDelta)}`}>
            {rail.idxDelta == null
              ? EM
              : `${rail.idxDelta > 0 ? "▲ " : rail.idxDelta < 0 ? "▼ " : ""}${fmtPct(rail.idxDelta)} ${cfg.step}`}
          </div>
        </div>
        <div className="terminal-stat">
          <div className="terminal-stat-label">BREADTH {"·"} {cfg.breadth}</div>
          <div className="terminal-stat-value">
            {rail.entries.length > 0 ? `${rail.ups} / ${rail.entries.length} UP` : EM}
          </div>
          <div className="terminal-stat-delta t-flat">
            {rail.entries.length > 0
              ? `${Math.round((rail.ups / rail.entries.length) * 100)}% ADVANCING`
              : EM}
          </div>
        </div>
        <div className="terminal-stat">
          <div className="terminal-stat-label">TOP GAINER {"·"} {unit}</div>
          <div className="terminal-stat-value">{rail.best ? rail.best.code : EM}</div>
          <div className={`terminal-stat-delta ${deltaCls(rail.best?.d)}`}>
            {rail.best ? `▲ ${fmtPct(rail.best.d)}` : EM}
          </div>
        </div>
        <div className="terminal-stat">
          <div className="terminal-stat-label">TOP LOSER {"·"} {unit}</div>
          <div className="terminal-stat-value">{rail.worst ? rail.worst.code : EM}</div>
          <div className={`terminal-stat-delta ${deltaCls(rail.worst?.d)}`}>
            {rail.worst ? `▼ ${fmtPct(rail.worst.d)}` : EM}
          </div>
        </div>
      </section>

      {/* ranking chips */}
      <section className="terminal-rank-bar">
        <span className="terminal-ctl-label">RANK BY</span>
        {visibleModes.map((m) => (
          <button
            key={m}
            type="button"
            className={`terminal-chip${m === effectiveMode ? " on" : ""}`}
            aria-pressed={m === effectiveMode}
            onClick={() => onChip(m)}
          >
            {MODE_LABELS[m]}
            {m === "release" && <span className="dir"> {relDesc ? "↓" : "↑"}</span>}
          </button>
        ))}
      </section>
      {!hasRatio && (
        <p className="terminal-ratio-note">
          SET VALUE &amp; VALUE RATIO UNAVAILABLE {"—"} NO SET-VALUE SNAPSHOTS EXIST FOR{" "}
          {gameName.toUpperCase()} YET.
        </p>
      )}

      {/* controls */}
      <section className="terminal-controls">
        <div className="terminal-search">
          <span className="t-search-glyph" aria-hidden="true">
            {"⌕"}
          </span>
          <input
            type="text"
            placeholder="Search boxes…"
            aria-label="Search boxes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="terminal-seg">
          <button type="button" className="on">
            BOXES
          </button>
          <button type="button" disabled>
            CASES<span className="terminal-soon">SOON</span>
          </button>
          <button type="button" disabled>
            DECKS<span className="terminal-soon">SOON</span>
          </button>
        </div>
        <div className="terminal-seg">
          <button type="button" className="on">
            EN
          </button>
          <button type="button" disabled>
            JP<span className="terminal-soon">SOON</span>
          </button>
        </div>
      </section>

      <section className="terminal-controls second">
        <span className="terminal-ctl-label">PERIOD</span>
        <div className="terminal-seg period">
          <button
            type="button"
            className={period === "weekly" ? "on" : ""}
            onClick={() => setPeriod("weekly")}
          >
            WEEKLY
          </button>
          <button
            type="button"
            className={period === "monthly" ? "on" : ""}
            onClick={() => setPeriod("monthly")}
          >
            MONTHLY
          </button>
        </div>
        <span className="terminal-ctl-label terminal-view-label">VIEW</span>
        <div className="terminal-seg view">
          {/* grid | table | cards — order never changes (spec §4) */}
          <button type="button" className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
            GRID
          </button>
          <button type="button" className={view === "table" ? "on" : ""} onClick={() => setView("table")}>
            TABLE
          </button>
          <button type="button" className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>
            CARDS
          </button>
        </div>
      </section>

      {boxes.length === 0 ? (
        // First empty-state axis: no tracked products for this game at all.
        // Composes with the no-snapshots note above — both can show at once.
        <div className="terminal-empty">
          <div className="terminal-empty-label">No tracked products</div>
          <p className="terminal-empty-body">
            No tracked sealed products for {gameName} yet {"—"} sealed coverage begins with One
            Piece booster boxes.
          </p>
        </div>
      ) : (
        <>
          {view === "grid" && (
            <div className="terminal-legend">
              <span>
                {isRatio ? "RATIO " : ""}
                {cfg.step} CHANGE
              </span>
              <div className="terminal-swatches">
                {[-8, -4, -1.5, 0, 1.5, 4, 8].map((v) => (
                  <div key={v} className="terminal-sw" style={tintStyle(v)} />
                ))}
              </div>
              <span>
                {"−8%"}&nbsp;&nbsp;{"→"}&nbsp;&nbsp;FLAT&nbsp;&nbsp;{"→"}&nbsp;&nbsp;+8%
              </span>
              {isRatio && (
                <span className="terminal-unit-note">
                  {"·"} CELLS = SET VALUE {"÷"} BOX PRICE
                </span>
              )}
            </div>
          )}

          {view === "grid" && gridView}
          {view === "table" && tableView}
          {view === "cards" && cardsView}

          <p className="terminal-footnote">
            PRICES = LAST DAILY SNAPSHOT IN EACH {period === "weekly" ? "7-DAY" : "CALENDAR-MONTH"}{" "}
            PERIOD (JUSTTCG), WHOLE DOLLARS. CELL TINT = {isRatio ? "RATIO " : ""}
            {cfg.step} CHANGE, CAPPED AT {"±"}8%.
            {hasRatio && (
              <>
                <br />
                VALUE RATIO = TOTAL SET SINGLES VALUE {"÷"} BOX PRICE. SET VALUE CARRIES THE
                LATEST SNAPSHOT FORWARD BETWEEN CAPTURES
                {data.latestSnapshotDate ? ` (LAST SNAPSHOT ${data.latestSnapshotDate})` : ""}. ATH
                TRACKED SINCE FIRST SNAPSHOT.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
