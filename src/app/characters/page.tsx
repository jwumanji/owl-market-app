"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CHARACTERS as FALLBACK_CHARS, TIER_LABELS } from "./characters-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath, gameQueryValue } from "@/lib/game-routes";

/* ── Types ── */
interface CharacterCard {
  name: string;
  set: string;
  rarity: string;
  tcg: number;
  avg: number;
  chg1d: number;
  chg7d: number;
  chg30d: number;
  spark: number[];
  imageUrl?: string | null;
  imageUrlSmall?: string | null;
  imageUrlPreview?: string | null;
  cardImageId?: string | null;
}

interface CharacterData {
  slug: string;
  name: string;
  subtitle: string;
  faction: string;
  tier: number;
  indexValue: number;
  cardCount: number;
  chg7d: number;
  chg30d: number;
  up: boolean;
  topCards: CharacterCard[];
  // from static data only:
  color?: string;
  colorD?: string;
  colorBd?: string;
  spark?: number[];
}

// Per-character accent palette — dynamic, not semantic. Hues shifted to
// read well on cream (closer to brand sunset stops + Option-A jewel tones).
const PALETTE = [
  { color: "#C42A45", colorD: "rgba(196,42,69,0.14)",  colorBd: "rgba(196,42,69,0.32)"  }, // secret-red
  { color: "#2D8A57", colorD: "rgba(45,138,87,0.16)",  colorBd: "rgba(45,138,87,0.32)"  }, // sr-green
  { color: "#2E6FD6", colorD: "rgba(46,111,214,0.14)", colorBd: "rgba(46,111,214,0.32)" }, // aa-blue
  { color: "#E89512", colorD: "rgba(232,149,18,0.16)", colorBd: "rgba(232,149,18,0.38)" }, // gold
  { color: "#6E3AA6", colorD: "rgba(110,58,166,0.14)", colorBd: "rgba(110,58,166,0.32)" }, // sp-purple
  { color: "#C43F7E", colorD: "rgba(196,63,126,0.14)", colorBd: "rgba(196,63,126,0.32)" }, // sar-pink
  { color: "#137A8C", colorD: "rgba(19,122,140,0.14)", colorBd: "rgba(19,122,140,0.32)" }, // l-teal
];

function assignColors(chars: CharacterData[]): CharacterData[] {
  return chars.map((c, i) => ({
    ...c,
    color: c.color || PALETTE[i % PALETTE.length].color,
    colorD: c.colorD || PALETTE[i % PALETTE.length].colorD,
    colorBd: c.colorBd || PALETTE[i % PALETTE.length].colorBd,
    spark: c.spark || generateSparkFromChange(c.chg7d, c.chg30d),
  }));
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

function generateSparkFromChange(chg7d: number, chg30d: number): number[] {
  const base = 10;
  const trend = chg30d / 100;
  const pts: number[] = [];
  let p = base * (1 - trend * 0.5);
  for (let i = 0; i < 13; i++) {
    p += (trend * base) / 13 + (Math.random() - 0.45) * 0.5;
    pts.push(+Math.max(p, 1).toFixed(1));
  }
  // nudge final point to reflect 7d direction
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

/** Get character avatar from their top card image */
function getCharAvatar(c: CharacterData): string | null {
  const firstCard = c.topCards?.[0];
  return firstCard?.imageUrlSmall ?? firstCard?.imageUrlPreview ?? firstCard?.imageUrl ?? null;
}

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
  const s = up ? "#2D9961" : "#E04E4E";
  const f = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
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
  const s = up ? "#2D9961" : "#E04E4E";
  const f = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
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

/* ── Character Avatar ── */
function CharAvatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={Math.round(size * 1.4)}
        loading="lazy"
        fetchPriority="low"
        sizes={`${size}px`}
        className="ch-avatar-img"
        style={{ width: size, height: Math.round(size * 1.4) }}
      />
    );
  }
  return (
    <div
      className="ch-avatar-placeholder"
      style={{ width: size, height: Math.round(size * 1.4), fontSize: Math.round(size * 0.35) }}
    >
      {initials}
    </div>
  );
}

/* ── Card Image with Hover Preview ── */
function CardImageCell({ card }: { card: CharacterCard }) {
  const [showPreview, setShowPreview] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowPreview(true), 300);
  };
  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  };
  const imgSrc = card.imageUrlSmall ?? card.imageUrl;
  const fullSrc = card.imageUrlPreview ?? card.imageUrl ?? card.imageUrlSmall;

  return (
    <div
      className="ch-card-img-cell"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {imgSrc ? (
        <Image src={imgSrc} alt={card.name} width={32} height={45} sizes="32px" loading="lazy" fetchPriority="low" className="ch-card-thumb" />
      ) : (
        <div className="ch-card-thumb-placeholder" />
      )}
      {showPreview && fullSrc && (
        <div className="ch-card-hover-preview">
          <Image src={fullSrc} alt={card.name} width={200} height={280} sizes="200px" loading="lazy" />
        </div>
      )}
    </div>
  );
}

/* ── Character Ranking Card (top row) ── */
function RankCard({ c, rank, active, onClick }: { c: CharacterData; rank: number; active: boolean; onClick: () => void }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const color = c.color || "#E89512";
  const avatar = getCharAvatar(c);
  return (
    <div
      className="ch-rank-card"
      style={{
        ["--ch-color" as string]: color,
        ...(active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 6px 20px rgba(0,0,0,0.35)` } : {}),
      }}
      onClick={onClick}
    >
      <div className="ch-rank-top">
        <span className="ch-rank-num">#{rank}</span>
        <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
      </div>
      <div className="ch-rank-name-row">
        <CharAvatar src={avatar} name={c.name} size={24} />
        <div style={{ minWidth: 0 }}>
          <div className="ch-rank-name">{c.name}</div>
          <div className="ch-rank-sub">{c.subtitle}</div>
        </div>
      </div>
      <div className="ch-rank-price">${c.indexValue.toLocaleString()}</div>
      <div
        className="ch-rank-chg"
        style={{ color: c.chg7d === 0 ? "var(--ink-3)" : c.up ? "var(--gain-2)" : "var(--loss-2)" }}
      >
        {c.chg7d === 0 ? "" : c.up ? "\u2191" : "\u2193"} {Math.abs(c.chg7d)}% <span className="ch-rank-period">7D</span>
      </div>
      <div className="ch-rank-spark">
        <SparkSvg data={c.spark || [0, 0]} up={c.up} w={200} h={28} pad={3} />
      </div>
    </div>
  );
}

/* ── Search + All Characters Toolbar ── */
function CharToolbar({
  search,
  onSearchChange,
  characters,
  activeSlug,
  onSelect,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  characters: CharacterData[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sorted = [...characters].sort((a, b) => a.name.localeCompare(b.name));

  // Filter dropdown by search text
  const filtered = search.trim()
    ? sorted.filter(
        (ch) =>
          ch.name.toLowerCase().includes(search.toLowerCase()) ||
          ch.faction.toLowerCase().includes(search.toLowerCase())
      )
    : sorted;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="ch-toolbar">
      {/* Search */}
      <div className="ch-search-wrap">
        <svg className="ch-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          className="ch-search-input"
          placeholder="Search characters..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button className="ch-search-clear" onClick={() => onSearchChange("")}>&times;</button>
        )}
      </div>

      {/* All Characters Dropdown */}
      <div className="ch-dropdown-wrap" ref={dropdownRef}>
        <button
          className={`ch-dropdown-btn${dropdownOpen ? " open" : ""}`}
          onClick={() => setDropdownOpen((o) => !o)}
        >
          All Characters
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={dropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="ch-dropdown-menu">
            {filtered.length === 0 && (
              <div className="ch-dropdown-empty">No characters found</div>
            )}
            {filtered.map((ch) => (
              <div
                key={ch.slug}
                className={`ch-dropdown-item${ch.slug === activeSlug ? " active" : ""}`}
                onClick={() => {
                  onSelect(ch.slug);
                  setDropdownOpen(false);
                }}
              >
                <span className="ch-dropdown-item-name">{ch.name}</span>
                <span className="ch-dropdown-item-val">${ch.indexValue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Character Detail Panel ── */
function CharacterDetail({ c }: { c: CharacterData }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const color = c.color || "#E89512";
  const avatar = getCharAvatar(c);
  const fullImg = c.topCards?.[0]?.imageUrlPreview ?? c.topCards?.[0]?.imageUrl ?? c.topCards?.[0]?.imageUrlSmall ?? null;
  return (
    <div className="ch-detail">
      <div className="ch-detail-header" style={{ background: `linear-gradient(135deg,${c.colorD || "rgba(232,149,18,0.16)"},transparent)` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${color},transparent)` }} />
        <div className="ch-detail-header-inner">
          {fullImg ? (
            <Image src={fullImg} alt={c.name} className="ch-detail-avatar" width={80} height={112} sizes="80px" loading="lazy" />
          ) : avatar ? (
            <Image src={avatar} alt={c.name} className="ch-detail-avatar" width={80} height={112} sizes="80px" loading="lazy" />
          ) : (
            <div className="ch-detail-avatar-placeholder">
              {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="ch-detail-header-info">
            <div className="ch-detail-badges">
              <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>Tier {tier.label}</span>
              <span className="ch-faction-badge">{c.faction}</span>
            </div>
            <div className="ch-detail-name">{c.name}</div>
            <div className="ch-detail-sub">{c.subtitle}</div>
          </div>
        </div>
      </div>
      <div className="ch-detail-stats">
        {[
          ["Character Index", `$${c.indexValue.toLocaleString()}`, color],
          ["7D Change", `${c.chg7d === 0 ? "" : c.up ? "+" : ""}${c.chg7d}%`, c.chg7d === 0 ? "var(--ink-3)" : c.up ? "var(--gain-2)" : "var(--loss-2)"],
          ["30D Change", `${c.chg30d === 0 ? "" : c.chg30d > 0 ? "+" : ""}${c.chg30d}%`, c.chg30d === 0 ? "var(--ink-3)" : c.chg30d > 0 ? "var(--gain-2)" : "var(--loss-2)"],
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
function CharacterCards({ c, gameRouteSlug }: { c: CharacterData; gameRouteSlug: string }) {
  const router = useRouter();

  const openCard = useCallback(
    (card: CharacterCard) => {
      if (card.cardImageId) {
        router.push(gamePath(gameRouteSlug, `/card/${card.cardImageId}`));
      }
    },
    [gameRouteSlug, router]
  );

  return (
    <div className="ch-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span style={{ color: c.color }}>{c.name}</span></div>
          <div className="section-sub">Top {c.topCards.length} highest value cards across all sets</div>
        </div>
        <Link href={gamePath(gameRouteSlug, "/markets")} className="section-action">View all in markets &rarr;</Link>
      </div>
      <div className="cards-table-wrap">
        <table className="cards-table">
          <colgroup>
            <col className="c0" /><col className="c-img" /><col className="c1" /><col className="c2" /><col className="c3" />
            <col className="c4" /><col className="c5" /><col className="c6" /><col className="c7" /><col className="c8" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th><th></th><th>Card</th><th>Rarity</th><th className="r">Avg Price</th>
              <th className="r">TCGPlayer</th><th className="r">24H</th><th className="r">7D</th>
              <th className="r">30D</th><th className="r">Last 7 Days</th>
            </tr>
          </thead>
          <tbody>
            {c.topCards.map((card, i) => (
              <tr
                key={i}
                className={card.cardImageId ? "ch-card-clickable" : ""}
                onClick={card.cardImageId ? () => openCard(card) : undefined}
                onKeyDown={
                  card.cardImageId
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCard(card);
                        }
                      }
                    : undefined
                }
                role={card.cardImageId ? "link" : undefined}
                tabIndex={card.cardImageId ? 0 : undefined}
              >
                <td className="rank-n">{i + 1}</td>
                <td className="ch-card-img-td">
                  <CardImageCell card={card} />
                </td>
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

/* ── All Characters Grid ── */
function AllCharactersGrid({ chars, activeSlug, onSelect }: { chars: CharacterData[]; activeSlug: string; onSelect: (slug: string) => void }) {
  return (
    <div className="ch-all-section">
      <div className="section-header">
        <div>
          <div className="section-title">All Character <span>Rankings</span></div>
          <div className="section-sub">30-day performance index for every tracked character</div>
        </div>
      </div>
      <div className="ch-all-grid">
        {chars.map((c, i) => {
          const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
          const avatar = getCharAvatar(c);
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
                <span
                  className="ch-grid-chg"
                  style={{ color: c.chg30d === 0 ? "var(--ink-3)" : c.chg30d > 0 ? "var(--gain-2)" : "var(--loss-2)" }}
                >
                  {c.chg30d === 0 ? "" : c.chg30d > 0 ? "+" : ""}{c.chg30d}%
                </span>
              </div>
              <div className="ch-grid-name-row">
                <CharAvatar src={avatar} name={c.name} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div className="ch-grid-name">{c.name}</div>
                  <div className="ch-grid-sub">{c.subtitle}</div>
                </div>
              </div>
              <div className="ch-grid-val">${c.indexValue.toLocaleString()}</div>
              <div className="ch-grid-meta">{c.cardCount} cards &middot; {c.faction}</div>
              <div className="ch-grid-spark">
                <SparkSvg data={c.spark || [0, 0]} up={c.up} w={200} h={48} pad={4} />
              </div>
              <div className="ch-grid-footer">
                <div className="ch-grid-stat">7D <span style={{ color: c.chg7d === 0 ? "var(--ink-3)" : c.up ? "var(--gain-2)" : "var(--loss-2)" }}>{c.chg7d === 0 ? "" : c.up ? "+" : ""}{c.chg7d}%</span></div>
                <div className="ch-grid-stat">30D <span style={{ color: c.chg30d === 0 ? "var(--ink-3)" : c.chg30d > 0 ? "var(--gain-2)" : "var(--loss-2)" }}>{c.chg30d === 0 ? "" : c.chg30d > 0 ? "+" : ""}{c.chg30d}%</span></div>
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
  const params = useParams<{ game?: string | string[] }>();
  const gameRouteSlug = routeParam(params.game) ?? DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const isDefaultGame = gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const [characters, setCharacters] = useState<CharacterData[]>(() => isDefaultGame ? assignColors(FALLBACK_CHARS) : []);
  const [activeChar, setActiveChar] = useState(isDefaultGame ? FALLBACK_CHARS[0].slug : "");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (isDefaultGame) {
      setCharacters(assignColors(FALLBACK_CHARS));
      setActiveChar(FALLBACK_CHARS[0].slug);
    } else {
      setCharacters([]);
      setActiveChar("");
    }
    setLoading(true);

    const query = new URLSearchParams({ game: gameQueryValue(gameRouteSlug) });
    fetch(`/api/characters?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCharacters(assignColors(data));
          setActiveChar(data[0].slug);
        } else if (!isDefaultGame) {
          setCharacters([]);
          setActiveChar("");
        }
      })
      .catch(() => {
        if (!isDefaultGame) {
          setCharacters([]);
          setActiveChar("");
        }
      })
      .finally(() => setLoading(false));
  }, [gameRouteSlug, isDefaultGame]);

  const c = characters.find((x) => x.slug === activeChar) || characters[0];
  const hasCharacters = Boolean(c);

  const selectChar = useCallback((slug: string) => {
    setActiveChar(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const top10 = characters.slice(0, 10);

  // Filter characters for search and auto-select first match
  const filteredChars = search.trim()
    ? characters.filter((ch) => ch.name.toLowerCase().includes(search.toLowerCase()) || ch.faction.toLowerCase().includes(search.toLowerCase()))
    : characters;

  // When search text changes, auto-focus on the first matching character
  useEffect(() => {
    if (!search.trim()) return;
    const q = search.toLowerCase();
    const match = characters.find(
      (ch) => ch.name.toLowerCase().includes(q) || ch.faction.toLowerCase().includes(q)
    );
    if (match) setActiveChar(match.slug);
  }, [search, characters]);

  return (
    <section className="chars-page">
      <div className="breadcrumb">
        <Link href="/">OWL Market</Link>
        <span className="bsep"> &rsaquo; </span>
        <span style={{ color: "var(--ink)" }}>Characters</span>
      </div>
      <div className="ph-eyebrow">{gameDisplayName(gameRouteSlug)}</div>
      <div className="ph-title">
        Character <span>Index</span>
      </div>
      <div className="ph-sub">
        {characters.length} characters tracked &middot; Ranked by total card value &middot;
        {loading ? " Loading live data..." : " Updates with live data"}
      </div>

      {!hasCharacters && !loading ? (
        <div className="ch-detail" style={{ padding: 28, textAlign: "center" }}>
          <div className="ch-detail-name">No character index yet</div>
          <div className="ch-detail-sub" style={{ marginTop: 8 }}>
            {gameDisplayName(gameRouteSlug)} has catalog data loaded, but no character taxonomy or pricing index is enabled yet.
          </div>
          <div style={{ marginTop: 18 }}>
            <Link href={gamePath(gameRouteSlug, "/catalog")} className="section-action">
              Open catalog &rarr;
            </Link>
          </div>
        </div>
      ) : hasCharacters ? (
        <>
          {/* Search + All Characters Dropdown */}
          <CharToolbar
            search={search}
            onSearchChange={setSearch}
            characters={characters}
            activeSlug={activeChar}
            onSelect={selectChar}
          />

          {/* Top 10 Rank Cards */}
          <div className="ch-rank-row">
            {top10.map((ch, i) => (
              <RankCard key={ch.slug} c={ch} rank={i + 1} active={activeChar === ch.slug} onClick={() => selectChar(ch.slug)} />
            ))}
          </div>

          {/* Detail + Cards */}
          <div className="ch-detail-section">
            <CharacterDetail c={c} />
            <CharacterCards c={c} gameRouteSlug={gameRouteSlug} />
          </div>

          {/* See All Characters Button / Grid */}
          {!showAll ? (
            <div className="ch-see-all-wrap">
              <button className="ch-see-all-btn" onClick={() => setShowAll(true)}>
                See All Characters
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <AllCharactersGrid chars={filteredChars} activeSlug={activeChar} onSelect={selectChar} />
              <div className="ch-see-all-wrap">
                <button className="ch-see-all-btn" onClick={() => setShowAll(false)}>
                  Collapse
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="ch-detail" style={{ padding: 28, textAlign: "center" }}>
          <div className="ch-detail-sub">Loading character data...</div>
        </div>
      )}
    </section>
  );
}
