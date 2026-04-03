"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { RARITIES as FALLBACK_RARITIES, type RarityData } from "./rarities-data";

/* ── SVG Sparkline ── */
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

function generateSparkFromChange(chg7d: number, chg30d: number): number[] {
  const base = 10;
  const trend = chg30d / 100;
  const pts: number[] = [];
  let p = base * (1 - trend * 0.5);
  for (let i = 0; i < 13; i++) {
    p += (trend * base) / 13 + (Math.random() - 0.45) * 0.5;
    pts.push(+Math.max(p, 1).toFixed(1));
  }
  pts[pts.length - 1] = pts[pts.length - 2] + (chg7d > 0 ? 0.5 : -0.5);
  return pts;
}

function rarityClass(rarity: string): string {
  const r = rarity.toUpperCase();
  if (r.includes("MANGA") || r === "MR") return "rb-mr";
  if (r.includes("GOLDEN") || r === "GMR") return "rb-gmr";
  if (r.includes("SECRET") || r === "SEC") return "rb-sec";
  if (r.includes("SPECIAL") || r === "SP") return "rb-sp";
  if (r.includes("TREAS") || r === "TR") return "rb-tr";
  if (r.includes("ALT") || r === "AA") return "rb-aa";
  if (r.includes("SUPER") || r === "SR") return "rb-sr";
  if (r.includes("LEADER")) return "rb-sr";
  return "rb-r";
}

function ensureSpark(r: RarityData): RarityData {
  if (r.spark && r.spark.length > 1) return r;
  return { ...r, spark: generateSparkFromChange(r.chg7d, r.chg30d) };
}

/* ── Rarity Ranking Card (top row) ── */
function RankCard({ r, rank, active, onClick }: { r: RarityData; rank: number; active: boolean; onClick: () => void }) {
  return (
    <div
      className="ch-rank-card"
      style={{
        ["--ch-color" as string]: r.color,
        ...(active ? { borderColor: r.color, boxShadow: `0 0 0 1px ${r.color}, 0 6px 20px rgba(0,0,0,0.35)` } : {}),
      }}
      onClick={onClick}
    >
      <div className="ch-rank-top">
        <span className="ch-rank-num">#{rank}</span>
        <span className={`rb ${rarityClass(r.code)}`} style={{ fontSize: 10 }}>{r.code}</span>
      </div>
      <div className="ch-rank-name">{r.name}</div>
      <div className="ch-rank-sub">{r.cardCount} cards tracked</div>
      <div className="ch-rank-price">${r.indexValue.toLocaleString()}</div>
      <div className="ch-rank-chg" style={{ color: r.up ? "var(--green)" : "var(--red)" }}>
        {r.up ? "\u2191" : "\u2193"} {Math.abs(r.chg7d)}% <span className="ch-rank-period">7D</span>
      </div>
      <div className="ch-rank-spark">
        <SparkSvg data={r.spark || [0, 0]} up={r.up} w={200} h={28} pad={3} />
      </div>
    </div>
  );
}

/* ── Rarity Pill (rest of list) ── */
function RarPill({ r, rank, active, onClick }: { r: RarityData; rank: number; active: boolean; onClick: () => void }) {
  return (
    <div className={`ch-pill${active ? " active" : ""}`} onClick={onClick}>
      <span className="ch-pill-rank">#{rank}</span>
      <span className="ch-pill-name" style={{ color: active ? r.color : undefined }}>{r.name}</span>
      <span className="ch-pill-faction">
        <span className={`rb ${rarityClass(r.code)}`} style={{ fontSize: 9 }}>{r.code}</span>
      </span>
      <span className="ch-pill-val">${r.indexValue.toLocaleString()}</span>
      <span className="ch-pill-chg" style={{ color: r.up ? "var(--green)" : "var(--red)" }}>
        {r.up ? "+" : "-"}{Math.abs(r.chg7d)}%
      </span>
    </div>
  );
}

/* ── Rarity Detail Panel ── */
function RarityDetail({ r }: { r: RarityData }) {
  return (
    <div className="ch-detail">
      <div className="ch-detail-header" style={{ background: `linear-gradient(135deg,${r.colorD},transparent)` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${r.color},transparent)` }} />
        <div className="rar-code-display" style={{ color: r.color }}>{r.code}</div>
        <div className="ch-detail-badges">
          <span className={`rb ${rarityClass(r.code)}`}>{r.code}</span>
          <span className="ch-faction-badge">{r.cardCount} cards</span>
        </div>
        <div className="ch-detail-name">{r.name}</div>
        <div className="ch-detail-sub">{r.subtitle}</div>
      </div>
      <div className="ch-detail-stats">
        {[
          ["Rarity Index", `$${r.indexValue.toLocaleString()}`, r.color],
          ["Avg Card Price", `$${r.avgCardPrice.toFixed(2)}`, undefined],
          ["7D Change", `${r.up ? "+" : ""}${r.chg7d}%`, r.up ? "var(--green)" : "var(--red)"],
          ["30D Change", `${r.chg30d >= 0 ? "+" : ""}${r.chg30d}%`, r.chg30d >= 0 ? "var(--green)" : "var(--red)"],
          ["Cards Tracked", String(r.cardCount), undefined],
        ].map(([k, v, clr]) => (
          <div className="ch-stat-row" key={k}>
            <span className="ch-stat-key">{k}</span>
            <span className="ch-stat-val" style={clr ? { color: clr } : undefined}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Rarity Cards Table ── */
function RarityCards({ r }: { r: RarityData }) {
  return (
    <div className="ch-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span style={{ color: r.color }}>{r.name}</span></div>
          <div className="section-sub">{r.topCards.length} highest value {r.code} cards across all sets</div>
        </div>
        <Link href="/markets" className="section-action">View all in markets &rarr;</Link>
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
            {r.topCards.map((card, i) => (
              <tr key={i}>
                <td className="rank-n">{i + 1}</td>
                <td>
                  <div className="card-cell">
                    <div style={{ minWidth: 0 }}>
                      <div className="card-name">{card.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                        <span className="card-set-tag">{card.set}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span></td>
                <td className="price-r">${card.avg.toFixed(2)}</td>
                <td className="price-r">${card.tcg}</td>
                <td className={`chg-r ${card.chg1d >= 0 ? "up" : "dn"}`}>{card.chg1d >= 0 ? "+" : ""}{card.chg1d}%</td>
                <td className={`chg-r ${card.chg7d >= 0 ? "up" : "dn"}`}>{card.chg7d >= 0 ? "+" : ""}{card.chg7d}%</td>
                <td className={`chg-r ${card.chg30d >= 0 ? "up" : "dn"}`}>{card.chg30d >= 0 ? "+" : ""}{card.chg30d}%</td>
                <td><RowSpark data={card.spark} up={card.chg7d >= 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── All Rarities Grid ── */
function AllRaritiesGrid({ rarities, activeSlug, onSelect }: { rarities: RarityData[]; activeSlug: string; onSelect: (slug: string) => void }) {
  return (
    <div className="ch-all-section">
      <div className="section-header">
        <div>
          <div className="section-title">All Rarity <span>Rankings</span></div>
          <div className="section-sub">Total value index for every rarity tier</div>
        </div>
      </div>
      <div className="ch-all-grid">
        {rarities.map((r, i) => (
          <div
            key={r.slug}
            className="ch-grid-card"
            onClick={() => onSelect(r.slug)}
            style={activeSlug === r.slug ? { borderColor: r.color, boxShadow: `0 0 0 1px ${r.color}` } : undefined}
          >
            <div className="ch-grid-top">
              <div className="ch-grid-rank-row">
                <span className="ch-grid-rank">#{i + 1}</span>
                <span className={`rb ${rarityClass(r.code)}`} style={{ fontSize: 10 }}>{r.code}</span>
              </div>
              <span className="ch-grid-chg" style={{ color: r.chg30d >= 0 ? "var(--green)" : "var(--red)" }}>
                {r.chg30d >= 0 ? "+" : ""}{r.chg30d}%
              </span>
            </div>
            <div className="ch-grid-name">{r.name}</div>
            <div className="ch-grid-sub">{r.subtitle}</div>
            <div className="ch-grid-val">${r.indexValue.toLocaleString()}</div>
            <div className="ch-grid-meta">{r.cardCount} cards &middot; Avg ${r.avgCardPrice.toFixed(2)}</div>
            <div className="ch-grid-spark">
              <SparkSvg data={r.spark || [0, 0]} up={r.up} w={200} h={48} pad={4} />
            </div>
            <div className="ch-grid-footer">
              <div className="ch-grid-stat">7D <span style={{ color: r.up ? "var(--green)" : "var(--red)" }}>{r.up ? "+" : ""}{r.chg7d}%</span></div>
              <div className="ch-grid-stat">30D <span style={{ color: r.chg30d >= 0 ? "var(--green)" : "var(--red)" }}>{r.chg30d >= 0 ? "+" : ""}{r.chg30d}%</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function RaritiesPage() {
  const [rarities, setRarities] = useState<RarityData[]>(() => FALLBACK_RARITIES.map(ensureSpark));
  const [activeRarity, setActiveRarity] = useState(FALLBACK_RARITIES[0].slug);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rarities")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRarities(data.map(ensureSpark));
          setActiveRarity(data[0].slug);
        }
      })
      .catch(() => {
        // keep fallback data
      })
      .finally(() => setLoading(false));
  }, []);

  const r = rarities.find((x) => x.slug === activeRarity) || rarities[0];

  const selectRarity = useCallback((slug: string) => {
    setActiveRarity(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const top5 = rarities.slice(0, 5);
  const rest = rarities.slice(5);

  return (
    <section className="rar-page">
      <div className="breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--text)" }}>Rarities</span>
      </div>
      <div className="ph-eyebrow">One Piece TCG</div>
      <div className="ph-title">
        Rarity <span>Index</span>
      </div>
      <div className="ph-sub">
        {rarities.length} rarities tracked &middot; Ranked by total card value &middot;
        {loading ? " Loading live data..." : " Updates with live data"}
      </div>

      <div className="ch-rank-row">
        {top5.map((rar, i) => (
          <RankCard key={rar.slug} r={rar} rank={i + 1} active={activeRarity === rar.slug} onClick={() => selectRarity(rar.slug)} />
        ))}
      </div>

      <div className="ch-pill-strip">
        {rest.map((rar, i) => (
          <RarPill key={rar.slug} r={rar} rank={i + 6} active={activeRarity === rar.slug} onClick={() => selectRarity(rar.slug)} />
        ))}
      </div>

      <div className="ch-detail-section">
        <RarityDetail r={r} />
        <RarityCards r={r} />
      </div>

      <AllRaritiesGrid rarities={rarities} activeSlug={activeRarity} onSelect={selectRarity} />
    </section>
  );
}
