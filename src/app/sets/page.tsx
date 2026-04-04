"use client";

import { useState, useEffect, useCallback } from "react";
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
import Link from "next/link";
import Image from "next/image";
import {
  SETS as FALLBACK_SETS,
  ALL_SETS_EXTRA as FALLBACK_EXTRA,
  PULL_RATES,
  DEFAULT_PULL_RATES,
  type SetData,
  type ExtraSet,
} from "./sets-data";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

/* ── SVG Sparkline helpers ── */
function sparkPoints(data: number[], W: number, H: number, pad: number) {
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  return data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - mn) / rng) * (H - pad * 2);
    return [+x.toFixed(1), +y.toFixed(1)] as [number, number];
  });
}

function SparkSvg({ data, up, w, h, pad }: { data: number[]; up: boolean; w: number; h: number; pad: number }) {
  const pts = sparkPoints(data, w, h, pad);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const fill = `${pts[0][0]},${h} ${poly} ${pts[pts.length - 1][0]},${h}`;
  const s = up ? "#00D68F" : "#FF4560";
  const f = up ? "rgba(0,214,143,0.13)" : "rgba(255,69,96,0.11)";
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <polygon points={fill} fill={f} />
      <polyline points={poly} fill="none" stroke={s} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3.5} fill={s} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function RowSpark({ data, up }: { data: number[]; up: boolean }) {
  const pts = sparkPoints(data, 88, 22, 2);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const fill = `${pts[0][0]},22 ${poly} ${pts[pts.length - 1][0]},22`;
  const s = up ? "#00D68F" : "#FF4560";
  const f = up ? "rgba(0,214,143,0.13)" : "rgba(255,69,96,0.11)";
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <svg width={88} height={22} viewBox="0 0 88 22" style={{ display: "block", overflow: "visible" }}>
        <polygon points={fill} fill={f} />
        <polyline points={poly} fill="none" stroke={s} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lx} cy={ly} r={2.5} fill={s} />
      </svg>
    </div>
  );
}

/* ── Chart data generator ── */
function generateChartData(s: SetData, period: string) {
  const days: Record<string, number> = { "7d": 7, "1m": 30, "3m": 90, "1y": 365, max: 500 };
  const numDays = days[period] || 7;
  const base = s.price;
  const vol = base * 0.03;
  const trend = s.chg7d / 100;
  const pts: { x: string; y: number }[] = [];
  let p = base * (1 - trend * 0.9);
  for (let i = numDays; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const noise = (Math.random() - 0.46) * vol;
    p = Math.max(p + (trend * base) / numDays + noise, base * 0.2);
    pts.push({ x: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), y: +p.toFixed(2) });
  }
  pts[pts.length - 1].y = base;
  return pts;
}

/* ── Sub-components ── */

function IndexCard({ s, active, onClick }: { s: SetData; active: boolean; onClick: () => void }) {
  return (
    <div
      className="sic"
      style={{
        ["--sic-color" as string]: s.color,
        ...(active ? { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}, 0 6px 20px rgba(0,0,0,0.35)` } : {}),
      }}
      onClick={onClick}
    >
      {active && <style>{`.sic:nth-child(1)::before { opacity: 1 !important; }`}</style>}
      <div className="sic-header">
        <div className="sic-code">{s.code}</div>
        <span className="sic-badge" style={{ background: s.colorD, color: s.color, border: `1px solid ${s.colorBd}` }}>{s.year}</span>
      </div>
      <div className="sic-name">{s.name}</div>
      <div className="sic-price">${s.price.toLocaleString()}</div>
      <div className="sic-chg" style={{ color: s.up ? "var(--green)" : "var(--red)" }}>
        {s.up ? "\u2191" : "\u2193"} {Math.abs(s.chg7d)}%
      </div>
      <div className="sic-spark">
        <SparkSvg data={s.spark} up={s.up} w={200} h={28} pad={3} />
      </div>
    </div>
  );
}

function SetPill({ s, active, onClick }: { s: { slug: string; code: string; name: string; price: number; chg7d: number; up: boolean; color: string }; active: boolean; onClick: () => void }) {
  return (
    <div className={`set-pill${active ? " active" : ""}`} onClick={onClick}>
      <span className="set-pill-code" style={{ color: s.color }}>{s.code}</span>
      <span className="set-pill-name">{s.name}</span>
      <span className="set-pill-val">${s.price.toLocaleString()}</span>
      <span className="set-pill-chg" style={{ color: s.up ? "var(--green)" : "var(--red)" }}>
        {s.up ? "+" : "-"}{Math.abs(s.chg7d)}%
      </span>
    </div>
  );
}

const SETS_WITH_IMAGES = new Set(['op01','op02','op03','op04','op05','op06','op07','op08','op09','op10','op11','op12','op13','op14']);

function setImageSlug(slug: string): string {
  return slug.replace(/-/g, "");
}

function DetailCard({ s }: { s: SetData }) {
  const imgSlug = setImageSlug(s.slug);
  const hasImage = SETS_WITH_IMAGES.has(imgSlug);
  return (
    <div className="set-detail-card">
      <div className="sdc-box-art" style={{ background: `linear-gradient(135deg,${s.colorD} 0%,rgba(3,5,13,0.9) 100%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at center,${s.color}18 0%,transparent 70%)` }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="sdc-box-img" style={{ background: `linear-gradient(145deg,${s.colorD},var(--surf3))` }}>
            {hasImage ? (
              <Image
                src={`/sets/${imgSlug}.jpg`}
                alt={`${s.code} ${s.name} Booster Box`}
                fill
                style={{ objectFit: "cover" }}
                sizes="160px"
              />
            ) : (
              <span style={{ fontSize: 38 }}>{"\uD83C\uDFB4"}</span>
            )}
          </div>
          <div className="sdc-box-label">Booster Box &middot; {s.code}</div>
        </div>
      </div>
      <div className="sdc-header" style={{ background: `linear-gradient(135deg,${s.colorD},transparent)` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.color},transparent)` }} />
        <span className="sdc-code" style={{ background: s.colorD, color: s.color, border: `1px solid ${s.colorBd}` }}>{s.code} &middot; {s.year}</span>
        <div className="sdc-name">{s.name}</div>
        <div className="sdc-desc">One Piece TCG {s.code} booster set &mdash; {s.cards} cards including Commons, Rares, Super Rares, Secret Rares and chase variants.</div>
      </div>
      <div>
        {[
          ["Set Index Value", `$${s.price.toLocaleString()}`, s.color],
          ["24H Change", `${s.up ? "+" : ""}${s.chg1d}%`, s.up ? "var(--green)" : "var(--red)"],
          ["7D Change", `${s.up ? "+" : ""}${s.chg7d}%`, s.up ? "var(--green)" : "var(--red)"],
          ["30D Change", `${s.chg30d >= 0 ? "+" : ""}${s.chg30d}%`, s.chg30d >= 0 ? "var(--green)" : "var(--red)"],
          ["All-Time High", s.ath, undefined],
          ["All-Time Low", s.atl, undefined],
          ["Cards Tracked", String(s.cards), undefined],
          ["24H Volume", s.volume, undefined],
        ].map(([k, v, c]) => (
          <div className="sdc-row" key={k}>
            <span className="sdc-key">{k}</span>
            <span className="sdc-val" style={c ? { color: c } : undefined}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerfStrip({ s }: { s: SetData }) {
  const periods = [
    { k: "h1" as const, l: "1H" },
    { k: "h24" as const, l: "24H" },
    { k: "d7" as const, l: "7D" },
    { k: "m1" as const, l: "1M" },
    { k: "y1" as const, l: "1Y" },
    { k: "max" as const, l: "Max" },
  ];
  return (
    <div className="perf-strip">
      {periods.map((pp, i) => (
        <div className="perf-cell" key={pp.k}>
          <div className="perf-period">{pp.l}</div>
          <div className="perf-val" style={{ color: s.perfUp[i] ? "var(--green)" : "var(--red)" }}>
            {s.perf[pp.k]}
          </div>
        </div>
      ))}
    </div>
  );
}

function IndexChart({ s, activeTime, onTimeChange }: { s: SetData; activeTime: string; onTimeChange: (t: string) => void }) {
  const [chartData, setChartData] = useState(() => generateChartData(s, activeTime));

  useEffect(() => {
    setChartData(generateChartData(s, activeTime));
  }, [s, activeTime]);

  const data = {
    labels: chartData.map((p) => p.x),
    datasets: [
      {
        data: chartData.map((p) => p.y),
        borderColor: s.color,
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return s.colorD;
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, s.color + "30");
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
        ticks: { font: { family: "IBM Plex Mono", size: 10 }, color: "#7A88A8", maxTicksLimit: 6, maxRotation: 0 },
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

  return (
    <div className="index-chart-card">
      <div className="icc-header">
        <div>
          <div className="icc-title">{s.code} {s.name} Index</div>
          <div className="icc-price">${s.price.toLocaleString()}</div>
          <div className="icc-sub">Total card value &middot; {s.cards} cards tracked</div>
        </div>
        <div className="icc-right">
          {["7d", "1m", "3m", "1y", "max"].map((t) => (
            <button key={t} className={`icc-time${activeTime === t ? " on" : ""}`} onClick={() => onTimeChange(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 240 }}>
        <Line data={data} options={options} />
      </div>
      <PerfStrip s={s} />
    </div>
  );
}

function TopCardsTable({ s, sets, activeTab, onTabChange }: { s: SetData; sets: SetData[]; activeTab: string; onTabChange: (slug: string) => void }) {
  const tabSet = sets.find((x) => x.slug === activeTab) || s;
  return (
    <div className="top-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span>{tabSet.code}</span></div>
          <div className="section-sub">Top {tabSet.topCards.length} cards &middot; {tabSet.cards} total in {tabSet.code}</div>
        </div>
        <Link href="/markets" className="section-action">View all in markets &rarr;</Link>
      </div>
      <div className="set-tabs">
        {sets.map((st) => (
          <button
            key={st.slug}
            className={`stab${activeTab === st.slug ? " active" : ""}`}
            style={activeTab === st.slug ? { background: st.colorD, color: st.color, borderColor: st.colorBd } : undefined}
            onClick={() => onTabChange(st.slug)}
          >
            {st.code}
          </button>
        ))}
      </div>
      <div className="cards-table-wrap">
        <table className="cards-table">
          <colgroup>
            <col className="c0" /><col className="c1" /><col className="c2" /><col className="c3" />
            <col className="c4" /><col className="c5" /><col className="c6" /><col className="c7" /><col className="c8" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th><th>Card</th><th>Rarity</th><th className="r">Avg Price</th>
              <th className="r">TCGPlayer</th><th className="r">24H</th><th className="r">7D</th>
              <th className="r">30D</th><th className="r">Last 7 Days</th>
            </tr>
          </thead>
          <tbody>
            {tabSet.topCards.map((c, i) => (
              <tr key={i}>
                <td className="rank-n">{i + 1}</td>
                <td>
                  <div className="card-cell">
                    <div className="card-art">{c.e}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="card-name">{c.n}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                        <span className="card-set-tag">{tabSet.code}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className={`rb ${c.rb}`}>{c.rl}</span></td>
                <td className="price-r">${c.avg.toFixed(2)}</td>
                <td className="price-r">${c.tcg}</td>
                <td className={`chg-r ${c.d1 >= 0 ? "up" : "dn"}`}>{c.d1 >= 0 ? "+" : ""}{c.d1}%</td>
                <td className={`chg-r ${c.d7 >= 0 ? "up" : "dn"}`}>{c.d7 >= 0 ? "+" : ""}{c.d7}%</td>
                <td className={`chg-r ${c.d30 >= 0 ? "up" : "dn"}`}>{c.d30 >= 0 ? "+" : ""}{c.d30}%</td>
                <td><RowSpark data={c.sp} up={c.d7 >= 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PullRatesSection({ s }: { s: SetData }) {
  const rates = PULL_RATES[s.slug] || DEFAULT_PULL_RATES;
  const maxPerPack = Math.max(...rates.map((r) => r.perPack));
  return (
    <div className="pull-rates-section">
      <div className="section-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="section-title">Pull Rates <span>&mdash; {s.code}</span></div>
          <div className="section-sub">Est. odds per box (24 packs) &middot; Community data</div>
        </div>
      </div>
      <div className="pr-grid">
        {rates.map((r) => {
          const packPct = ((r.perPack / maxPerPack) * 100).toFixed(0);
          const boxPct = Math.min((r.perBox / 24) * 100, 100).toFixed(0);
          const casePct = Math.min((r.perCase / 144) * 100, 100).toFixed(0);
          return (
            <div className="pr-card" key={r.code}>
              <div className="pr-badge" style={{ background: r.colorD, color: r.color, border: `1px solid ${r.colorBd}` }}>{r.code}</div>
              <div className="pr-name">{r.name}</div>
              {[
                { label: "Per pack", pct: packPct, val: `${r.perPack.toFixed(1)}%` },
                { label: "Per box", pct: boxPct, val: `~${r.perBox}` },
                { label: "Per case", pct: casePct, val: `~${r.perCase}` },
              ].map((row) => (
                <div className="pr-rate-row" key={row.label}>
                  <span className="pr-rate-label">{row.label}</span>
                  <div className="pr-rate-track">
                    <div className="pr-rate-fill" style={{ width: `${row.pct}%`, background: r.color }} />
                  </div>
                  <span className="pr-rate-num">{row.val}</span>
                </div>
              ))}
              <div className="pr-note">{r.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonGrid({ sets, activeSet, onSelect }: { sets: SetData[]; activeSet: string; onSelect: (slug: string) => void }) {
  return (
    <div className="comparison-section">
      <div className="section-header">
        <div>
          <div className="section-title">All Set <span>Indexes</span></div>
          <div className="section-sub">30-day performance across every set</div>
        </div>
      </div>
      <div className="comp-grid">
        {sets.map((s) => (
          <div
            key={s.slug}
            className="comp-card"
            onClick={() => onSelect(s.slug)}
            style={activeSet === s.slug ? { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}` } : undefined}
          >
            <div className="comp-top">
              <div className="comp-code-row">
                <span className="comp-code">{s.code}</span>
                <span className="comp-badge" style={{ background: s.colorD, color: s.color, border: `1px solid ${s.colorBd}` }}>{s.year}</span>
              </div>
              <span className="comp-chg" style={{ color: s.chg30d >= 0 ? "var(--green)" : "var(--red)" }}>
                {s.chg30d >= 0 ? "+" : ""}{s.chg30d}%
              </span>
            </div>
            <div className="comp-name">{s.name}</div>
            <div className="comp-val">${s.price.toLocaleString()}</div>
            <div className="comp-meta">{s.cards} cards &middot; {s.volume} vol</div>
            <div className="comp-spark">
              <SparkSvg data={s.spark} up={s.up} w={200} h={52} pad={4} />
            </div>
            <div className="comp-footer">
              <div className="comp-stat">7D <span className="comp-stat-val" style={{ color: s.up ? "var(--green)" : "var(--red)" }}>{s.up ? "+" : ""}{s.chg7d}%</span></div>
              <div className="comp-stat">ATH <span className="comp-stat-val">{s.ath}</span></div>
              <div className="comp-stat">Max <span className="comp-stat-val" style={{ color: "var(--green)" }}>+{s.chgMax}%</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function SetsPage() {
  const [sets, setSets] = useState<SetData[]>(FALLBACK_SETS);
  const [extraSets, setExtraSets] = useState<ExtraSet[]>(FALLBACK_EXTRA);
  const [activeSet, setActiveSet] = useState("op01");
  const [activeTime, setActiveTime] = useState("7d");
  const [activeTab, setActiveTab] = useState("op01");

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((data) => {
        if (data.sets?.length > 0) {
          setSets(data.sets);
          setExtraSets(data.extraSets ?? []);
          // Default to the highest-value set
          if (!data.sets.find((s: SetData) => s.slug === activeSet)) {
            setActiveSet(data.sets[0].slug);
            setActiveTab(data.sets[0].slug);
          }
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const s = sets.find((x) => x.slug === activeSet) || sets[0];

  const selectSet = useCallback((slug: string) => {
    setActiveSet(slug);
    setActiveTab(slug);
  }, []);

  const top5 = [...sets].sort((a, b) => b.chg7d - a.chg7d).slice(0, 5);
  const top5Slugs = top5.map((x) => x.slug);
  const remainingSets = [...sets.filter((x) => !top5Slugs.includes(x.slug)), ...extraSets].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return (
    <section className="sets-page">
      <div className="breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--text)" }}>Sets</span>
      </div>
      <div className="ph-eyebrow">One Piece TCG</div>
      <div className="ph-title">
        Set <span>Index</span>
      </div>
      <div className="ph-sub">{sets.length + extraSets.length} sets tracked &middot; Top 5 ranked by 7D momentum &middot; Updates with live data</div>

      <div className="set-index-row">
        {top5.map((st) => (
          <IndexCard key={st.slug} s={st} active={activeSet === st.slug} onClick={() => selectSet(st.slug)} />
        ))}
      </div>

      <div className="set-pill-strip">
        {remainingSets.map((st) => (
          <SetPill key={st.slug} s={st} active={activeSet === st.slug} onClick={() => selectSet(st.slug)} />
        ))}
      </div>

      <div className="detail-section">
        <DetailCard s={s} />
        <IndexChart s={s} activeTime={activeTime} onTimeChange={setActiveTime} />
      </div>

      <TopCardsTable s={s} sets={sets} activeTab={activeTab} onTabChange={setActiveTab} />
      <PullRatesSection s={s} />
      <ComparisonGrid sets={sets} activeSet={activeSet} onSelect={selectSet} />
    </section>
  );
}
