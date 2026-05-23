"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath, gameQueryValue } from "@/lib/game-routes";
import {
  RARITIES as FALLBACK_RARITIES,
  TOP_5_SLUGS,
  TIER_2_SLUGS,
  type RarityData,
} from "./rarities-data";

/* ── Helpers ── */

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
  if (r === "SAR") return "rb-sar";
  if (r === "PROMO") return "rb-promo";
  if (r === "SEALED") return "rb-sealed";
  return "rb-r";
}

function buildTieredRarities(apiData: RarityData[], fallback: RarityData[]) {
  const lookup = new Map<string, RarityData>();
  for (const r of apiData) lookup.set(r.slug, r);
  for (const r of fallback) if (!lookup.has(r.slug)) lookup.set(r.slug, r);

  const top5 = TOP_5_SLUGS.map((s) => lookup.get(s)).filter(Boolean) as RarityData[];
  const tier2 = TIER_2_SLUGS.map((s) => lookup.get(s)).filter(Boolean) as RarityData[];
  return { top5, tier2, all: [...top5, ...tier2] };
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function gameDisplayName(gameRouteSlug: string) {
  if (gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG) return "One Piece TCG";
  return gameRouteSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ── Rarity Ranking Card (top 5) ── */
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
      <div className="ch-rank-sub">{r.cardCount > 0 ? `${r.cardCount} cards tracked` : "Coming soon"}</div>
      <div className="ch-rank-price">
        {r.indexValue > 0 ? `$${r.indexValue.toLocaleString()}` : "\u2014"}
      </div>
      <div
        className="ch-rank-chg"
        style={{
          color:
            r.indexValue <= 0
              ? "var(--ink-3)"
              : r.chg7d === 0
              ? "var(--ink-3)"
              : r.up
              ? "var(--gain-2)"
              : "var(--loss-2)",
        }}
      >
        {r.indexValue > 0 ? (
          <>
            {r.chg7d === 0 ? "" : r.up ? "\u2191" : "\u2193"} {Math.abs(r.chg7d)}% <span className="ch-rank-period">7D</span>
          </>
        ) : (
          "\u00A0"
        )}
      </div>
    </div>
  );
}

/* ── Small Rank Card (tier 2, #6-10) ── */
function SmallRankCard({ r, rank, active, onClick }: { r: RarityData; rank: number; active: boolean; onClick: () => void }) {
  return (
    <div
      className="ch-rank-card ch-rank-card-sm"
      style={{
        ["--ch-color" as string]: r.color,
        ...(active ? { borderColor: r.color, boxShadow: `0 0 0 1px ${r.color}, 0 6px 18px rgba(26, 15, 8, 0.10)` } : {}),
      }}
      onClick={onClick}
    >
      <div className="ch-rank-top">
        <span className="ch-rank-num">#{rank}</span>
        <span className={`rb ${rarityClass(r.code)}`} style={{ fontSize: 9 }}>{r.code}</span>
      </div>
      <div className="ch-rank-name">{r.name}</div>
      <div className="ch-rank-price">${r.indexValue.toLocaleString()}</div>
      <div
        className="ch-rank-chg"
        style={{ color: r.chg7d === 0 ? "var(--ink-3)" : r.up ? "var(--gain-2)" : "var(--loss-2)" }}
      >
        {r.chg7d === 0 ? "" : r.up ? "\u2191" : "\u2193"} {Math.abs(r.chg7d)}% <span className="ch-rank-period">7D</span>
      </div>
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
          <span className="ch-faction-badge">{r.cardCount > 0 ? `${r.cardCount} cards` : "Coming soon"}</span>
        </div>
        <div className="ch-detail-name">{r.name}</div>
        <div className="ch-detail-sub">{r.subtitle}</div>
      </div>
      <div className="ch-detail-stats">
        {r.indexValue > 0 ? (
          [
            ["Rarity Index", `$${r.indexValue.toLocaleString()}`, r.color],
            ["Avg Card Price", `$${r.avgCardPrice.toFixed(2)}`, undefined],
            ["7D Change", `${r.chg7d === 0 ? "" : r.up ? "+" : ""}${r.chg7d}%`, r.chg7d === 0 ? "var(--ink-3)" : r.up ? "var(--gain-2)" : "var(--loss-2)"],
            ["30D Change", `${r.chg30d === 0 ? "" : r.chg30d > 0 ? "+" : ""}${r.chg30d}%`, r.chg30d === 0 ? "var(--ink-3)" : r.chg30d > 0 ? "var(--gain-2)" : "var(--loss-2)"],
            ["Cards Tracked", String(r.cardCount), undefined],
          ].map(([k, v, clr]) => (
            <div className="ch-stat-row" key={k}>
              <span className="ch-stat-key">{k}</span>
              <span className="ch-stat-val" style={clr ? { color: clr } : undefined}>{v}</span>
            </div>
          ))
        ) : (
          <div className="ch-stat-row" style={{ justifyContent: "center", padding: "28px 0", color: "var(--ink-3)" }}>
            Data coming soon
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Rarity Cards Table ── */
function RarityCards({ r, gameRouteSlug }: { r: RarityData; gameRouteSlug: string }) {
  return (
    <div className="ch-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span style={{ color: r.color }}>{r.name}</span></div>
          <div className="section-sub">
            {r.topCards.length > 0
              ? `${r.topCards.length} highest value ${r.code} cards across all sets`
              : "No card data available yet"}
          </div>
        </div>
        <Link href={gamePath(gameRouteSlug, "/markets")} className="section-action">View all in markets &rarr;</Link>
      </div>
      {r.topCards.length > 0 ? (
        <div className="cards-table-wrap">
          <table className="cards-table">
            <colgroup>
              <col className="c0" /><col className="c1" /><col className="c2" /><col className="c3" />
              <col className="c4" /><col className="c5" /><col className="c6" /><col className="c7" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th>Card</th><th>Rarity</th><th className="r">Avg Price</th>
                <th className="r">TCGPlayer</th><th className="r">24H</th><th className="r">7D</th>
                <th className="r">30D</th>
              </tr>
            </thead>
            <tbody>
              {r.topCards.map((card, i) => {
                const href = card.cardImageId ? gamePath(gameRouteSlug, `/card/${card.cardImageId}`) : undefined;
                return (
                <tr key={i} onClick={href ? () => window.location.href = href : undefined} style={href ? { cursor: "pointer" } : undefined} className={href ? "tr-link" : undefined}>
                  <td className="rank-n">{i + 1}</td>
                  <td>
                    <div className="card-cell">
                      {card.imageSmall && (
                        <img src={card.imageSmall} alt="" className="card-thumb" loading="lazy" />
                      )}
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
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rar-coming-soon">
          <p>Data for <strong>{r.name}</strong> is coming soon.</p>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */

export default function RaritiesPage() {
  const params = useParams<{ game?: string | string[] }>();
  const gameRouteSlug = routeParam(params.game) ?? DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const [allRarities, setAllRarities] = useState<RarityData[]>([]);
  const [activeRarity, setActiveRarity] = useState<string>(TOP_5_SLUGS[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = new URLSearchParams({ game: gameQueryValue(gameRouteSlug) });
    fetch(`/api/rarities?${query}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAllRarities(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameRouteSlug]);

  const { top5, tier2, all } = buildTieredRarities(allRarities, FALLBACK_RARITIES);
  const r = all.find((x) => x.slug === activeRarity) || top5[0];
  const showSkeleton = loading || allRarities.length === 0 || !r;

  const selectRarity = useCallback((slug: string) => {
    setActiveRarity(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <section className="rar-page">
      <div className="breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--ink)" }}>Rarities</span>
      </div>
      <div className="ph-eyebrow">{gameDisplayName(gameRouteSlug)}</div>
      <div className="ph-title">
        Rarity <span>Index</span>
      </div>
      <div className="ph-sub">
        {showSkeleton
          ? "Loading live data..."
          : `${all.length} categories tracked \u00B7 Ranked by total card value \u00B7 Updates with live data`}
      </div>

      {showSkeleton ? (
        <>
          <div className="ch-rank-row">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="ch-rank-card" style={{ opacity: 0.5 }}>
                <div className="ch-rank-top"><span className="ch-rank-num">#{i + 1}</span></div>
                <div className="ch-rank-name">&nbsp;</div>
                <div className="ch-rank-sub">&nbsp;</div>
                <div className="ch-rank-price">&mdash;</div>
                <div className="ch-rank-chg">&nbsp;</div>
              </div>
            ))}
          </div>
          <div className="ch-rank-row ch-rank-row-sm">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="ch-rank-card ch-rank-card-sm" style={{ opacity: 0.5 }}>
                <div className="ch-rank-top"><span className="ch-rank-num">#{i + 6}</span></div>
                <div className="ch-rank-name">&nbsp;</div>
                <div className="ch-rank-price">&mdash;</div>
                <div className="ch-rank-chg">&nbsp;</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Top 5 large cards */}
          <div className="ch-rank-row">
            {top5.map((rar, i) => (
              <RankCard key={rar.slug} r={rar} rank={i + 1} active={activeRarity === rar.slug} onClick={() => selectRarity(rar.slug)} />
            ))}
          </div>

          {/* Tier 2 smaller cards (#6-10) */}
          <div className="ch-rank-row ch-rank-row-sm">
            {tier2.map((rar, i) => (
              <SmallRankCard key={rar.slug} r={rar} rank={i + 6} active={activeRarity === rar.slug} onClick={() => selectRarity(rar.slug)} />
            ))}
          </div>

          {/* Detail + Cards table */}
          <div className="ch-detail-section">
            <RarityDetail r={r} />
            <RarityCards r={r} gameRouteSlug={gameRouteSlug} />
          </div>
        </>
      )}

      {/* See All Cards */}
      <div className="rar-see-all">
        <Link href={gamePath(gameRouteSlug, "/markets")} className="rar-see-all-btn">
          See All Cards &rarr;
        </Link>
      </div>
    </section>
  );
}
