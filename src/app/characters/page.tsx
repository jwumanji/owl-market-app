"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { CHARACTERS, TIER_LABELS, type CharacterData } from "./characters-data";

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

/* ── Character Ranking Card (top row) ── */
function RankCard({ c, rank, active, onClick }: { c: CharacterData; rank: number; active: boolean; onClick: () => void }) {
  const tier = TIER_LABELS[c.tier];
  return (
    <div
      className="ch-rank-card"
      style={{
        ["--ch-color" as string]: c.color,
        ...(active ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}, 0 6px 20px rgba(0,0,0,0.35)` } : {}),
      }}
      onClick={onClick}
    >
      <div className="ch-rank-top">
        <span className="ch-rank-num">#{rank}</span>
        <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
      </div>
      <div className="ch-rank-name">{c.name}</div>
      <div className="ch-rank-sub">{c.subtitle}</div>
      <div className="ch-rank-price">${c.indexValue.toLocaleString()}</div>
      <div className="ch-rank-chg" style={{ color: c.up ? "var(--green)" : "var(--red)" }}>
        {c.up ? "\u2191" : "\u2193"} {Math.abs(c.chg7d)}% <span className="ch-rank-period">7D</span>
      </div>
      <div className="ch-rank-spark">
        <SparkSvg data={c.spark} up={c.up} w={200} h={28} pad={3} />
      </div>
    </div>
  );
}

/* ── Character Pill (rest of list) ── */
function CharPill({ c, rank, active, onClick }: { c: CharacterData; rank: number; active: boolean; onClick: () => void }) {
  return (
    <div className={`ch-pill${active ? " active" : ""}`} onClick={onClick}>
      <span className="ch-pill-rank">#{rank}</span>
      <span className="ch-pill-name" style={{ color: active ? c.color : undefined }}>{c.name}</span>
      <span className="ch-pill-faction">{c.faction}</span>
      <span className="ch-pill-val">${c.indexValue.toLocaleString()}</span>
      <span className="ch-pill-chg" style={{ color: c.up ? "var(--green)" : "var(--red)" }}>
        {c.up ? "+" : "-"}{Math.abs(c.chg7d)}%
      </span>
    </div>
  );
}

/* ── Character Detail Panel ── */
function CharacterDetail({ c }: { c: CharacterData }) {
  const tier = TIER_LABELS[c.tier];
  return (
    <div className="ch-detail">
      <div className="ch-detail-header" style={{ background: `linear-gradient(135deg,${c.colorD},transparent)` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.color},transparent)` }} />
        <div className="ch-detail-badges">
          <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>Tier {tier.label}</span>
          <span className="ch-faction-badge">{c.faction}</span>
        </div>
        <div className="ch-detail-name">{c.name}</div>
        <div className="ch-detail-sub">{c.subtitle}</div>
      </div>
      <div className="ch-detail-stats">
        {[
          ["Character Index", `$${c.indexValue.toLocaleString()}`, c.color],
          ["7D Change", `${c.up ? "+" : ""}${c.chg7d}%`, c.up ? "var(--green)" : "var(--red)"],
          ["30D Change", `${c.chg30d >= 0 ? "+" : ""}${c.chg30d}%`, c.chg30d >= 0 ? "var(--green)" : "var(--red)"],
          ["Cards Tracked", String(c.cardCount), undefined],
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

/* ── Character Cards Table ── */
function CharacterCards({ c }: { c: CharacterData }) {
  return (
    <div className="ch-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span style={{ color: c.color }}>{c.name}</span></div>
          <div className="section-sub">{c.topCards.length} highest value cards across all sets</div>
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
            {c.topCards.map((card, i) => (
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
                <td><span className={`rb ${card.rarityClass}`}>{card.rarity}</span></td>
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

/* ── All Characters Grid ── */
function AllCharactersGrid({ activeSlug, onSelect }: { activeSlug: string; onSelect: (slug: string) => void }) {
  return (
    <div className="ch-all-section">
      <div className="section-header">
        <div>
          <div className="section-title">All Character <span>Rankings</span></div>
          <div className="section-sub">30-day performance index for every tracked character</div>
        </div>
      </div>
      <div className="ch-all-grid">
        {CHARACTERS.map((c, i) => {
          const tier = TIER_LABELS[c.tier];
          return (
            <div
              key={c.slug}
              className="ch-grid-card"
              onClick={() => onSelect(c.slug)}
              style={activeSlug === c.slug ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}` } : undefined}
            >
              <div className="ch-grid-top">
                <div className="ch-grid-rank-row">
                  <span className="ch-grid-rank">#{i + 1}</span>
                  <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
                </div>
                <span className="ch-grid-chg" style={{ color: c.chg30d >= 0 ? "var(--green)" : "var(--red)" }}>
                  {c.chg30d >= 0 ? "+" : ""}{c.chg30d}%
                </span>
              </div>
              <div className="ch-grid-name">{c.name}</div>
              <div className="ch-grid-sub">{c.subtitle}</div>
              <div className="ch-grid-val">${c.indexValue.toLocaleString()}</div>
              <div className="ch-grid-meta">{c.cardCount} cards &middot; {c.faction}</div>
              <div className="ch-grid-spark">
                <SparkSvg data={c.spark} up={c.up} w={200} h={48} pad={4} />
              </div>
              <div className="ch-grid-footer">
                <div className="ch-grid-stat">7D <span style={{ color: c.up ? "var(--green)" : "var(--red)" }}>{c.up ? "+" : ""}{c.chg7d}%</span></div>
                <div className="ch-grid-stat">30D <span style={{ color: c.chg30d >= 0 ? "var(--green)" : "var(--red)" }}>{c.chg30d >= 0 ? "+" : ""}{c.chg30d}%</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function CharactersPage() {
  const [activeChar, setActiveChar] = useState(CHARACTERS[0].slug);

  const c = CHARACTERS.find((x) => x.slug === activeChar) || CHARACTERS[0];

  const selectChar = useCallback((slug: string) => {
    setActiveChar(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Top 5 by index value, rest as pills
  const sorted = [...CHARACTERS].sort((a, b) => b.indexValue - a.indexValue);
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  return (
    <section className="chars-page">
      <div className="breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--text)" }}>Characters</span>
      </div>
      <div className="ph-eyebrow">One Piece TCG</div>
      <div className="ph-title">
        Character <span>Index</span>
      </div>
      <div className="ph-sub">{CHARACTERS.length} characters tracked &middot; Ranked by total card value &middot; Updates with live data</div>

      {/* Top 5 Ranking Cards */}
      <div className="ch-rank-row">
        {top5.map((ch, i) => (
          <RankCard key={ch.slug} c={ch} rank={i + 1} active={activeChar === ch.slug} onClick={() => selectChar(ch.slug)} />
        ))}
      </div>

      {/* Rest as pills */}
      <div className="ch-pill-strip">
        {rest.map((ch, i) => (
          <CharPill key={ch.slug} c={ch} rank={i + 6} active={activeChar === ch.slug} onClick={() => selectChar(ch.slug)} />
        ))}
      </div>

      {/* Detail + Cards */}
      <div className="ch-detail-section">
        <CharacterDetail c={c} />
        <CharacterCards c={c} />
      </div>

      {/* All Characters Grid */}
      <AllCharactersGrid activeSlug={activeChar} onSelect={selectChar} />
    </section>
  );
}
